import express from "express";
import { createServer as createViteServer } from "vite";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import https from "https";
import fs from "fs";
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Database Setup ---
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

// Create users table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Create agents with keep-alive enabled and SSL verification disabled for IPTV compatibility
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ 
  keepAlive: true,
  rejectUnauthorized: false // MANDATORY: Allow self-signed/invalid certs for IPTV
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing JSON bodies
  app.use(express.json());

  // --- Authentication API ---

  // Register
  app.post("/api/auth/register", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const insert = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
      const info = insert.run(username, hashedPassword);
      
      const token = jwt.sign({ id: info.lastInsertRowid, username }, SECRET_KEY, { expiresIn: '7d' });
      
      res.json({ success: true, token, user: { id: info.lastInsertRowid, username } });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(400).json({ error: "Username already exists" });
      }
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // Login
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    try {
      const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
      const user = stmt.get(username) as any;

      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '7d' });
      
      res.json({ success: true, token, user: { id: user.id, username: user.username } });
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Verify Token (Me)
  app.get("/api/auth/me", (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, SECRET_KEY);
      res.json({ user: decoded });
    } catch (error) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  // --- Channel Management API ---
  const channelsFilePath = path.join(__dirname, 'public', 'channels.json');

  // Helper to read channels
  const readChannels = () => {
    try {
      if (!fs.existsSync(channelsFilePath)) {
        console.log("Channels file not found, returning empty array");
        return [];
      }
      const data = fs.readFileSync(channelsFilePath, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      console.error("Error reading channels:", e);
      return [];
    }
  };

  // Helper to write channels
  const writeChannels = (channels: any[]) => {
    try {
      const dir = path.dirname(channelsFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(channelsFilePath, JSON.stringify(channels, null, 2));
      console.log("Channels saved successfully");
      return true;
    } catch (e) {
      console.error("Error writing channels:", e);
      return false;
    }
  };

  // GET all channels
  app.get("/api/channels", (req, res) => {
    console.log("GET /api/channels");
    const channels = readChannels();
    res.json(channels);
  });

  // POST (Add) a channel
  app.post("/api/channels", (req, res) => {
    console.log("POST /api/channels", req.body);
    const newChannel = req.body;
    if (!newChannel.id || !newChannel.name) {
      return res.status(400).json({ error: "ID and Name are required" });
    }
    const channels = readChannels();
    if (channels.find((c: any) => c.id === newChannel.id)) {
      return res.status(400).json({ error: "Channel ID already exists" });
    }
    channels.push(newChannel);
    if (writeChannels(channels)) {
      res.json(newChannel);
    } else {
      res.status(500).json({ error: "Failed to save channel" });
    }
  });

  // PUT (Update) a channel
  app.put("/api/channels/:id", (req, res) => {
    const { id } = req.params;
    const updatedChannel = req.body;
    const channels = readChannels();
    const index = channels.findIndex((c: any) => c.id === id);
    
    if (index === -1) {
      return res.status(404).json({ error: "Channel not found" });
    }

    channels[index] = { ...channels[index], ...updatedChannel };
    if (writeChannels(channels)) {
      res.json(channels[index]);
    } else {
      res.status(500).json({ error: "Failed to update channel" });
    }
  });

  // DELETE a channel
  app.delete("/api/channels/:id", (req, res) => {
    const { id } = req.params;
    const channels = readChannels();
    const newChannels = channels.filter((c: any) => c.id !== id);
    
    if (channels.length === newChannels.length) {
      return res.status(404).json({ error: "Channel not found" });
    }

    if (writeChannels(newChannels)) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: "Failed to delete channel" });
    }
  });

  // Proxy endpoint to handle HTTP streams in HTTPS environment
  app.get("/api/proxy", async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).send("URL parameter is required");
    }

    // MANDATORY FIX 2: Correct Headers for CORS and Caching
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    try {
      const isHttps = targetUrl.startsWith("https");
      const agent = isHttps ? httpsAgent : httpAgent;
      const urlObj = new URL(targetUrl);

      // Default headers (mimic latest Chrome) - Optimized for High Quality
      let headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Connection": "keep-alive",
        "Accept": "*/*",
        "Accept-Encoding": "identity", // Avoid double compression
        "Referer": urlObj.origin + "/",
        "Origin": urlObj.origin,
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site",
      };

      // Special handling for the 198.x IPTV server (PTV, Willow, T Sports)
      if (targetUrl.includes("198.195.239.50") || targetUrl.includes("103.112.62.174")) {
        headers = {
          "User-Agent": "VLC/3.0.20 LibVLC/3.0.20",
          "Connection": "keep-alive",
          "Accept": "*/*"
        };
      }
      
      // Special handling for roarzone (Sony, Star Sports)
      if (targetUrl.includes("roarzone.info")) {
         // Roarzone often works better with no referer or specific ones
         // Keeping it standard usually works, but ensuring no cache is key
         headers["Cache-Control"] = "no-cache";
         headers["Pragma"] = "no-cache";
      }

      // Special handling for Vercel apps (Jalsha Movies, etc.)
      if (targetUrl.includes("vercel.app")) {
          headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
          try {
            headers["Origin"] = new URL(targetUrl).origin;
            headers["Referer"] = new URL(targetUrl).origin + "/";
          } catch (e) {}
      }

      // MANDATORY FIX 6: Logging upstream requests
      console.log(`[Proxy] Fetching: ${targetUrl} with UA: ${headers['User-Agent']}`);

      const response = await fetch(targetUrl, {
        agent,
        headers,
        timeout: 60000, // Increased to 60s for high-quality segments
        redirect: 'follow'
      });

      // MANDATORY FIX 6 & 7: Log status and handle dead streams
      if (!response.ok) {
        console.error(`[Proxy Error] Upstream ${response.status} ${response.statusText} for ${targetUrl}`);
        return res.status(response.status).send(`Upstream Error: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type");
      
      // MANDATORY FIX 1: Fully rewrite ALL m3u8 playlists
      if (
        targetUrl.includes(".m3u8") || 
        (contentType && (contentType.includes("mpegurl") || contentType.includes("apple.mpegurl")))
      ) {
        let text = await response.text();
        // Use response.url to handle redirects correctly
        const finalUrl = response.url;
        const baseUrl = new URL('.', finalUrl).href;
        
        // Set correct content type for HLS
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");

        const lines = text.split("\n");
        const rewrittenLines = lines.map(line => {
          const trimmedLine = line.trim();
          if (!trimmedLine) return line;

          // Rewrite Key/Map URIs
          if (trimmedLine.startsWith("#")) {
            return trimmedLine.replace(/URI="([^"]+)"/g, (match, p1) => {
              try {
                const fullUrl = new URL(p1, baseUrl).href;
                return `URI="/api/proxy?url=${encodeURIComponent(fullUrl)}"`;
              } catch (e) {
                return match;
              }
            });
          }

          // Rewrite Segment/Playlist URLs (lines that are not comments/tags)
          try {
            const fullUrl = new URL(trimmedLine, baseUrl).href;
            return `/api/proxy?url=${encodeURIComponent(fullUrl)}`;
          } catch (e) {
            return line;
          }
        });
        
        return res.send(rewrittenLines.join("\n"));
      }

      // MANDATORY FIX 2: Streaming binary passthrough for segments (.ts, .m4s, etc.)
      if (contentType) res.setHeader("Content-Type", contentType);
      
      // Pipe the response body directly to the client
      if (response.body) {
        response.body.pipe(res);
        response.body.on('error', (err) => {
            console.error('[Proxy] Stream error:', err);
            res.end();
        });
      } else {
        res.end();
      }

    } catch (error: any) {
      console.error(`[Proxy Fatal] ${error.message} for ${targetUrl}`);
      // Distinguish between timeout and other errors
      const status = error.name === 'AbortError' ? 504 : 500;
      res.status(status).send(`Proxy Error: ${error.message}`);
    }
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

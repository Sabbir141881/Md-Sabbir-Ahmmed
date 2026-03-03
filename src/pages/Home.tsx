import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Play, 
  Pause,
  Tv, 
  Search, 
  ChevronRight,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Trophy,
  Settings,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
// import { Capacitor } from '@capacitor/core';

// --- Types ---
type Category = 'All' | 'Sports' | 'Bangla' | 'Kids' | 'Indian Bangla' | 'Movies' | 'News' | 'Music' | 'Drama' | 'Islamic';

interface Channel {
  id: string;
  name: string;
  logo: string;
  category: Category;
  streamUrl?: string;
}

// --- Mock Data ---
const CATEGORIES: Category[] = ['All', 'Sports', 'Bangla', 'Kids', 'Indian Bangla', 'Movies', 'News', 'Music', 'Drama', 'Islamic'];

// --- HLS Player Component ---
import Hls from 'hls.js';

function VideoPlayer({ url, channelName, isMiniPlayer }: { url: string, channelName: string, isMiniPlayer?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [levels, setLevels] = useState<{ index: number, height: number, bitrate: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1); // -1 is Auto
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showIndicator, setShowIndicator] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Proxy everything to bypass CORS/Security, EXCEPT for the high-performance Bangla streams (gpcdn.net)
  // which are faster when played directly and don't have CORS issues.
  const proxiedUrl = (
    url.startsWith('http://') || 
    !url.includes('gpcdn.net')
  ) ? `/api/proxy?url=${encodeURIComponent(url)}` : url;

  const handleInteraction = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (!showQualityMenu) {
        setShowControls(false);
      }
    }, 5000);
  };

  useEffect(() => {
    handleInteraction();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [showQualityMenu]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
        // Fallback for iOS/Mobile if container fullscreen fails
        if (videoRef.current && videoRef.current.webkitEnterFullscreen) {
           videoRef.current.webkitEnterFullscreen();
        }
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    let hls: Hls | null = null;
    setError(null);
    setShowHelp(false);
    setLevels([]);
    setCurrentLevel(-1);
    setIsLoading(true);
    setShowIndicator(true);
    setIsPlaying(true);

    if (videoRef.current) {
      const video = videoRef.current;

      // Video element event listeners for loading state
      const handleWaiting = () => setIsLoading(true);
      const handlePlaying = () => {
        setIsLoading(false);
        setIsPlaying(true);
        // Hide indicator after 5 seconds of playing
        setTimeout(() => setShowIndicator(false), 5000);
      };
      const handlePause = () => setIsPlaying(false);
      const handleCanPlay = () => setIsLoading(false);

      video.addEventListener('waiting', handleWaiting);
      video.addEventListener('playing', handlePlaying);
      video.addEventListener('pause', handlePause);
      video.addEventListener('canplay', handleCanPlay);

      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false, // Disabled for stability
          backBufferLength: 300, // 5 minutes back buffer
          maxBufferLength: 300, // 5 minutes buffer
          maxMaxBufferLength: 600, // 10 minutes max buffer
          maxBufferSize: 500 * 1000 * 1000, // 500MB buffer size
          liveSyncDuration: 30, // 30s delay for stability
          liveMaxLatencyDuration: 60, // Allow up to 60s latency
          // MANDATORY FIX 4: Robust retry strategy
          manifestLoadingMaxRetry: 10,
          manifestLoadingRetryDelay: 1000,
          levelLoadingMaxRetry: 10,
          levelLoadingRetryDelay: 1000,
          fragLoadingMaxRetry: 20, // High retry count for segments
          fragLoadingRetryDelay: 1000, // Fast retry
          maxBufferHole: 0.5, // Tolerate small holes
          startLevel: -1,
          xhrSetup: (xhr) => {
            xhr.withCredentials = false;
          }
        });
        hlsRef.current = hls;
        hls.loadSource(proxiedUrl);
        hls.attachMedia(video);
        
        hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
          const availableLevels = data.levels.map((level, index) => ({
            index,
            height: level.height,
            bitrate: level.bitrate
          })).sort((a, b) => b.height - a.height);
          setLevels(availableLevels);
          video.play().catch(e => console.log("Auto-play blocked:", e));
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
          if (hls?.autoLevelEnabled) {
            setCurrentLevel(-1);
          } else {
            setCurrentLevel(data.level);
          }
        });

        // MANDATORY FIX 4: Robust Error Handling
        hls.on(Hls.Events.ERROR, (event, data) => {
          console.warn("HLS Error:", data.type, data.details, data.fatal);
          
          // MANDATORY FIX 7: Detect dead streams (403/404)
          if (data.response?.code === 403 || data.response?.code === 404) {
            setError("Stream Offline");
            setIsLoading(false);
            hls?.destroy();
            return;
          }

          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log("Fatal network error encountered, trying to recover...");
                // If recovery fails repeatedly, show mobile app suggestion
                if (data.details === 'manifestLoadError' || data.details === 'levelLoadError') {
                   setError("Network Error: This channel may require the Mobile App to bypass restrictions.");
                   setIsLoading(false);
                   hls?.destroy();
                } else {
                   hls?.startLoad();
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log("Fatal media error encountered, trying to recover...");
                hls?.recoverMediaError();
                break;
              default:
                console.error("Unrecoverable fatal error");
                setError(`Playback failed: ${data.type}`);
                setIsLoading(false);
                hls?.destroy();
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = proxiedUrl;
        video.addEventListener('loadedmetadata', () => {
          video.play().catch(e => console.log("Auto-play blocked:", e));
        });
        video.addEventListener('error', () => {
          setError("Failed to load stream in native player");
          setIsLoading(false);
        });
      }

      return () => {
        video.removeEventListener('waiting', handleWaiting);
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('canplay', handleCanPlay);
        if (hls) {
          hls.destroy();
          hlsRef.current = null;
        }
      };
    }
  }, [proxiedUrl]);

  const changeQuality = (index: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
      setCurrentLevel(index);
      setShowQualityMenu(false);
    }
  };

  const getQualityLabel = (height: number) => {
    if (height >= 1080) return 'Full HD';
    if (height >= 720) return 'HD';
    if (height >= 480) return 'SD';
    return 'Low';
  };

  return (
    <div 
      ref={containerRef}
      className="w-full h-full bg-black relative flex items-center justify-center overflow-hidden rounded-2xl border border-white/5 group"
      onMouseMove={handleInteraction}
      onTouchStart={handleInteraction}
      onClick={handleInteraction}
    >
      {error ? (
        <div className="flex flex-col items-center gap-4 text-center p-8 max-w-md">
          <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mb-2">
            <div className="w-10 h-10 text-red-500">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
          </div>
          
          <div>
            <h3 className="text-xl font-black text-white mb-2 uppercase tracking-tight">Playback Error</h3>
            <p className="text-sm text-gray-400 leading-relaxed">{error}</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <button 
              onClick={() => setShowHelp(true)}
              className="flex-1 px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition-all active:scale-95"
            >
              Help
            </button>
            <button 
              onClick={() => window.location.reload()}
              className="flex-1 px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition-all active:scale-95"
            >
              Retry
            </button>
          </div>

          {showHelp && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 bg-white/5 rounded-xl border border-white/10 text-left"
            >
              <h4 className="text-xs font-black text-amber-500 uppercase mb-3 tracking-widest">Troubleshooting:</h4>
              <ul className="text-xs text-gray-300 space-y-2 list-disc list-inside">
                <li>This stream is being proxied to bypass security blocks.</li>
                <li>If it still fails, the source server might be down.</li>
                <li>Try refreshing the page or selecting another channel.</li>
              </ul>
            </motion.div>
          )}
        </div>
      ) : (
        <>
          <video 
            ref={videoRef} 
            className="w-full h-full object-contain" 
            // controls removed to support custom overlay in fullscreen
            autoPlay 
            playsInline
            onClick={togglePlay}
          />

          {/* Custom Logo Overlay - Top Left */}
          <div className="absolute top-4 left-4 z-30 pointer-events-none select-none">
            <img 
              src="https://i.postimg.cc/T20dxZFZ/1000049192-removebg-preview.png" 
              alt="Status Arbin Logo" 
              className="h-12 md:h-16 object-contain drop-shadow-lg"
            />
          </div>

          {/* Loading Overlay */}
          {isLoading && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-40 pointer-events-none">
              <div className="w-16 h-16 border-4 border-yellow-400/20 border-t-yellow-400 rounded-full animate-spin mb-6" />
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-2"
              >
                <p className="text-xl font-black text-white uppercase tracking-tight">লোড হচ্ছে</p>
                <p className="text-sm text-gray-400 font-medium">কিছুক্ষনের মধ্যে লাইভ চালু হবে।</p>
              </motion.div>
            </div>
          )}
          
          {/* Custom Controls Bar */}
          <div className={`absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-300 z-50 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
            <div className="flex items-center justify-between gap-4">
               {/* Left Controls */}
               <div className="flex items-center gap-4">
                 <button 
                   onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                   className="p-2 rounded-full hover:bg-white/20 text-white transition-colors"
                 >
                   {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
                 </button>
                 
                 <button 
                   onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                   className="p-2 rounded-full hover:bg-white/20 text-white transition-colors group/vol"
                 >
                   {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                 </button>
                 
                 {/* Live Indicator inside controls for mobile */}
                 <div className="flex items-center gap-2 px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-red-500">LIVE</span>
                 </div>
               </div>

               {/* Right Controls */}
               <div className="flex items-center gap-4">
                 {/* Quality Button */}
                 {levels.length > 0 && (
                   <div className="relative">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowQualityMenu(!showQualityMenu);
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-white hover:bg-white/20 transition-all text-xs font-bold"
                      >
                        <Settings className="w-4 h-4" />
                        <span className="hidden sm:inline">{currentLevel === -1 ? 'Auto' : `${levels[currentLevel]?.height}p`}</span>
                      </button>

                      <AnimatePresence>
                        {showQualityMenu && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 10 }}
                            className="absolute bottom-full right-0 mb-4 w-40 bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl"
                          >
                            <div className="p-3 border-b border-white/10 bg-white/5">
                              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Quality</span>
                            </div>
                            <div className="max-h-48 overflow-y-auto custom-scrollbar">
                              <button 
                                onClick={() => changeQuality(-1)}
                                className={`w-full px-4 py-3 text-left text-xs font-bold transition-colors hover:bg-white/10 flex justify-between items-center ${currentLevel === -1 ? 'text-amber-500 bg-white/5' : 'text-gray-300'}`}
                              >
                                <span>Auto</span>
                                {currentLevel === -1 && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                              </button>
                              {levels.map((level) => (
                                <button 
                                  key={level.index}
                                  onClick={() => changeQuality(level.index)}
                                  className={`w-full px-4 py-3 text-left text-xs font-bold transition-colors hover:bg-white/10 flex justify-between items-center ${currentLevel === level.index ? 'text-amber-500 bg-white/5' : 'text-gray-300'}`}
                                >
                                  <span>{level.height}p</span>
                                  {currentLevel === level.index && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                   </div>
                 )}

                 <button 
                   onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                   className="p-2 rounded-full hover:bg-white/20 text-white transition-colors"
                 >
                   {isFullscreen ? <Minimize2 className="w-6 h-6" /> : <Maximize2 className="w-6 h-6" />}
                 </button>
               </div>
            </div>
          </div>
        </>
      )}
      
      {/* Top Right Channel Name Indicator */}
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: showIndicator ? 1 : 0, x: showIndicator ? 0 : 20 }}
        transition={{ duration: 0.5 }}
        className="absolute top-4 right-4 flex items-center gap-2 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 pointer-events-none z-30"
      >
        <span className="text-xs font-black uppercase tracking-widest text-white">{channelName}</span>
      </motion.div>
    </div>
  );
}

// --- Components ---

export default function Home() {
  const [activeCategory, setActiveCategory] = useState<Category>('All');
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isMiniPlayer, setIsMiniPlayer] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (selectedChannel) {
        // Simple scroll threshold: if scrolled down more than 100px, trigger mini-player
        const shouldBeMini = window.scrollY > 100;
        setIsMiniPlayer(shouldBeMini);
      } else {
        setIsMiniPlayer(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [selectedChannel]);

  useEffect(() => {
    const loadChannels = async () => {
      let allChannels: Channel[] = [];
      
      // 1. Fetch static channels
      try {
        const res = await fetch(`/channels.json?t=${new Date().getTime()}`);
        if (res.ok) {
          allChannels = await res.json();
        }
      } catch (err) {
        console.error("Failed to load base channels:", err);
      }

      // 2. Merge with LocalStorage (Client-side overrides for Vercel/Demo)
      try {
        const localData = localStorage.getItem('planet_tv_channels');
        if (localData) {
          const localChannels = JSON.parse(localData);
          const channelMap = new Map();
          allChannels.forEach(c => channelMap.set(c.id, c));
          localChannels.forEach((c: Channel) => channelMap.set(c.id, c));
          allChannels = Array.from(channelMap.values());
        }
      } catch (e) {
        console.error("LocalStorage error", e);
      }

      setChannels(allChannels);
    };

    loadChannels();
  }, []);

  const filteredChannels = activeCategory === 'All' 
    ? channels 
    : channels.filter(c => c.category === activeCategory);

  const handleChannelSelect = (channel: Channel) => {
    setSelectedChannel(channel);
    // Scroll to top smoothly on mobile/desktop
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div ref={topRef} className="min-h-screen bg-[#050505] text-white font-sans selection:bg-yellow-400 selection:text-black overflow-x-hidden relative">
      {/* Immersive Background */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1593784991095-a205069470b6?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-30 blur-[100px] scale-110" />
        <div className="absolute inset-0 bg-gradient-to-tr from-black via-black/80 to-transparent" />
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(250,204,21,0.05),transparent_50%)]" />
      </div>

      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black/50 backdrop-blur-xl border-b border-white/5 h-16 flex items-center justify-between px-4 lg:px-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 lg:w-12 lg:h-12 bg-white/10 rounded-full flex items-center justify-center overflow-hidden border border-white/10 shadow-[0_0_15px_rgba(250,204,21,0.2)]">
            <img 
              src="https://i.postimg.cc/T20dxZFZ/1000049192-removebg-preview.png" 
              alt="Planet TV Logo" 
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h1 className="text-lg lg:text-xl font-black uppercase tracking-tighter leading-none">
              Planet <span className="text-yellow-400">TV</span>
            </h1>
            <p className="text-[8px] lg:text-[10px] font-bold text-white/40 uppercase tracking-[0.3em] leading-none mt-0.5">Premium Live</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
           {/* Admin Button */}
           <a 
            href="/admin"
            className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-white/50 hover:text-yellow-400 transition-colors"
            title="Admin Panel"
          >
            <Settings size={18} />
          </a>
        </div>
      </div>

      {/* Main Layout - Added padding-top for fixed header */}
      <div className="relative z-10 flex flex-col lg:flex-row min-h-screen lg:h-screen pt-20 p-4 lg:p-6 gap-4 lg:gap-6">
        
        {/* Left Section: Video Player */}
        <div ref={videoContainerRef} className="w-full lg:flex-1 flex flex-col gap-4 lg:gap-6 min-h-0 shrink-0 relative">
          {/* Placeholder to prevent layout shift when video becomes fixed */}
          <div className={`w-full aspect-video lg:aspect-auto lg:flex-1 rounded-3xl lg:rounded-[40px] transition-all duration-300 ${isMiniPlayer ? 'opacity-100 bg-white/5 border border-white/5' : 'opacity-0 h-0 lg:h-auto hidden'}`} />

          {/* Video Player Container */}
          <motion.div 
            layout
            drag={isMiniPlayer}
            dragMomentum={false}
            whileDrag={{ scale: 1.05, cursor: 'grabbing' }}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={() => setTimeout(() => setIsDragging(false), 100)}
            onClick={() => {
              if (isMiniPlayer && !isDragging) {
                setIsMiniPlayer(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            style={{ x: isMiniPlayer ? undefined : 0, y: isMiniPlayer ? undefined : 0 }}
            className={`
              bg-white/[0.03] backdrop-blur-2xl border border-white/10 overflow-hidden relative group shadow-2xl transition-all duration-500 ease-in-out
              ${isMiniPlayer 
                ? 'fixed bottom-4 right-4 w-[220px] sm:w-[320px] aspect-video z-[9999] rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.5)] ring-1 ring-white/10 cursor-grab hover:scale-105' 
                : 'w-full aspect-video lg:aspect-auto lg:flex-1 rounded-3xl lg:rounded-[40px]'
              }
            `}
          >
            {/* Close Mini Player Button */}
            {isMiniPlayer && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedChannel(null);
                  setIsMiniPlayer(false);
                }}
                className="absolute top-1 right-1 z-[110] bg-black/60 text-white p-1 rounded-full hover:bg-black/80 backdrop-blur-sm transition-colors"
              >
                <X size={14} />
              </button>
            )}

            {selectedChannel ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-black">
                {selectedChannel.streamUrl ? (
                  <VideoPlayer url={selectedChannel.streamUrl} channelName={selectedChannel.name} isMiniPlayer={isMiniPlayer} />
                ) : (
                  <div className="relative w-full h-full">
                    <img 
                      src={`https://picsum.photos/seed/${selectedChannel.id}/1920/1080`} 
                      className="w-full h-full object-cover opacity-60 transition-transform duration-700 group-hover:scale-105"
                      alt="Stream Placeholder"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
                      <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="w-16 h-16 lg:w-24 lg:h-24 bg-yellow-400 rounded-full flex items-center justify-center text-black shadow-[0_0_50px_rgba(250,204,21,0.4)]"
                      >
                        <Play size={32} lg:size={48} fill="currentColor" className="ml-1 lg:ml-2" />
                      </motion.div>
                      <motion.h2 
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="mt-4 lg:mt-8 text-2xl lg:text-4xl font-black tracking-tighter uppercase italic text-center"
                      >
                        Now Playing: <span className="text-yellow-400">{selectedChannel.name}</span>
                      </motion.h2>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-4 lg:p-12">
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="space-y-4 lg:space-y-6 w-full max-w-2xl mx-auto"
                >
                  {/* Title Section */}
                  <div className="space-y-4">
                    <p className="text-white/50 font-mono tracking-[0.3em] uppercase text-[10px] lg:text-xs font-bold">Select a channel to start watching</p>
                  </div>
                  
                  {/* Info Grid - Merged from Bottom Bar */}
                  <div className="bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-white/10 p-4 mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-center shadow-lg">
                    {/* Live Indicator */}
                    <div className="flex items-center justify-center gap-3">
                      <div className="relative">
                        <div className="w-2 h-2 lg:w-3 lg:h-3 bg-red-500 rounded-full animate-ping absolute inset-0" />
                        <div className="w-2 h-2 lg:w-3 lg:h-3 bg-red-500 rounded-full relative" />
                      </div>
                      <span className="text-[10px] lg:text-xs font-black uppercase tracking-[0.2em] text-red-500">Live</span>
                    </div>

                    {/* Instructions */}
                    <div className="flex flex-col items-center justify-center text-center border-y md:border-y-0 md:border-x border-white/10 py-2 md:py-0 px-2">
                      <span className="text-[8px] lg:text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">নির্দেশনা</span>
                      <span className="text-xs lg:text-sm font-medium">লাইভ টিভি দেখতে কয়েকবার ক্লিক করো।</span>
                    </div>

                    {/* Developer Info */}
                    <div className="flex flex-col items-center justify-center text-center">
                      <p className="text-[8px] lg:text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">DEVELOPER BY</p>
                      <p className="text-xs lg:text-sm font-black text-yellow-400 uppercase italic tracking-tighter">MD SABBIR AHMMED</p>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </motion.div>
        </div>

        {/* Right Section: Sidebar */}
        <div className="w-full lg:w-[400px] flex flex-col gap-4 lg:gap-6 h-auto lg:h-full min-h-0">
          
          {/* Instruction Banner */}
          <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-3 flex items-center justify-center gap-2 shadow-lg">
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            <p className="text-[10px] lg:text-xs font-medium text-gray-300 text-center leading-tight">
              কোনো চ্যানেল না চললে, <span className="text-yellow-400 font-bold">অন্য একটি চ্যানেল</span> চালিয়ে পুনরায় চেষ্টা করো
            </p>
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          </div>

          {/* Categories */}
          <div className="bg-white/[0.03] backdrop-blur-2xl rounded-3xl lg:rounded-[32px] border border-white/10 p-2 lg:p-3 shadow-xl">
            <div className="flex overflow-x-auto lg:flex-wrap gap-2 pb-2 lg:pb-0 no-scrollbar">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "flex-none lg:flex-1 min-w-[85px] lg:min-w-[120px] px-2 lg:px-4 py-2 lg:py-3 rounded-xl lg:rounded-2xl text-[8px] lg:text-[10px] font-black uppercase tracking-widest transition-all duration-300",
                    activeCategory === cat 
                      ? "bg-yellow-400 text-black shadow-[0_10px_20px_rgba(250,204,21,0.2)]" 
                      : "text-white/40 hover:text-white hover:bg-white/5"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Channel Grid */}
          <div className="flex-1 bg-white/[0.03] backdrop-blur-2xl rounded-3xl lg:rounded-[40px] border border-white/10 p-4 lg:p-6 overflow-y-auto custom-scrollbar shadow-xl min-h-[400px] lg:min-h-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3 lg:gap-4">
              {filteredChannels.map(channel => (
                <motion.button
                  whileHover={{ y: -5, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  key={channel.id}
                  onClick={() => handleChannelSelect(channel)}
                  className={cn(
                    "aspect-square rounded-2xl lg:rounded-[32px] flex flex-col items-center justify-center transition-all border duration-500 overflow-hidden relative group",
                    selectedChannel?.id === channel.id
                      ? "bg-yellow-400 border-yellow-300 text-black shadow-[0_20px_40px_rgba(250,204,21,0.2)]"
                      : "bg-black/40 border-white/5 hover:border-white/20 text-white"
                  )}
                >
                  {channel.logo ? (
                    <img 
                      src={channel.logo} 
                      alt={channel.name} 
                      className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-all duration-500 group-hover:scale-110"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center opacity-20">
                      <Trophy size={32} lg:size={48} className="mb-2" />
                      <span className="text-[8px] lg:text-[10px] font-bold uppercase">No Logo</span>
                    </div>
                  )}
                  
                  {/* Overlay for channel name */}
                  <div className={cn(
                    "absolute bottom-0 left-0 right-0 p-2 lg:p-3 backdrop-blur-md transition-all duration-500",
                    selectedChannel?.id === channel.id ? "bg-yellow-400/90" : "bg-black/60 group-hover:bg-black/80"
                  )}>
                    <span className="text-[9px] lg:text-[11px] font-black uppercase tracking-tighter text-center leading-tight block truncate">
                      {channel.name}
                    </span>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </div>
  );
}

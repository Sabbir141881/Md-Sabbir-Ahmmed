import { Channel } from '../pages/Home';

const STORAGE_KEY = 'planet_tv_channels';
const DELETED_KEY = 'planet_tv_deleted';

export const ChannelStore = {
  // Fetch channels from API (or file) and merge with LocalStorage
  getChannels: async (): Promise<Channel[]> => {
    let serverChannels: Channel[] = [];
    
    // 1. Try to fetch from API (Dynamic)
    try {
      const res = await fetch('/api/channels');
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          serverChannels = await res.json();
        } else {
           // Fallback to static file if API endpoint missing (e.g. Vercel)
           throw new Error("API not JSON");
        }
      } else {
        throw new Error("API failed");
      }
    } catch (e) {
      // 2. Fallback to static JSON file (Static Host)
      try {
        const res = await fetch('/channels.json');
        if (res.ok) {
           serverChannels = await res.json();
        }
      } catch (err) {
        console.error("Failed to load base channels", err);
      }
    }

    // 3. Merge with LocalStorage (Client-side overrides)
    try {
      const localData = localStorage.getItem(STORAGE_KEY);
      const deletedIds = JSON.parse(localStorage.getItem(DELETED_KEY) || '[]');
      
      let localChannels: Channel[] = localData ? JSON.parse(localData) : [];

      // Combine: Server + Local
      // If local has same ID, it overrides server
      const channelMap = new Map<string, Channel>();
      
      serverChannels.forEach(c => channelMap.set(c.id, c));
      localChannels.forEach(c => channelMap.set(c.id, c));

      // Remove deleted
      deletedIds.forEach((id: string) => channelMap.delete(id));

      return Array.from(channelMap.values());
    } catch (e) {
      console.error("LocalStorage error", e);
      return serverChannels;
    }
  },

  // Save a channel
  saveChannel: async (channel: Channel): Promise<void> => {
    // 1. Try Server
    try {
      const method = await ChannelStore.checkApiAvailability() ? 'POST' : 'FAIL';
      if (method !== 'FAIL') {
        // We assume if API exists, we use the specific endpoints
        // But for simplicity in this hybrid mode, let's try the API first
        // If it fails, we fall back.
        // However, determining if it's an update or create is needed for the API
        // The Admin component handles that logic. 
        // Here we just want to know if we should persist locally.
        return; // The component calls the API directly. If it fails, it calls saveLocal.
      }
    } catch (e) {}

    // 2. Save Local
    const localData = localStorage.getItem(STORAGE_KEY);
    let localChannels: Channel[] = localData ? JSON.parse(localData) : [];
    
    const index = localChannels.findIndex(c => c.id === channel.id);
    if (index >= 0) {
      localChannels[index] = channel;
    } else {
      localChannels.push(channel);
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(localChannels));
    
    // Remove from deleted list if it was there (re-adding)
    const deletedIds = JSON.parse(localStorage.getItem(DELETED_KEY) || '[]');
    const newDeleted = deletedIds.filter((id: string) => id !== channel.id);
    localStorage.setItem(DELETED_KEY, JSON.stringify(newDeleted));
  },

  // Delete a channel
  deleteChannel: async (id: string): Promise<void> => {
     // Local Delete
     const localData = localStorage.getItem(STORAGE_KEY);
     let localChannels: Channel[] = localData ? JSON.parse(localData) : [];
     localChannels = localChannels.filter(c => c.id !== id);
     localStorage.setItem(STORAGE_KEY, JSON.stringify(localChannels));

     // Add to deleted list (to hide from server list)
     const deletedIds = JSON.parse(localStorage.getItem(DELETED_KEY) || '[]');
     if (!deletedIds.includes(id)) {
       deletedIds.push(id);
       localStorage.setItem(DELETED_KEY, JSON.stringify(deletedIds));
     }
  },

  // Helper to check if API is alive
  checkApiAvailability: async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/health');
      return res.ok && (res.headers.get("content-type")?.includes("json") ?? false);
    } catch {
      return false;
    }
  }
};

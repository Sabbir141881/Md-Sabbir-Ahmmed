import React, { useState, useEffect } from 'react';
import { Settings, Plus, Edit, Trash2, X, Save, LogOut, Search, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Link } from 'react-router-dom';

// --- Types ---
type Category = 'All' | 'Sports' | 'Bangla' | 'Kids' | 'Indian Bangla' | 'Movies' | 'News' | 'Music' | 'Drama' | 'Islamic';

interface Channel {
  id: string;
  name: string;
  logo: string;
  category: Category;
  streamUrl?: string;
}

const CATEGORIES: Category[] = ['Sports', 'Bangla', 'Kids', 'Indian Bangla', 'Movies', 'News', 'Music', 'Drama', 'Islamic'];

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [formData, setFormData] = useState<Partial<Channel>>({
    category: 'Bangla'
  });

  useEffect(() => {
    if (isAuthenticated) {
      fetchChannels();
    }
  }, [isAuthenticated]);

  const fetchChannels = async () => {
    setIsLoading(true);
    try {
      // Try API first
      const res = await fetch('/api/channels');
      
      // Check if response is JSON (Vercel returns HTML on 404)
      const contentType = res.headers.get("content-type");
      if (res.ok && contentType && contentType.includes("application/json")) {
        const data = await res.json();
        setChannels(data);
      } else {
        // Fallback: Fetch static JSON if API fails (e.g. Vercel)
        console.warn("API not available, falling back to static file + local storage");
        const staticRes = await fetch('/channels.json');
        let staticData = [];
        if (staticRes.ok) {
           staticData = await staticRes.json();
        }
        
        // Merge with LocalStorage for client-side persistence demo
        const localData = localStorage.getItem('planet_tv_channels');
        if (localData) {
          const localChannels = JSON.parse(localData);
          // Simple merge: Local overrides static by ID, or appends
          const channelMap = new Map();
          staticData.forEach((c: Channel) => channelMap.set(c.id, c));
          localChannels.forEach((c: Channel) => channelMap.set(c.id, c));
          setChannels(Array.from(channelMap.values()));
        } else {
          setChannels(staticData);
        }
      }
    } catch (err: any) {
      console.error("Fetch error:", err);
      setError("Failed to load channels. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'Sabbir@9595') {
      setIsAuthenticated(true);
      setError(null);
    } else {
      setError('Invalid Password');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const url = editingChannel 
        ? `/api/channels/${editingChannel.id}`
        : '/api/channels';
      
      const method = editingChannel ? 'PUT' : 'POST';
      
      // Auto-generate ID if new
      let channelId = formData.id;
      if (!channelId) {
        const baseId = formData.name?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'channel';
        channelId = `${baseId}-${Date.now()}`; // Ensure uniqueness
      }

      const payload = {
        ...formData,
        id: channelId
      } as Channel;

      console.log("Sending payload:", payload); // Debug log

      // Try API Save
      let success = false;
      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        const contentType = res.headers.get("content-type");
        if (res.ok && contentType && contentType.includes("application/json")) {
           success = true;
        }
      } catch (e) {
        console.warn("API save failed, falling back to local storage");
      }

      if (!success) {
        // Fallback: Save to LocalStorage
        const localData = localStorage.getItem('planet_tv_channels');
        let localChannels: Channel[] = localData ? JSON.parse(localData) : [];
        
        if (editingChannel) {
          const index = localChannels.findIndex(c => c.id === editingChannel.id);
          if (index !== -1) {
            localChannels[index] = payload;
          } else {
            localChannels.push(payload); // Treat as new if not found locally
          }
        } else {
          localChannels.push(payload);
        }
        
        localStorage.setItem('planet_tv_channels', JSON.stringify(localChannels));
        alert("Note: Changes saved locally (Client-Side) because API is unavailable.");
      }

      await fetchChannels();
      setIsModalOpen(false);
      setEditingChannel(null);
      setFormData({ category: 'Bangla' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this channel?')) return;
    
    setIsLoading(true);
    try {
      let success = false;
      try {
        const res = await fetch(`/api/channels/${id}`, { method: 'DELETE' });
        if (res.ok) success = true;
      } catch (e) {
        console.warn("API delete failed");
      }

      if (!success) {
         // Fallback: Delete from LocalStorage
         const localData = localStorage.getItem('planet_tv_channels');
         if (localData) {
           let localChannels = JSON.parse(localData);
           localChannels = localChannels.filter((c: Channel) => c.id !== id);
           localStorage.setItem('planet_tv_channels', JSON.stringify(localChannels));
           alert("Note: Channel removed locally.");
         }
      }

      await fetchChannels();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const openEditModal = (channel: Channel) => {
    setEditingChannel(channel);
    setFormData(channel);
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingChannel(null);
    setFormData({ category: 'Bangla' });
    setIsModalOpen(true);
  };

  const filteredChannels = channels.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-yellow-400/10 rounded-full flex items-center justify-center text-yellow-400 border border-yellow-400/20">
              <Settings size={40} />
            </div>
          </div>
          <h2 className="text-3xl font-black text-white text-center mb-2 uppercase tracking-tight">Admin Portal</h2>
          <p className="text-gray-400 text-center mb-8 text-sm">Enter your credentials to access the dashboard</p>
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-400 transition-colors placeholder:text-gray-700"
              />
            </div>
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-3 rounded-lg text-center font-medium">
                {error}
              </div>
            )}
            <button
              type="submit"
              className="w-full bg-yellow-400 text-black font-bold py-3.5 rounded-xl hover:bg-yellow-300 transition-all transform active:scale-[0.98] uppercase tracking-wide shadow-lg shadow-yellow-400/20"
            >
              Access Dashboard
            </button>
          </form>
          
          <div className="mt-6 text-center">
            <Link to="/" className="text-gray-500 hover:text-white text-sm transition-colors flex items-center justify-center gap-2">
              <ArrowLeft size={14} /> Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans">
      {/* Top Navigation */}
      <div className="border-b border-white/10 bg-black/50 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tight text-white">Planet TV <span className="text-yellow-400">Admin</span></h1>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center bg-white/5 border border-white/10 rounded-lg px-3 py-2 w-64 focus-within:border-yellow-400/50 transition-colors">
              <Search size={16} className="text-gray-500 mr-2" />
              <input 
                type="text" 
                placeholder="Search channels..." 
                className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-gray-600"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button
              onClick={() => setIsAuthenticated(false)}
              className="flex items-center gap-2 bg-white/5 text-gray-300 px-4 py-2 rounded-lg font-bold hover:bg-white/10 hover:text-white transition-colors text-sm border border-white/5"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Header Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">Channel Management</h2>
            <p className="text-gray-400 text-sm mt-1">Manage your streaming channels efficiently</p>
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center justify-center gap-2 bg-yellow-400 text-black px-6 py-3 rounded-xl font-bold hover:bg-yellow-300 transition-all shadow-lg shadow-yellow-400/20 active:scale-95"
          >
            <Plus size={20} />
            Add New Channel
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl mb-6 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}><X size={16} /></button>
          </div>
        )}

        {/* Channel Table */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-xl backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-white/10 text-xs uppercase tracking-wider text-gray-400 font-bold">
                  <th className="p-4 w-16 text-center">Logo</th>
                  <th className="p-4">Channel Name</th>
                  <th className="p-4">Category</th>
                  <th className="p-4 hidden md:table-cell">Stream URL</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredChannels.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      No channels found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredChannels.map((channel) => (
                    <tr key={channel.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="p-4 text-center">
                        <div className="w-10 h-10 bg-black rounded-lg overflow-hidden border border-white/10 mx-auto">
                          {channel.logo ? (
                            <img src={channel.logo} alt={channel.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-700 text-[8px]">NO IMG</div>
                          )}
                        </div>
                      </td>
                      <td className="p-4 font-medium text-white">{channel.name}</td>
                      <td className="p-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">
                          {channel.category}
                        </span>
                      </td>
                      <td className="p-4 text-gray-500 text-xs font-mono truncate max-w-[200px] hidden md:table-cell">
                        {channel.streamUrl}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditModal(channel)}
                            className="p-2 bg-white/5 rounded-lg hover:bg-white/20 text-white transition-colors"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(channel.id)}
                            className="p-2 bg-red-500/10 rounded-lg hover:bg-red-500/20 text-red-500 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal */}
        <AnimatePresence>
          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
              >
                <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                  <h2 className="text-lg font-bold text-white uppercase tracking-tight flex items-center gap-2">
                    {editingChannel ? <Edit size={18} className="text-yellow-400" /> : <Plus size={18} className="text-yellow-400" />}
                    {editingChannel ? 'Edit Channel' : 'Add New Channel'}
                  </h2>
                  <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                    <X size={20} />
                  </button>
                </div>
                
                <div className="p-6 overflow-y-auto custom-scrollbar">
                  <form id="channelForm" onSubmit={handleSave} className="space-y-5">
                    <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Channel Name</label>
                        <input
                          required
                          value={formData.name || ''}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-400 transition-colors placeholder:text-gray-700"
                          placeholder="e.g. Sony Aath"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Category</label>
                        <select
                          value={formData.category}
                          onChange={(e) => setFormData({ ...formData, category: e.target.value as Category })}
                          className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-400 appearance-none transition-colors cursor-pointer"
                        >
                          {CATEGORIES.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Logo URL</label>
                      <input
                        value={formData.logo || ''}
                        onChange={(e) => setFormData({ ...formData, logo: e.target.value })}
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-400 transition-colors placeholder:text-gray-700"
                        placeholder="https://example.com/logo.png"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Stream URL</label>
                      <input
                        required
                        value={formData.streamUrl || ''}
                        onChange={(e) => setFormData({ ...formData, streamUrl: e.target.value })}
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-400 transition-colors placeholder:text-gray-700 font-mono text-sm"
                        placeholder="http://stream.url/playlist.m3u8"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Channel ID (Optional)</label>
                      <input
                        value={formData.id || ''}
                        onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-400 transition-colors placeholder:text-gray-700 text-sm"
                        placeholder="Auto-generated if empty"
                        disabled={!!editingChannel}
                      />
                      <p className="text-[10px] text-gray-600">Unique identifier for the channel. Cannot be changed once created.</p>
                    </div>
                  </form>
                </div>

                <div className="p-6 border-t border-white/10 bg-white/5 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 bg-white/5 text-white font-bold py-3 rounded-xl hover:bg-white/10 transition-colors text-sm uppercase tracking-wide"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="channelForm"
                    disabled={isLoading}
                    className="flex-1 bg-yellow-400 text-black font-bold py-3 rounded-xl hover:bg-yellow-300 transition-colors flex items-center justify-center gap-2 text-sm uppercase tracking-wide shadow-lg shadow-yellow-400/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    ) : (
                      <>
                        <Save size={18} />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

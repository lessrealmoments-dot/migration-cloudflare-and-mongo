import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Shield, Lock, User } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AdminLogin = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${API}/admin/login`, { username, password });
      localStorage.setItem('adminToken', response.data.access_token);
      toast.success('Admin login successful');
      navigate('/admin/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-zinc-400" strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-medium text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
            Admin Panel
          </h1>
          <p className="text-zinc-500 text-sm mt-2">PhotoShare Administration</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-zinc-800 rounded-lg p-8 space-y-6">
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Username</label>
            <div className="relative">
              <User className="w-5 h-5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.5} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-zinc-700 border border-zinc-600 rounded-sm pl-10 pr-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                placeholder="Enter username"
                required
                data-testid="admin-username"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-2">Password</label>
            <div className="relative">
              <Lock className="w-5 h-5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.5} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-700 border border-zinc-600 rounded-sm pl-10 pr-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                placeholder="Enter password"
                required
                data-testid="admin-password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-zinc-900 hover:bg-zinc-100 h-12 rounded-sm font-medium transition-colors disabled:opacity-50"
            data-testid="admin-login-btn"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-zinc-600 text-sm mt-6">
          <a href="/" className="hover:text-zinc-400 transition-colors">
            ← Back to main site
          </a>
        </p>
      </div>
    </div>
  );
};

export default AdminLogin;

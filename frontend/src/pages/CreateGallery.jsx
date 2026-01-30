import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CreateGallery = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const payload = {
        title: formData.title,
        description: formData.description || null,
        password: formData.password || null
      };

      const response = await axios.post(`${API}/galleries`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success('Gallery created successfully!');
      navigate(`/gallery/${response.data.id}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create gallery');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-zinc-200 bg-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-12 py-6">
          <h1
            className="text-2xl font-medium cursor-pointer"
            style={{ fontFamily: 'Playfair Display, serif' }}
            onClick={() => navigate('/dashboard')}
          >
            PhotoShare
          </h1>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <button
          data-testid="back-button"
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          Back to Dashboard
        </button>

        <h2
          className="text-4xl md:text-5xl font-normal tracking-tight mb-4"
          style={{ fontFamily: 'Playfair Display, serif' }}
        >
          Create New Gallery
        </h2>
        <p className="text-base font-light text-zinc-600 mb-12">
          Set up a new gallery to share with your clients
        </p>

        <form onSubmit={handleSubmit} className="space-y-8" data-testid="create-gallery-form">
          <div>
            <label className="block text-sm font-medium mb-2">Gallery Title *</label>
            <input
              data-testid="gallery-title-input"
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200 focus:border-primary"
              placeholder="e.g., Wedding - Sarah & John"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description (Optional)</label>
            <textarea
              data-testid="gallery-description-input"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="flex min-h-[100px] w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200 focus:border-primary resize-none"
              placeholder="Add a description for your gallery..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Password Protection (Optional)</label>
            <input
              data-testid="gallery-password-input"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200 focus:border-primary"
              placeholder="Leave empty for public access"
            />
            <p className="text-xs text-zinc-500 mt-2">
              If set, guests will need this password to view and upload photos
            </p>
          </div>

          <div className="flex gap-4">
            <button
              data-testid="create-gallery-submit-button"
              type="submit"
              disabled={loading}
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-8 rounded-sm font-medium tracking-wide transition-all duration-300 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Gallery'}
            </button>
            <button
              data-testid="create-gallery-cancel-button"
              type="button"
              onClick={() => navigate('/dashboard')}
              className="border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-8 rounded-sm transition-all duration-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateGallery;
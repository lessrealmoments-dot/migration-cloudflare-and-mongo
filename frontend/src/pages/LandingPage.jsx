import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Camera, Upload, Lock, Share2, Image as ImageIcon } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LandingPage = ({ user }) => {
  const navigate = useNavigate();
  const [config, setConfig] = useState({
    hero_title: 'Share Your Photography, Beautifully',
    hero_subtitle: 'Create stunning galleries, share with clients, and let them upload their own photos. The professional way to showcase and collaborate.',
    brand_name: 'PhotoShare',
    hero_image_1: 'https://images.unsplash.com/photo-1730476513367-16fe58a8a653?crop=entropy&cs=srgb&fm=jpg&q=85',
    hero_image_2: 'https://images.unsplash.com/photo-1729948552636-fe6f7cc88f4a?crop=entropy&cs=srgb&fm=jpg&q=85'
  });

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await axios.get(`${API}/public/landing-config`);
        // Merge with defaults (only override if values exist)
        setConfig(prev => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(response.data).filter(([_, v]) => v)
          )
        }));
      } catch (error) {
        console.error('Using default landing config');
      }
    };
    fetchConfig();
  }, []);

  // Parse hero title for line breaks
  const renderHeroTitle = () => {
    const parts = config.hero_title.split(',');
    if (parts.length > 1) {
      return (
        <>
          {parts[0]},
          <br />
          {parts[1]}
        </>
      );
    }
    return config.hero_title;
  };

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-zinc-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-12 py-6 flex justify-between items-center">
          <h1 className="text-2xl font-medium" style={{ fontFamily: 'Playfair Display, serif' }}>
            {config.brand_name}
          </h1>
          <div className="flex gap-4">
            {user ? (
              <button
                data-testid="nav-dashboard-button"
                onClick={() => navigate('/dashboard')}
                className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-8 rounded-sm font-medium tracking-wide transition-all duration-300"
              >
                Dashboard
              </button>
            ) : (
              <button
                data-testid="nav-login-button"
                onClick={() => navigate('/auth')}
                className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-8 rounded-sm font-medium tracking-wide transition-all duration-300"
              >
                Get Started
              </button>
            )}
          </div>
        </div>
      </nav>

      <section className="max-w-screen-2xl mx-auto px-6 md:px-12 py-24 md:py-32">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="md:col-span-6"
          >
            <p className="text-xs uppercase tracking-[0.2em] font-medium text-muted-foreground mb-6">
              Professional Photo Sharing
            </p>
            <h1
              className="text-5xl md:text-7xl font-medium tracking-tight leading-tight mb-6"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              {renderHeroTitle()}
            </h1>
            <p className="text-lg md:text-xl font-light leading-relaxed text-zinc-600 mb-12 max-w-xl">
              {config.hero_subtitle}
            </p>
            <button
              data-testid="hero-get-started-button"
              onClick={() => navigate(user ? '/dashboard' : '/auth')}
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-12 rounded-sm font-medium tracking-wide transition-all duration-300 text-lg"
            >
              {user ? 'Go to Dashboard' : 'Get Started'}
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="md:col-span-6"
          >
            <div className="grid grid-cols-2 gap-4">
              <img
                src={config.hero_image_1?.startsWith('/api') 
                  ? `${process.env.REACT_APP_BACKEND_URL}${config.hero_image_1}` 
                  : config.hero_image_1
                }
                alt="Gallery sample"
                className="w-full h-auto rounded-sm shadow-sm"
              />
              <img
                src={config.hero_image_2}
                alt="Gallery sample"
                className="w-full h-auto rounded-sm shadow-sm mt-8"
              />
            </div>
          </motion.div>
        </div>
      </section>

      <section className="bg-zinc-50/30 py-24 md:py-32">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-12">
          <p className="text-xs uppercase tracking-[0.2em] font-medium text-muted-foreground mb-6 text-center">
            Features
          </p>
          <h2
            className="text-4xl md:text-5xl font-normal tracking-tight text-center mb-20"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            Everything you need
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center border border-zinc-200 rounded-sm">
                <Camera className="w-8 h-8" strokeWidth={1.5} />
              </div>
              <h3 className="text-2xl md:text-3xl font-normal mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
                Create Galleries
              </h3>
              <p className="text-base font-light leading-relaxed text-zinc-600">
                Organize your photos into beautiful galleries and share them with clients effortlessly.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center border border-zinc-200 rounded-sm">
                <Upload className="w-8 h-8" strokeWidth={1.5} />
              </div>
              <h3 className="text-2xl md:text-3xl font-normal mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
                Guest Uploads
              </h3>
              <p className="text-base font-light leading-relaxed text-zinc-600">
                Let your clients upload their own photos directly to your gallery via a simple link.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center border border-zinc-200 rounded-sm">
                <Lock className="w-8 h-8" strokeWidth={1.5} />
              </div>
              <h3 className="text-2xl md:text-3xl font-normal mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
                Password Protection
              </h3>
              <p className="text-base font-light leading-relaxed text-zinc-600">
                Keep your galleries private with optional password protection for added security.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="max-w-screen-2xl mx-auto px-6 md:px-12 py-24 md:py-32">
        <div className="bg-zinc-50/50 rounded-sm p-12 md:p-20 text-center">
          <h2
            className="text-4xl md:text-5xl font-normal tracking-tight mb-6"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            Ready to share your work?
          </h2>
          <p className="text-lg md:text-xl font-light leading-relaxed text-zinc-600 mb-8 max-w-2xl mx-auto">
            Join photographers who trust PhotoShare for their client galleries.
          </p>
          <button
            data-testid="cta-get-started-button"
            onClick={() => navigate('/auth')}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-12 rounded-sm font-medium tracking-wide transition-all duration-300 text-lg"
          >
            Get Started Free
          </button>
        </div>
      </section>

      <footer className="border-t border-zinc-200 py-12">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-12 flex justify-between items-center text-sm text-zinc-500">
          <p>© 2024 {config.brand_name}. Built for photographers.</p>
          <a 
            href="/admin" 
            className="text-zinc-400 hover:text-zinc-600 transition-colors"
            data-testid="admin-link"
          >
            Admin
          </a>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
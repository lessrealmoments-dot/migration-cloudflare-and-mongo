import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Upload, Lock, Share2, Image as ImageIcon, ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const LandingPage = ({ user }) => {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [config, setConfig] = useState({
    hero_title: 'Share Your Photography, Beautifully',
    hero_subtitle: 'Create stunning galleries, share with clients, and let them upload their own photos. The professional way to showcase and collaborate.',
    brand_name: '',  // Start empty to prevent flash
    brand_tagline: '',
    hero_image_1: null,
    hero_image_2: null,
    hero_image_3: null,
    hero_image_4: null,
    hero_image_5: null,
    hero_image_6: null,
    hero_image_7: null,
    hero_image_8: null,
    hero_image_9: null,
    hero_image_10: null
  });

  // Get all hero images that have values
  const heroImages = [
    config.hero_image_1,
    config.hero_image_2,
    config.hero_image_3,
    config.hero_image_4,
    config.hero_image_5,
    config.hero_image_6,
    config.hero_image_7,
    config.hero_image_8,
    config.hero_image_9,
    config.hero_image_10
  ].filter(img => img && img.trim() !== '');

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
        // Set fallback brand name on error
        setConfig(prev => ({ ...prev, brand_name: 'PhotoShare' }));
      } finally {
        setConfigLoaded(true);
      }
    };
    fetchConfig();
  }, []);

  // Auto-advance carousel
  useEffect(() => {
    if (heroImages.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % heroImages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [heroImages.length]);

  const nextSlide = () => {
    setCurrentSlide(prev => (prev + 1) % heroImages.length);
  };

  const prevSlide = () => {
    setCurrentSlide(prev => (prev - 1 + heroImages.length) % heroImages.length);
  };

  // Get image URL (handles both uploaded and external URLs)
  const getImageUrl = (imageUrl) => {
    if (!imageUrl) return null;
    if (imageUrl.startsWith('/api')) {
      return `${BACKEND_URL}${imageUrl}`;
    }
    return imageUrl;
  };

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
    <div className="min-h-screen bg-white relative">
      <nav className="border-b border-zinc-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-12 py-6 flex justify-between items-center">
          {/* Brand name on left - premium look */}
          <div className="text-left">
            {/* Smart brand name parsing - if contains " by " and no tagline, split it */}
            {(() => {
              let brandMain = config.brand_name;
              let tagline = config.brand_tagline;
              
              // Auto-split if brand_name contains " by " and no separate tagline
              if (!tagline && config.brand_name && config.brand_name.includes(' by ')) {
                const parts = config.brand_name.split(' by ');
                brandMain = parts[0];
                tagline = 'by ' + parts.slice(1).join(' by ');
              }
              
              return (
                <>
                  <h1 
                    className="text-2xl md:text-3xl font-medium tracking-tight"
                    style={{ fontFamily: 'Playfair Display, serif' }}
                  >
                    {brandMain}
                  </h1>
                  {tagline && (
                    <p 
                      className="text-[10px] md:text-xs text-zinc-400 mt-0.5 tracking-widest uppercase"
                      style={{ fontFamily: 'Inter, sans-serif', letterSpacing: '0.12em' }}
                    >
                      {tagline}
                    </p>
                  )}
                </>
              );
            })()}
          </div>
          
          {/* Get Started button on right */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/pricing')}
              className="text-sm text-zinc-600 hover:text-zinc-900 hidden md:block"
            >
              Pricing
            </button>
            {user ? (
              <button
                data-testid="nav-dashboard-button"
                onClick={() => navigate('/dashboard')}
                className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-6 md:px-8 rounded-sm font-medium tracking-wide transition-all duration-300 text-sm md:text-base"
              >
                Dashboard
              </button>
            ) : (
              <button
                data-testid="nav-login-button"
                onClick={() => navigate('/auth')}
                className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-6 md:px-8 rounded-sm font-medium tracking-wide transition-all duration-300 text-sm md:text-base"
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
            {/* Image Carousel */}
            {heroImages.length > 0 ? (
              <div className="relative">
                <div className="relative overflow-hidden rounded-sm shadow-lg aspect-[4/3]">
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={currentSlide}
                      src={getImageUrl(heroImages[currentSlide])}
                      alt={`Gallery sample ${currentSlide + 1}`}
                      className="w-full h-full object-cover"
                      initial={{ opacity: 0, x: 50 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -50 }}
                      transition={{ duration: 0.5 }}
                    />
                  </AnimatePresence>
                </div>
                
                {/* Carousel Controls */}
                {heroImages.length > 1 && (
                  <>
                    <button
                      onClick={prevSlide}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white p-2 rounded-full shadow-md transition-colors"
                      data-testid="carousel-prev"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={nextSlide}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white p-2 rounded-full shadow-md transition-colors"
                      data-testid="carousel-next"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    
                    {/* Dots indicator */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                      {heroImages.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentSlide(idx)}
                          className={`w-2 h-2 rounded-full transition-all ${
                            idx === currentSlide 
                              ? 'bg-white w-6' 
                              : 'bg-white/50 hover:bg-white/75'
                          }`}
                          data-testid={`carousel-dot-${idx}`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* Fallback placeholder */
              <div className="aspect-[4/3] bg-zinc-100 rounded-sm flex items-center justify-center">
                <ImageIcon className="w-16 h-16 text-zinc-300" />
              </div>
            )}
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
            Join photographers who trust {config.brand_name || 'us'} for their client galleries.
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
          <a 
            href="/admin" 
            className="text-zinc-400 hover:text-zinc-600 transition-colors"
            data-testid="admin-link"
          >
            Admin
          </a>
          <p>© 2024 {config.brand_name}. Built for photographers.</p>
          <div className="w-12"></div> {/* Spacer for balance */}
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
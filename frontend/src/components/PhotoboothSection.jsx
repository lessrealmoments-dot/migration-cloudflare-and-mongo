import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, ExternalLink, Images, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const PhotoboothSection = ({ section, galleryId, isPublic = false }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(true);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const response = await fetch(
          `${API}/api/galleries/${galleryId}/photobooth-sessions?section_id=${section.id}`
        );
        if (response.ok) {
          const data = await response.json();
          setSessions(data);
        }
      } catch (error) {
        console.error('Error fetching photobooth sessions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, [galleryId, section.id]);

  const openSession = useCallback((session) => {
    setSelectedSession(session);
    setIframeLoading(true);
    setIsModalOpen(true);
    document.body.style.overflow = 'hidden';
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedSession(null);
    document.body.style.overflow = '';
  }, []);

  const openInFotoshare = useCallback(() => {
    if (selectedSession) {
      window.open(selectedSession.item_url, '_blank');
    }
  }, [selectedSession]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isModalOpen) {
        closeModal();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isModalOpen, closeModal]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (sessions.length === 0 && !section.fotoshare_expired) {
    return null;
  }

  if (section.fotoshare_expired) {
    return (
      <div 
        data-testid={`photobooth-section-${section.id}`}
        className="py-8"
      >
        <h3 className="text-xl font-semibold text-zinc-800 mb-4">{section.name}</h3>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-amber-700">This photobooth link has expired</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div 
        data-testid={`photobooth-section-${section.id}`}
        className="py-8"
      >
        {/* Section Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl">
            <Images className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-zinc-800">{section.name}</h3>
            <p className="text-sm text-zinc-500">{sessions.length} sessions</p>
          </div>
        </div>

        {/* Sessions Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {sessions.map((session, index) => (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03, duration: 0.3 }}
              data-testid={`photobooth-session-${session.session_id}`}
              className="group relative aspect-square cursor-pointer"
              onClick={() => openSession(session)}
            >
              {/* Stacked Cards Effect for Multiple Photos */}
              {session.has_multiple && (
                <>
                  <div className="absolute -top-1 -right-1 w-full h-full bg-zinc-300 rounded-xl transform rotate-3 opacity-60" />
                  <div className="absolute -top-0.5 -right-0.5 w-full h-full bg-zinc-200 rounded-xl transform rotate-1.5 opacity-80" />
                </>
              )}
              
              {/* Main Card */}
              <div className="relative w-full h-full rounded-xl overflow-hidden shadow-lg transform transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-xl">
                <img
                  src={session.cover_thumbnail}
                  alt="Photobooth session"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                
                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-white text-sm font-medium">
                        {session.has_multiple ? 'View Session' : 'View Photo'}
                      </span>
                      {session.has_multiple && (
                        <span className="bg-white/20 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-full">
                          Multiple
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Multiple Photos Indicator Badge */}
                {session.has_multiple && (
                  <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-lg p-1.5">
                    <Images className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Premium Modal */}
      <AnimatePresence>
        {isModalOpen && selectedSession && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            onClick={closeModal}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" />
            
            {/* Modal Content */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full h-full max-w-6xl max-h-[90vh] mx-4 my-8 bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-violet-500/20 backdrop-blur-sm rounded-lg">
                    <Images className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                    <h4 className="text-white font-medium">Photobooth Session</h4>
                    <p className="text-zinc-400 text-sm">
                      {selectedSession.has_multiple ? 'Swipe to view all photos' : 'Single photo'}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Open in Fotoshare */}
                  <button
                    onClick={openInFotoshare}
                    className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg text-white text-sm transition-colors"
                    data-testid="open-in-fotoshare-btn"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span className="hidden sm:inline">Open in Fotoshare</span>
                  </button>
                  
                  {/* Close Button */}
                  <button
                    onClick={closeModal}
                    className="p-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg text-white transition-colors"
                    data-testid="close-photobooth-modal"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Loading Indicator */}
              {iframeLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-violet-500" />
                    <p className="text-zinc-400">Loading session...</p>
                  </div>
                </div>
              )}

              {/* Fotoshare Iframe */}
              <iframe
                src={selectedSession.item_url}
                className="w-full h-full border-0"
                title="Photobooth Session"
                allow="fullscreen"
                onLoad={() => setIframeLoading(false)}
                style={{ opacity: iframeLoading ? 0 : 1 }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default PhotoboothSection;

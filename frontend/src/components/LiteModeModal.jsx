import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, Upload, Image, Zap, ArrowRight } from 'lucide-react';

/**
 * LiteModeModal - Friendly prompt for slow connection users
 * Offers choice between Quick Upload (lite) and Full Gallery modes
 */
const LiteModeModal = ({ 
  isOpen, 
  onClose, 
  onSelectLiteMode, 
  onSelectFullMode,
  speed = null,
  eventTitle = 'this event',
  themeColors = {}
}) => {
  if (!isOpen) return null;

  const accentColor = themeColors?.accent || '#3b82f6';
  
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
          >
            {/* Header with icon */}
            <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 dark:from-amber-500/20 dark:to-orange-500/20 p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                <WifiOff className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
                Slow Connection Detected
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
                We noticed your internet might be a bit slow.
                {speed && <span className="block text-xs mt-1 opacity-75">({speed.toFixed(1)} Mbps)</span>}
              </p>
            </div>

            {/* Options */}
            <div className="p-6 space-y-4">
              <p className="text-center text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                Choose how you'd like to experience {eventTitle}:
              </p>

              {/* Quick Upload Option */}
              <button
                onClick={onSelectLiteMode}
                className="w-full group relative overflow-hidden rounded-xl border-2 border-amber-200 dark:border-amber-800 hover:border-amber-400 dark:hover:border-amber-600 transition-all duration-300 p-4 text-left"
                data-testid="lite-mode-option"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-orange-500/5 group-hover:from-amber-500/10 group-hover:to-orange-500/10 transition-colors" />
                <div className="relative flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                      Quick Upload
                      <span className="text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded-full">
                        Recommended
                      </span>
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                      Fast, minimal interface. Upload your photos quickly without loading the full gallery.
                    </p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-zinc-400 group-hover:text-amber-500 transition-colors flex-shrink-0 mt-1" />
                </div>
              </button>

              {/* Full Gallery Option */}
              <button
                onClick={onSelectFullMode}
                className="w-full group relative overflow-hidden rounded-xl border-2 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 transition-all duration-300 p-4 text-left"
                data-testid="full-mode-option"
              >
                <div className="relative flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <Image className="w-6 h-6 text-zinc-600 dark:text-zinc-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-zinc-900 dark:text-white">
                      Full Gallery
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                      Load the complete gallery with all photos and videos. May take longer on slow connections.
                    </p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-zinc-400 group-hover:text-zinc-600 transition-colors flex-shrink-0 mt-1" />
                </div>
              </button>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6">
              <p className="text-xs text-center text-zinc-500 dark:text-zinc-500">
                You can switch to full gallery anytime after uploading
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LiteModeModal;

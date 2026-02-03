import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import SlideshowDisplay from './SlideshowDisplay';
import CollageDisplay from './CollageDisplay';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Display Router - Routes to the appropriate display mode
 * 
 * URL: /display/{share_link}
 * Query params:
 *   - mode: 'slideshow' | 'collage' (override gallery default)
 *   - transition: 'crossfade' | 'fade-zoom' | 'slide' | 'flip' (override)
 *   - interval: number (seconds between transitions, slideshow only)
 */
const Display = () => {
  const { shareLink } = useParams();
  const [searchParams] = useSearchParams();
  const modeOverride = searchParams.get('mode');
  
  const [mode, setMode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDisplayMode = async () => {
      // If mode is overridden in URL, use that
      if (modeOverride) {
        setMode(modeOverride);
        setLoading(false);
        return;
      }

      // Otherwise fetch from gallery settings
      try {
        const response = await fetch(`${API}/display/${shareLink}`);
        if (!response.ok) throw new Error('Gallery not found');
        const data = await response.json();
        setMode(data.display_mode || 'slideshow');
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };

    fetchDisplayMode();
  }, [shareLink, modeOverride]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white text-xl animate-pulse">Loading display...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-4">{error}</div>
          <p className="text-zinc-500">Please check the gallery link and try again.</p>
        </div>
      </div>
    );
  }

  // Render appropriate display mode
  if (mode === 'collage') {
    return <CollageDisplay />;
  }

  // Default to slideshow
  return <SlideshowDisplay />;
};

export default Display;

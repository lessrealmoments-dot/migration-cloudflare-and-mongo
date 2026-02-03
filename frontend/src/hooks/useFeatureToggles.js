import { useState, useEffect } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Admin contact info for feature unavailable messages
const ADMIN_CONTACT = {
  phone: '09952568450',
  email: 'lessrealmoments@gmail.com'
};

const DEFAULT_TOGGLES = {
  qr_share: true,
  online_gallery: true,
  display_mode: true,
  contributor_link: true,
  auto_delete_enabled: true
};

// Cache the toggles to avoid repeated API calls
let cachedToggles = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const useFeatureToggles = () => {
  const [toggles, setToggles] = useState(cachedToggles || DEFAULT_TOGGLES);
  const [loading, setLoading] = useState(!cachedToggles);

  useEffect(() => {
    const fetchToggles = async () => {
      // Use cache if available and not expired
      if (cachedToggles && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
        setToggles(cachedToggles);
        setLoading(false);
        return;
      }

      try {
        // First try to get user-specific features (requires auth)
        const token = localStorage.getItem('token');
        if (token) {
          const response = await fetch(`${API}/user/features`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (response.ok) {
            const data = await response.json();
            cachedToggles = {
              qr_share: data.qr_share ?? true,
              online_gallery: data.online_gallery ?? true,
              display_mode: data.display_mode ?? true,
              contributor_link: data.contributor_link ?? true,
              auto_delete_enabled: data.auto_delete_enabled ?? true
            };
            cacheTimestamp = Date.now();
            setToggles(cachedToggles);
            setLoading(false);
            return;
          }
        }
        
        // Fall back to public defaults if not authenticated or user features not set
        setToggles(DEFAULT_TOGGLES);
      } catch (error) {
        console.error('Failed to fetch feature toggles:', error);
        setToggles(DEFAULT_TOGGLES);
      } finally {
        setLoading(false);
      }
    };

    fetchToggles();
  }, []);

  // Helper function to check if a feature is enabled
  const isFeatureEnabled = (featureName) => {
    return toggles[featureName] !== false;
  };

  // Helper to get the unavailable message
  const getUnavailableMessage = () => {
    return `FEATURE NOT AVAILABLE - Contact Admin: ${ADMIN_CONTACT.phone} / ${ADMIN_CONTACT.email}`;
  };
  
  // Function to clear cache (useful when user logs out or features change)
  const clearCache = () => {
    cachedToggles = null;
    cacheTimestamp = null;
  };

  return {
    toggles,
    loading,
    isFeatureEnabled,
    getUnavailableMessage,
    clearCache,
    ADMIN_CONTACT
  };
};

export default useFeatureToggles;

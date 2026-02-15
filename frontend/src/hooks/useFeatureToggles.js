import { useState, useEffect } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Admin contact info for feature unavailable messages
const ADMIN_CONTACT = {
  phone: '09952568450',
  email: 'lessrealmoments@gmail.com'
};

// Cache the toggles to avoid repeated API calls
let cachedToggles = null;
let cacheTimestamp = null;
let cachedToken = null;  // Track which token the cache is for
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const useFeatureToggles = () => {
  const [toggles, setToggles] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchToggles = async () => {
      const token = localStorage.getItem('token');
      
      // Invalidate cache if token changed (user logged in/out or switched accounts)
      if (cachedToken !== token) {
        cachedToggles = null;
        cacheTimestamp = null;
        cachedToken = token;
      }
      
      // Use cache if available and not expired
      if (cachedToggles && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
        setToggles(cachedToggles);
        setLoading(false);
        return;
      }

      try {
        // Get user-specific features (requires auth)
        if (token) {
          const response = await fetch(`${API}/user/features`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (response.ok) {
            const data = await response.json();
            // Use the new authority hierarchy resolved features
            const features = data.features || {};
            cachedToggles = {
              // Map new feature names to old names for backward compatibility
              qr_share: features.qr_code === true,
              online_gallery: features.view_public_gallery === true,
              display_mode: features.display_mode === true,
              contributor_link: features.collaboration_link === true,
              coordinator_hub: features.coordinator_hub === true,
              auto_delete_enabled: true,
              // Also include new feature names
              unlimited_token: features.unlimited_token === true,
              copy_share_link: features.copy_share_link === true,
              // Store authority source for debugging
              _authority_source: data.authority_source,
              _effective_plan: data.effective_plan,
              _override_active: data.override_active,
              _override_mode: data.override_mode,
              _loaded: true
            };
            cacheTimestamp = Date.now();
            cachedToken = token;
            setToggles(cachedToggles);
            setLoading(false);
            console.log('[FeatureToggles] Loaded for plan:', data.effective_plan, 'display_mode:', features.display_mode, 'coordinator_hub:', features.coordinator_hub);
            return;
          }
        }
        
        // Fall back to restrictive defaults if not authenticated
        const restrictiveDefaults = {
          qr_share: true,
          online_gallery: true,
          display_mode: false,  // Restricted by default
          contributor_link: false,  // Restricted by default
          coordinator_hub: false,  // Restricted by default
          auto_delete_enabled: true,
          unlimited_token: false,
          copy_share_link: true,
          _loaded: true
        };
        cachedToggles = restrictiveDefaults;
        cacheTimestamp = Date.now();
        setToggles(restrictiveDefaults);
      } catch (error) {
        console.error('Failed to fetch feature toggles:', error);
        // On error, use restrictive defaults
        const errorDefaults = {
          qr_share: true,
          online_gallery: true,
          display_mode: false,
          contributor_link: false,
          coordinator_hub: false,
          auto_delete_enabled: true,
          _loaded: true
        };
        setToggles(errorDefaults);
      } finally {
        setLoading(false);
      }
    };

    fetchToggles();
  }, []);

  // Helper function to check if a feature is enabled
  // Returns false if toggles haven't loaded yet (safer default)
  const isFeatureEnabled = (featureName) => {
    if (!toggles || !toggles._loaded) {
      // Features not loaded yet - return false for restricted features
      if (featureName === 'display_mode' || featureName === 'contributor_link') {
        return false;
      }
      return true; // Basic features like qr_share are generally available
    }
    return toggles[featureName] === true;
  };

  // Helper to get the unavailable message
  const getUnavailableMessage = () => {
    return `FEATURE NOT AVAILABLE - Contact Admin: ${ADMIN_CONTACT.phone} / ${ADMIN_CONTACT.email}`;
  };
  
  // Function to clear cache (useful when user logs out or features change)
  const clearCache = () => {
    cachedToggles = null;
    cacheTimestamp = null;
    cachedToken = null;
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

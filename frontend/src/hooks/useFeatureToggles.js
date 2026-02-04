import { useState, useEffect } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Admin contact info for feature unavailable messages
const ADMIN_CONTACT = {
  phone: '09952568450',
  email: 'lessrealmoments@gmail.com'
};

// Map old feature names to new global toggle names
const FEATURE_MAP = {
  'qr_share': 'qr_code',
  'online_gallery': 'view_public_gallery',
  'display_mode': 'display_mode',
  'contributor_link': 'collaboration_link'
};

// Default to null until features are loaded - prevents showing features before auth
const DEFAULT_TOGGLES = null;

// Cache the toggles to avoid repeated API calls
let cachedToggles = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const useFeatureToggles = () => {
  const [toggles, setToggles] = useState(cachedToggles);
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
            // Use the new authority hierarchy resolved features
            const features = data.features || {};
            cachedToggles = {
              // Map new feature names to old names for backward compatibility
              qr_share: features.qr_code ?? true,
              online_gallery: features.view_public_gallery ?? true,
              display_mode: features.display_mode ?? false,  // Default to false for safety
              contributor_link: features.collaboration_link ?? false,  // Default to false for safety
              auto_delete_enabled: true,
              // Also include new feature names
              unlimited_token: features.unlimited_token ?? false,
              copy_share_link: features.copy_share_link ?? true,
              // Store authority source for debugging
              _authority_source: data.authority_source,
              _effective_plan: data.effective_plan,
              _override_active: data.override_active,
              _override_mode: data.override_mode,
              _loaded: true
            };
            cacheTimestamp = Date.now();
            setToggles(cachedToggles);
            setLoading(false);
            return;
          }
        }
        
        // Fall back to restrictive defaults if not authenticated
        const restrictiveDefaults = {
          qr_share: true,
          online_gallery: true,
          display_mode: false,  // Restricted by default
          contributor_link: false,  // Restricted by default
          auto_delete_enabled: true,
          unlimited_token: false,
          copy_share_link: true,
          _loaded: true
        };
        setToggles(restrictiveDefaults);
      } catch (error) {
        console.error('Failed to fetch feature toggles:', error);
        // On error, use restrictive defaults
        setToggles({
          qr_share: true,
          online_gallery: true,
          display_mode: false,
          contributor_link: false,
          auto_delete_enabled: true,
          _loaded: true
        });
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

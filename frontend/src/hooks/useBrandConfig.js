import { useState, useEffect, createContext, useContext } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Create context for brand config
const BrandConfigContext = createContext(null);

// Cache the config in memory to prevent flashing
let cachedConfig = null;

export const useBrandConfig = () => {
  const [config, setConfig] = useState(cachedConfig || {
    brand_name: '', // Start empty to avoid flash
    brand_tagline: '',
    favicon_url: '',
    hero_title: '',
    hero_subtitle: '',
    loading: !cachedConfig
  });

  useEffect(() => {
    // If we have cached config, use it immediately
    if (cachedConfig) {
      setConfig({ ...cachedConfig, loading: false });
      return;
    }

    const fetchConfig = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/public/landing-config`);
        if (response.ok) {
          const data = await response.json();
          cachedConfig = { ...data, loading: false };
          setConfig(cachedConfig);
          
          // Update favicon dynamically
          if (data.favicon_url) {
            let link = document.querySelector("link[rel~='icon']");
            if (!link) {
              link = document.createElement('link');
              link.rel = 'icon';
              document.head.appendChild(link);
            }
            link.href = `${BACKEND_URL}${data.favicon_url}`;
          }
          
          // Update document title
          if (data.brand_name) {
            document.title = data.brand_name;
          }
        }
      } catch (error) {
        console.error('Failed to fetch brand config:', error);
        // Fallback to default on error
        setConfig(prev => ({ ...prev, brand_name: 'PhotoShare', loading: false }));
      }
    };

    fetchConfig();
  }, []);

  return config;
};

// Provider component for brand config
export const BrandConfigProvider = ({ children }) => {
  const config = useBrandConfig();
  return (
    <BrandConfigContext.Provider value={config}>
      {children}
    </BrandConfigContext.Provider>
  );
};

// Hook to use brand config from context
export const useBrandConfigContext = () => {
  return useContext(BrandConfigContext);
};

export default useBrandConfig;

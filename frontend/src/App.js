import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import LandingPage from '@/pages/LandingPage';
import Auth from '@/pages/Auth';
import Dashboard from '@/pages/Dashboard';
import CreateGallery from '@/pages/CreateGallery';
import GalleryDetail from '@/pages/GalleryDetail';
import PublicGallery from '@/pages/PublicGallery';
import ContributorUpload from '@/pages/ContributorUpload';
import AdminLogin from '@/pages/AdminLogin';
import AdminDashboard from '@/pages/AdminDashboard';
import AdminGalleryReview from '@/pages/AdminGalleryReview';
import '@/App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Hook to dynamically set the favicon
const useDynamicFavicon = () => {
  useEffect(() => {
    const fetchAndSetFavicon = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/public/landing-config`);
        if (response.ok) {
          const config = await response.json();
          if (config.favicon_url) {
            // Create or update favicon link element
            let link = document.querySelector("link[rel~='icon']");
            if (!link) {
              link = document.createElement('link');
              link.rel = 'icon';
              document.head.appendChild(link);
            }
            link.href = `${BACKEND_URL}${config.favicon_url}`;
            
            // Also set apple-touch-icon for mobile devices
            let appleLink = document.querySelector("link[rel='apple-touch-icon']");
            if (!appleLink) {
              appleLink = document.createElement('link');
              appleLink.rel = 'apple-touch-icon';
              document.head.appendChild(appleLink);
            }
            appleLink.href = `${BACKEND_URL}${config.favicon_url}`;
          }
        }
      } catch (error) {
        console.error('Failed to fetch favicon config:', error);
      }
    };
    
    fetchAndSetFavicon();
  }, []);
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Set dynamic favicon from admin config
  useDynamicFavicon();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    
    if (token && userData) {
      setUser(JSON.parse(userData));
    }
    setLoading(false);
  }, []);

  const ProtectedRoute = ({ children }) => {
    if (loading) return null;
    return user ? children : <Navigate to="/auth" replace />;
  };

  const AdminProtectedRoute = ({ children }) => {
    const adminToken = localStorage.getItem('adminToken');
    return adminToken ? children : <Navigate to="/admin" replace />;
  };

  if (loading) {
    return null;
  }

  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage user={user} />} />
          <Route path="/auth" element={user ? <Navigate to="/dashboard" replace /> : <Auth setUser={setUser} />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard user={user} setUser={setUser} /></ProtectedRoute>} />
          <Route path="/gallery/create" element={<ProtectedRoute><CreateGallery /></ProtectedRoute>} />
          <Route path="/gallery/:id" element={<ProtectedRoute><GalleryDetail /></ProtectedRoute>} />
          <Route path="/g/:shareLink" element={<PublicGallery />} />
          {/* Contributor Upload Route */}
          <Route path="/c/:contributorLink" element={<ContributorUpload />} />
          {/* Admin Routes */}
          <Route path="/admin" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminProtectedRoute><AdminDashboard /></AdminProtectedRoute>} />
          <Route path="/admin/gallery/:galleryId" element={<AdminProtectedRoute><AdminGalleryReview /></AdminProtectedRoute>} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
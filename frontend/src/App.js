import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from '@/components/ui/sonner';
import LandingPage from '@/pages/LandingPage';
import Auth from '@/pages/Auth';
import Dashboard from '@/pages/Dashboard';
import CreateGallery from '@/pages/CreateGallery';
import GalleryDetail from '@/pages/GalleryDetail';
import PublicGallery from '@/pages/PublicGallery';
import ContributorUpload from '@/pages/ContributorUpload';
import VideographerUpload from '@/pages/VideographerUpload';
import FotoshareContributorUpload from '@/pages/FotoshareContributorUpload';
import PhotoboothContributorUpload from '@/pages/PhotoboothContributorUpload';
import GdriveContributorUpload from '@/pages/GdriveContributorUpload';
import PcloudContributorUpload from '@/pages/PcloudContributorUpload';
import CoordinatorHub from '@/pages/CoordinatorHub';
import Display from '@/pages/Display';
import PricingPage from '@/pages/PricingPage';
import AdminLogin from '@/pages/AdminLogin';
import AdminDashboard from '@/pages/AdminDashboard';
import AdminGalleryReview from '@/pages/AdminGalleryReview';
import CollagePresetBuilder from '@/pages/CollagePresetBuilder';
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
    <HelmetProvider>
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage user={user} />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/auth" element={user ? <Navigate to="/dashboard" replace /> : <Auth setUser={setUser} />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard user={user} setUser={setUser} /></ProtectedRoute>} />
          <Route path="/gallery/create" element={<ProtectedRoute><CreateGallery /></ProtectedRoute>} />
          <Route path="/gallery/:id" element={<ProtectedRoute><GalleryDetail /></ProtectedRoute>} />
          <Route path="/g/:shareLink" element={<PublicGallery />} />
          {/* Contributor Upload Route */}
          <Route path="/c/:contributorLink" element={<ContributorUpload />} />
          {/* Videographer Upload Route */}
          <Route path="/v/:contributorLink" element={<VideographerUpload />} />
          {/* 360 Booth / Fotoshare Contributor Upload */}
          <Route path="/f/:contributorLink" element={<FotoshareContributorUpload />} />
          {/* Photobooth contributor upload (separate from 360 booth) */}
          <Route path="/pb/:contributorLink" element={<PhotoboothContributorUpload />} />
          {/* Google Drive Contributor Upload Route */}
          <Route path="/d/:contributorLink" element={<GdriveContributorUpload />} />
          {/* pCloud Contributor Upload Route */}
          <Route path="/p/:contributorLink" element={<PcloudContributorUpload />} />
          {/* Coordinator Hub Route */}
          <Route path="/coordinator/:hubLink" element={<CoordinatorHub />} />
          {/* Display/Slideshow Routes */}
          <Route path="/display/:shareLink" element={<Display />} />
          {/* Admin Routes */}
          <Route path="/admin" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminProtectedRoute><AdminDashboard /></AdminProtectedRoute>} />
          <Route path="/admin/gallery/:galleryId" element={<AdminProtectedRoute><AdminGalleryReview /></AdminProtectedRoute>} />
          <Route path="/admin/collage-presets" element={<AdminProtectedRoute><CollagePresetBuilder /></AdminProtectedRoute>} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </div>
    </HelmetProvider>
  );
}

export default App;
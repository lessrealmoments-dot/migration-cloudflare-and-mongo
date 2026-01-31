import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import LandingPage from '@/pages/LandingPage';
import Auth from '@/pages/Auth';
import Dashboard from '@/pages/Dashboard';
import CreateGallery from '@/pages/CreateGallery';
import GalleryDetail from '@/pages/GalleryDetail';
import PublicGallery from '@/pages/PublicGallery';
import AdminLogin from '@/pages/AdminLogin';
import AdminDashboard from '@/pages/AdminDashboard';
import '@/App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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
          {/* Admin Routes */}
          <Route path="/admin" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminProtectedRoute><AdminDashboard /></AdminProtectedRoute>} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
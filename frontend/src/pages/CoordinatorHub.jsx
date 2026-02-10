import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Camera, Video, Film, HardDrive, Cloud, 
  CheckCircle, Clock, RefreshCw, Copy, 
  ExternalLink, AlertCircle, Calendar,
  User, ChevronDown, ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Section type icons and colors
const sectionConfig = {
  photo: { icon: Camera, color: 'bg-blue-500', label: 'Photos' },
  video: { icon: Video, color: 'bg-red-500', label: 'Video' },
  fotoshare: { icon: Film, color: 'bg-pink-500', label: '360 Booth' },
  gdrive: { icon: HardDrive, color: 'bg-green-500', label: 'Google Drive' },
  pcloud: { icon: Cloud, color: 'bg-cyan-500', label: 'pCloud' }
};

// Status badges
const StatusBadge = ({ status, count }) => {
  const statusConfig = {
    pending: { 
      icon: Clock, 
      bg: 'bg-amber-100', 
      text: 'text-amber-700', 
      label: 'Pending' 
    },
    submitted: { 
      icon: CheckCircle, 
      bg: 'bg-green-100', 
      text: 'text-green-700', 
      label: 'Submitted' 
    },
    synced: { 
      icon: RefreshCw, 
      bg: 'bg-blue-100', 
      text: 'text-blue-700', 
      label: 'Synced' 
    }
  };
  
  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${config.bg} ${config.text}`}>
      <Icon className="w-4 h-4" />
      {config.label}
      {count > 0 && <span className="ml-1">({count})</span>}
    </span>
  );
};

// Section Card Component
const SectionCard = ({ section, baseUrl, hubLink }) => {
  const [showQR, setShowQR] = useState(false);
  const config = sectionConfig[section.type] || sectionConfig.photo;
  const Icon = config.icon;
  
  // Add hub query parameter so supplier can navigate back
  const contributorUrl = section.contributor_link 
    ? `${baseUrl}${section.link_prefix}${section.contributor_link}?hub=${hubLink}`
    : null;
  
  const copyLink = () => {
    if (contributorUrl) {
      navigator.clipboard.writeText(contributorUrl);
      toast.success('Link copied to clipboard!');
    }
  };
  
  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden"
    >
      {/* Header */}
      <div className={`${config.color} px-4 py-3 flex items-center gap-3`}>
        <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-white font-semibold">{section.name}</h3>
          <p className="text-white/80 text-sm">{config.label}</p>
        </div>
        <StatusBadge status={section.status} count={section.item_count} />
      </div>
      
      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Contributor info */}
        {section.contributor_name && (
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <User className="w-4 h-4" />
            <span>Submitted by: <strong>{section.contributor_name}</strong></span>
          </div>
        )}
        
        {/* Last updated */}
        {section.last_updated && (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Calendar className="w-4 h-4" />
            <span>Last updated: {formatDate(section.last_updated)}</span>
          </div>
        )}
        
        {/* Contributor link actions */}
        {section.contributor_enabled && contributorUrl ? (
          <div className="space-y-3">
            {/* Link display */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={contributorUrl}
                readOnly
                className="flex-1 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-600 truncate"
              />
              <button
                onClick={copyLink}
                className="p-2 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
                title="Copy link"
              >
                <Copy className="w-4 h-4 text-zinc-600" />
              </button>
              <a
                href={contributorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
                title="Open link"
              >
                <ExternalLink className="w-4 h-4 text-zinc-600" />
              </a>
            </div>
            
            {/* QR Toggle */}
            <button
              onClick={() => setShowQR(!showQR)}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              {showQR ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showQR ? 'Hide QR Code' : 'Show QR Code'}
            </button>
            
            {/* QR Code */}
            <AnimatePresence>
              {showQR && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex justify-center py-4"
                >
                  <div className="bg-white p-4 rounded-xl shadow-lg border">
                    <QRCodeSVG 
                      value={contributorUrl} 
                      size={180}
                      level="H"
                      includeMargin={true}
                    />
                    <p className="text-center text-xs text-zinc-500 mt-2">
                      Scan to upload
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg text-amber-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>Contributor link not yet generated. Ask the photographer to enable it.</span>
          </div>
        )}
        
        {/* Role confirmation reminder */}
        <div className="text-xs text-zinc-400 text-center pt-2 border-t">
          For: <strong>{section.role_label}</strong>
        </div>
      </div>
    </motion.div>
  );
};

const CoordinatorHub = () => {
  const { hubLink } = useParams();
  const [hubData, setHubData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const baseUrl = window.location.origin;
  
  useEffect(() => {
    fetchHubData();
  }, [hubLink]);
  
  const fetchHubData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/coordinator-hub/${hubLink}`);
      setHubData(response.data);
    } catch (err) {
      console.error('Failed to load coordinator hub:', err);
      setError(err.response?.data?.detail || 'Failed to load coordinator hub');
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-zinc-400 animate-spin mx-auto mb-4" />
          <p className="text-zinc-500">Loading coordinator hub...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-zinc-800 mb-2">Link Not Found</h2>
          <p className="text-zinc-500">{error}</p>
        </div>
      </div>
    );
  }
  
  const formatEventDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };
  
  // Separate sections by status
  const pendingSections = hubData.sections.filter(s => s.status === 'pending');
  const submittedSections = hubData.sections.filter(s => s.status !== 'pending');
  
  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-zinc-800 to-zinc-600 rounded-xl flex items-center justify-center">
              <Camera className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">
                {hubData.event_title || hubData.gallery_title}
              </h1>
              <p className="text-zinc-500">
                Supplier Coordination Hub • {hubData.photographer_name}
              </p>
              {hubData.event_date && (
                <p className="text-sm text-zinc-400 mt-1">
                  {formatEventDate(hubData.event_date)}
                </p>
              )}
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-8">
          <h3 className="font-semibold text-blue-800 mb-2">📋 How to use this page</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Find your section below and click the link or scan the QR code</li>
            <li>• You will be asked to confirm your role before uploading</li>
            <li>• Make sure you're uploading to the correct section</li>
            <li>• Status will update automatically once you submit</li>
          </ul>
        </div>
        
        {/* Pending Sections */}
        {pendingSections.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              Awaiting Submission ({pendingSections.length})
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {pendingSections.map((section) => (
                <SectionCard 
                  key={section.id} 
                  section={section} 
                  baseUrl={baseUrl}
                />
              ))}
            </div>
          </section>
        )}
        
        {/* Submitted Sections */}
        {submittedSections.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Completed ({submittedSections.length})
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {submittedSections.map((section) => (
                <SectionCard 
                  key={section.id} 
                  section={section} 
                  baseUrl={baseUrl}
                />
              ))}
            </div>
          </section>
        )}
        
        {/* Empty state */}
        {hubData.sections.length === 0 && (
          <div className="text-center py-16">
            <AlertCircle className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-zinc-600 mb-2">No sections yet</h3>
            <p className="text-zinc-400">
              The photographer hasn't created any sections for this gallery yet.
            </p>
          </div>
        )}
      </main>
      
      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white py-6 mt-8">
        <div className="max-w-4xl mx-auto px-6 text-center text-sm text-zinc-400">
          <p>Powered by EventsGallery • Refresh this page to see updates</p>
        </div>
      </footer>
    </div>
  );
};

export default CoordinatorHub;

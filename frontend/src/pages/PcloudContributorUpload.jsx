import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { 
  Cloud, Loader2, CheckCircle, ExternalLink, 
  Image as ImageIcon, Upload, AlertTriangle
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const PcloudContributorUpload = () => {
  const { contributorLink } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [galleryInfo, setGalleryInfo] = useState(null);
  const [companyName, setCompanyName] = useState('');
  const [contributorRole, setContributorRole] = useState('');
  const [pcloudViewingUrl, setPcloudViewingUrl] = useState('');
  const [existingPhotos, setExistingPhotos] = useState([]);
  const [submitResult, setSubmitResult] = useState(null);
  const [showSyncForm, setShowSyncForm] = useState(false);
  const [roleConfirmed, setRoleConfirmed] = useState(false);
  
  useEffect(() => {
    fetchGalleryInfo();
  }, [contributorLink]);
  
  const fetchGalleryInfo = async () => {
    try {
      const response = await axios.get(`${API}/contributor/${contributorLink}`);
      
      if (response.data.section_type !== 'pcloud') {
        toast.error('This link is not for pCloud uploads');
        navigate('/');
        return;
      }
      
      setGalleryInfo(response.data);
      setCompanyName(response.data.existing_contributor_name || '');
      setContributorRole(response.data.existing_contributor_role || '');
      setExistingPhotos(response.data.existing_pcloud_photos || []);
    } catch (error) {
      toast.error('Invalid or expired upload link');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };
  
  const handleOpenUploadLink = () => {
    if (galleryInfo?.pcloud_upload_link) {
      window.open(galleryInfo.pcloud_upload_link, '_blank');
    }
  };
  
  const handleSubmitSync = async (e) => {
    e.preventDefault();
    
    if (!companyName.trim()) {
      toast.error('Please enter your name or company name');
      return;
    }
    
    if (!pcloudViewingUrl.trim()) {
      toast.error('Please enter a pCloud viewing/sharing link');
      return;
    }
    
    // Basic URL validation
    if (!pcloudViewingUrl.includes('pcloud') && !pcloudViewingUrl.includes('u.pcloud.link')) {
      toast.error('Please enter a valid pCloud share link');
      return;
    }
    
    setSubmitting(true);
    setSubmitResult(null);
    
    try {
      const response = await axios.post(`${API}/contributor/${contributorLink}/pcloud`, {
        company_name: companyName,
        contributor_role: contributorRole || 'Photos',
        pcloud_viewing_url: pcloudViewingUrl
      });
      
      setSubmitResult(response.data);
      toast.success(`Successfully synced ${response.data.photo_count} photos!`);
      setShowSyncForm(false);
      
      // Refresh gallery info to show updated photos
      fetchGalleryInfo();
      
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to sync photos';
      toast.error(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 mb-4">
            <Cloud className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-light text-zinc-800 mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
            pCloud Photo Upload
          </h1>
          <p className="text-zinc-600">
            Share your photos for <span className="font-medium">{galleryInfo?.gallery_title}</span>
          </p>
          <p className="text-sm text-zinc-500 mt-1">
            Photographer: {galleryInfo?.photographer_name}
          </p>
        </div>
        
        {/* Role Confirmation */}
        {!roleConfirmed && (
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Cloud className="w-7 h-7 text-amber-600" />
              </div>
              <h2 className="text-xl font-semibold text-zinc-800 mb-2">Please Confirm Your Role</h2>
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-6">
              <p className="text-amber-800 text-lg text-center mb-3">
                Are you sure you are the
              </p>
              <p className="text-2xl font-bold text-center text-amber-700" style={{ fontFamily: 'Playfair Display, serif' }}>
                OFFICIAL PHOTO CONTRIBUTOR
              </p>
              <p className="text-amber-800 text-lg text-center mt-3">
                for the section "<strong>{galleryInfo?.section_name}</strong>"?
              </p>
            </div>
            
            <p className="text-zinc-500 text-sm mb-6 text-center">
              ⚠️ Please make sure you're uploading to the correct section.
            </p>
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => window.history.back()}
                className="flex-1 bg-zinc-100 text-zinc-700 py-3 rounded-xl font-medium hover:bg-zinc-200 transition-colors"
              >
                No, Go Back
              </button>
              <button
                type="button"
                onClick={() => setRoleConfirmed(true)}
                className="flex-1 bg-green-600 text-white py-3 rounded-xl font-medium hover:bg-green-700 transition-colors"
                data-testid="confirm-role-btn"
              >
                Yes, I Confirm
              </button>
            </div>
          </div>
        )}
        
        {roleConfirmed && (
        <>
        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Success Result */}
          {submitResult && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-center gap-3 text-blue-700">
                <CheckCircle className="w-5 h-5" />
                <div>
                  <p className="font-medium">Photos synced successfully!</p>
                  <p className="text-sm text-blue-600">
                    {submitResult.photo_count} photos from "{submitResult.folder_name}"
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Existing Photos Info */}
          {existingPhotos.length > 0 && !submitResult && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-center gap-3 text-blue-700">
                <ImageIcon className="w-5 h-5" />
                <p className="text-sm">
                  <span className="font-medium">{existingPhotos.length} photos</span> already synced to this section
                </p>
              </div>
            </div>
          )}
          
          {/* Step 1: Your Details */}
          <div className="mb-8">
            <h2 className="text-lg font-medium text-zinc-800 mb-4 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">1</span>
              Your Details
            </h2>
            <div className="space-y-4 pl-9">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Your Name / Company Name *
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g., John Smith Photography"
                  className="w-full h-12 px-4 rounded-xl border border-zinc-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  data-testid="contributor-name-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Your Role (Optional)
                </label>
                <input
                  type="text"
                  value={contributorRole}
                  onChange={(e) => setContributorRole(e.target.value)}
                  placeholder="e.g., Photography, Same Day Edit, Highlights"
                  className="w-full h-12 px-4 rounded-xl border border-zinc-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  data-testid="contributor-role-input"
                />
              </div>
            </div>
          </div>
          
          {/* Step 2: Upload Photos */}
          <div className="mb-8">
            <h2 className="text-lg font-medium text-zinc-800 mb-4 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">2</span>
              Upload Your Photos to pCloud
            </h2>
            <div className="pl-9">
              {galleryInfo?.pcloud_upload_link ? (
                <div className="space-y-4">
                  <p className="text-sm text-zinc-600">
                    Click the button below to upload your photos to the photographer's pCloud folder.
                  </p>
                  <button
                    onClick={handleOpenUploadLink}
                    className="w-full h-14 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600 text-white font-medium hover:from-blue-600 hover:to-cyan-700 transition-all flex items-center justify-center gap-2"
                    data-testid="upload-to-pcloud-btn"
                  >
                    <Upload className="w-5 h-5" />
                    Upload Photos to pCloud
                    <ExternalLink className="w-4 h-4 ml-1" />
                  </button>
                  <p className="text-xs text-zinc-500 text-center">
                    Opens in a new tab. Upload your photos there, then come back to sync.
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <p className="text-sm text-amber-700">
                      No upload link has been configured. Please contact the photographer.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Step 3: Sync Photos */}
          <div className="mb-6">
            <h2 className="text-lg font-medium text-zinc-800 mb-4 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">3</span>
              Sync Your Photos to Gallery
            </h2>
            <div className="pl-9">
              {!showSyncForm ? (
                <div className="space-y-4">
                  <p className="text-sm text-zinc-600">
                    After uploading, you can either wait for automatic sync (every 30 minutes) or manually sync by providing your pCloud share link.
                  </p>
                  <button
                    onClick={() => setShowSyncForm(true)}
                    className="w-full h-12 rounded-xl border-2 border-blue-500 text-blue-600 font-medium hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
                    data-testid="show-sync-form-btn"
                  >
                    <Cloud className="w-5 h-5" />
                    Sync Now (Manual)
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitSync} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      pCloud Viewing/Share Link *
                    </label>
                    <input
                      type="url"
                      value={pcloudViewingUrl}
                      onChange={(e) => setPcloudViewingUrl(e.target.value)}
                      placeholder="https://u.pcloud.link/publink/show?code=..."
                      className="w-full h-12 px-4 rounded-xl border border-zinc-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                      disabled={submitting}
                      data-testid="pcloud-viewing-url-input"
                    />
                    <p className="text-xs text-zinc-500 mt-1">
                      Paste the share link to the folder where you uploaded your photos
                    </p>
                  </div>
                  
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowSyncForm(false)}
                      className="flex-1 h-12 rounded-xl border border-zinc-300 text-zinc-600 font-medium hover:bg-zinc-50 transition-all"
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || !companyName.trim() || !pcloudViewingUrl.trim()}
                      className="flex-1 h-12 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600 text-white font-medium hover:from-blue-600 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                      data-testid="sync-photos-btn"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          Sync Photos
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
          
          {/* Re-submit Note */}
          {existingPhotos.length > 0 && (
            <p className="text-center text-xs text-zinc-400 mt-4">
              Syncing again will update the photos to the latest version
            </p>
          )}
        </div>
        
        {/* Footer */}
        <p className="text-center text-sm text-zinc-400 mt-8">
          Your photos will be visible in the client's gallery once synced
        </p>
      </div>
    </div>
  );
};

export default PcloudContributorUpload;

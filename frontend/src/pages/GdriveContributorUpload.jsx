import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { 
  HardDrive, Loader2, CheckCircle, ExternalLink, 
  Image as ImageIcon, FolderOpen, AlertTriangle
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const GdriveContributorUpload = () => {
  const { contributorLink } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hubLink = searchParams.get('hub');
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [galleryInfo, setGalleryInfo] = useState(null);
  const [companyName, setCompanyName] = useState('');
  const [contributorRole, setContributorRole] = useState('');
  const [gdriveUrl, setGdriveUrl] = useState('');
  const [existingPhotos, setExistingPhotos] = useState([]);
  const [submitResult, setSubmitResult] = useState(null);
  const [roleConfirmed, setRoleConfirmed] = useState(false);
  
  // Navigate back to coordinator hub
  const goBackToHub = () => {
    if (hubLink) {
      navigate(`/coordinator/${hubLink}`);
    } else if (window.history.length > 1) {
      window.history.back();
    } else {
      window.close();
    }
  };
  
  useEffect(() => {
    fetchGalleryInfo();
  }, [contributorLink]);
  
  const fetchGalleryInfo = async () => {
    try {
      const response = await axios.get(`${API}/contributor/${contributorLink}`);
      
      if (response.data.section_type !== 'gdrive') {
        toast.error('This link is not for Google Drive uploads');
        navigate('/');
        return;
      }
      
      setGalleryInfo(response.data);
      setCompanyName(response.data.existing_contributor_name || '');
      setContributorRole(response.data.existing_contributor_role || '');
      setExistingPhotos(response.data.existing_gdrive_photos || []);
    } catch (error) {
      toast.error('Invalid or expired upload link');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!companyName.trim()) {
      toast.error('Please enter your name or company name');
      return;
    }
    
    if (!gdriveUrl.trim()) {
      toast.error('Please enter a Google Drive folder URL');
      return;
    }
    
    // Basic URL validation
    if (!gdriveUrl.includes('drive.google.com')) {
      toast.error('Please enter a valid Google Drive folder URL');
      return;
    }
    
    setSubmitting(true);
    setSubmitResult(null);
    
    try {
      const response = await axios.post(`${API}/contributor/${contributorLink}/gdrive`, {
        company_name: companyName,
        contributor_role: contributorRole || 'Photos',
        gdrive_url: gdriveUrl
      });
      
      setSubmitResult(response.data);
      toast.success(`Successfully imported ${response.data.photo_count} photos!`);
      
      // Refresh gallery info to show updated photos
      fetchGalleryInfo();
      
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to import photos';
      toast.error(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 mb-4">
            <HardDrive className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-light text-zinc-800 mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
            Google Drive Photos
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
                <HardDrive className="w-7 h-7 text-amber-600" />
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
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-center gap-3 text-green-700">
                <CheckCircle className="w-5 h-5" />
                <div>
                  <p className="font-medium">Photos imported successfully!</p>
                  <p className="text-sm text-green-600">
                    {submitResult.photo_count} photos from "{submitResult.folder_name}"
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Existing Photos Info */}
          {existingPhotos.length > 0 && !submitResult && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-center gap-3 text-green-700">
                <ImageIcon className="w-5 h-5" />
                <p className="text-sm">
                  <span className="font-medium">{existingPhotos.length} photos</span> already imported to this section
                </p>
              </div>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Company Name */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                Your Name / Company Name *
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g., John Smith Photography"
                className="w-full h-12 px-4 rounded-xl border border-zinc-200 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all"
                disabled={submitting}
                data-testid="contributor-name-input"
              />
              <p className="text-xs text-zinc-500 mt-1">
                This will be displayed as the credit for your photos
              </p>
            </div>
            
            {/* Contributor Role */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                Your Role (Optional)
              </label>
              <input
                type="text"
                value={contributorRole}
                onChange={(e) => setContributorRole(e.target.value)}
                placeholder="e.g., Photography, Same Day Edit, Highlights"
                className="w-full h-12 px-4 rounded-xl border border-zinc-200 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all"
                disabled={submitting}
                data-testid="contributor-role-input"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Describe what type of content you're providing
              </p>
            </div>
            
            {/* Google Drive URL */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                Google Drive Folder URL *
              </label>
              <div className="relative">
                <input
                  type="url"
                  value={gdriveUrl}
                  onChange={(e) => setGdriveUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="w-full h-12 px-4 pr-12 rounded-xl border border-zinc-200 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all"
                  disabled={submitting}
                  data-testid="gdrive-url-input"
                />
                {gdriveUrl && gdriveUrl.includes('drive.google.com') && (
                  <a
                    href={gdriveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-green-500 hover:text-green-600 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                Paste the link to your Google Drive folder containing the photos
              </p>
            </div>
            
            {/* Important Note */}
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium mb-1">Important: Make your folder public</p>
                  <ol className="list-decimal list-inside space-y-1 text-amber-700">
                    <li>Right-click your folder in Google Drive</li>
                    <li>Click "Share" → "General access"</li>
                    <li>Change to "Anyone with the link" → "Viewer"</li>
                    <li>Copy the link and paste it above</li>
                  </ol>
                </div>
              </div>
            </div>
            
            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || !companyName.trim() || !gdriveUrl.trim()}
              className="w-full h-14 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              data-testid="submit-gdrive-btn"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Importing Photos...
                </>
              ) : (
                <>
                  <FolderOpen className="w-5 h-5" />
                  Import Photos from Google Drive
                </>
              )}
            </button>
          </form>
          
          {/* Re-submit Note */}
          {existingPhotos.length > 0 && (
            <p className="text-center text-xs text-zinc-400 mt-4">
              Submitting a new folder URL will replace the existing photos
            </p>
          )}
        </div>
        </>
        )}
        
        {/* Footer */}
        <p className="text-center text-sm text-zinc-400 mt-8">
          Your photos will be visible in the client's gallery once imported
        </p>
      </div>
    </div>
  );
};

export default GdriveContributorUpload;

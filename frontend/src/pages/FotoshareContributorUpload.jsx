import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { 
  Camera, Upload, Loader2, CheckCircle, ExternalLink, 
  Play, RefreshCw, Sparkles, AlertTriangle
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const FotoshareContributorUpload = () => {
  const { contributorLink } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [galleryInfo, setGalleryInfo] = useState(null);
  const [companyName, setCompanyName] = useState('');
  const [fotoshareUrl, setFotoshareUrl] = useState('');
  const [existingVideos, setExistingVideos] = useState([]);
  const [submitResult, setSubmitResult] = useState(null);
  const [roleConfirmed, setRoleConfirmed] = useState(false);
  
  useEffect(() => {
    fetchGalleryInfo();
  }, [contributorLink]);
  
  const fetchGalleryInfo = async () => {
    try {
      const response = await axios.get(`${API}/contributor/${contributorLink}`);
      
      if (response.data.section_type !== 'fotoshare') {
        toast.error('This link is not for 360 booth uploads');
        navigate('/');
        return;
      }
      
      setGalleryInfo(response.data);
      setCompanyName(response.data.existing_contributor_name || '');
      setFotoshareUrl(response.data.fotoshare_url || '');
      setExistingVideos(response.data.existing_fotoshare_videos || []);
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
      toast.error('Please enter your company/supplier name');
      return;
    }
    
    if (!fotoshareUrl.trim()) {
      toast.error('Please enter a fotoshare.co URL');
      return;
    }
    
    if (!fotoshareUrl.startsWith('https://fotoshare.co/')) {
      toast.error('Please enter a valid fotoshare.co URL (e.g., https://fotoshare.co/e/...)');
      return;
    }
    
    setSubmitting(true);
    setSubmitResult(null);
    
    try {
      const response = await axios.post(`${API}/contributor/${contributorLink}/fotoshare`, {
        company_name: companyName,
        fotoshare_url: fotoshareUrl
      });
      
      setSubmitResult(response.data);
      toast.success(`Successfully imported ${response.data.videos_count} videos!`);
      
      // Refresh gallery info to show updated videos
      fetchGalleryInfo();
      
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to import videos';
      toast.error(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 mb-4">
            <Camera className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-light text-zinc-800 mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
            360° Booth Upload
          </h1>
          <p className="text-zinc-600">
            Share your 360 booth videos for <span className="font-medium">{galleryInfo?.gallery_title}</span>
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
                <Camera className="w-7 h-7 text-amber-600" />
              </div>
              <h2 className="text-xl font-semibold text-zinc-800 mb-2">Please Confirm Your Role</h2>
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-6">
              <p className="text-amber-800 text-lg text-center mb-3">
                Are you sure you are the
              </p>
              <p className="text-2xl font-bold text-center text-amber-700" style={{ fontFamily: 'Playfair Display, serif' }}>
                OFFICIAL 360 BOOTH OPERATOR
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
                  <p className="font-medium">Videos imported successfully!</p>
                  <p className="text-sm text-green-600">
                    {submitResult.videos_count} total videos • {submitResult.new_videos_added} new
                    {submitResult.event_title && ` • ${submitResult.event_title}`}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Existing Videos Info */}
          {existingVideos.length > 0 && !submitResult && (
            <div className="mb-6 p-4 bg-pink-50 border border-pink-200 rounded-xl">
              <div className="flex items-center gap-3 text-pink-700">
                <Sparkles className="w-5 h-5" />
                <p className="text-sm">
                  <span className="font-medium">{existingVideos.length} videos</span> already uploaded to this section
                </p>
              </div>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Company Name */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                Your Company / Supplier Name *
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g., 360 Glam Booth Manila"
                className="w-full h-12 px-4 rounded-xl border border-zinc-200 focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 transition-all"
                disabled={submitting}
                data-testid="contributor-name-input"
              />
              <p className="text-xs text-zinc-500 mt-1">
                This will be displayed as the credit for your videos
              </p>
            </div>
            
            {/* Fotoshare URL */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                Fotoshare.co Event URL *
              </label>
              <div className="relative">
                <input
                  type="url"
                  value={fotoshareUrl}
                  onChange={(e) => setFotoshareUrl(e.target.value)}
                  placeholder="https://fotoshare.co/e/your-event-id"
                  className="w-full h-12 px-4 pr-12 rounded-xl border border-zinc-200 focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 transition-all"
                  disabled={submitting}
                  data-testid="fotoshare-url-input"
                />
                {fotoshareUrl && fotoshareUrl.startsWith('https://fotoshare.co/') && (
                  <a
                    href={fotoshareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-pink-500 hover:text-pink-600 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                Paste the link to your fotoshare.co event gallery
              </p>
            </div>
            
            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || !companyName.trim() || !fotoshareUrl.trim()}
              className="w-full h-14 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-xl font-medium flex items-center justify-center gap-3 hover:from-pink-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
              data-testid="submit-fotoshare-btn"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Importing Videos...
                </>
              ) : existingVideos.length > 0 ? (
                <>
                  <RefreshCw className="w-5 h-5" />
                  Update Videos
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Import 360 Videos
                </>
              )}
            </button>
          </form>
          
          {/* Info Box */}
          <div className="mt-8 p-4 bg-zinc-50 rounded-xl">
            <h4 className="font-medium text-zinc-700 mb-2 flex items-center gap-2">
              <Camera className="w-4 h-4" />
              How it works
            </h4>
            <ul className="text-sm text-zinc-600 space-y-1">
              <li>• Enter your company name for attribution</li>
              <li>• Paste your fotoshare.co event link</li>
              <li>• We'll automatically import all videos from the event</li>
              <li>• Videos will appear in the gallery's 360 Booth section</li>
            </ul>
          </div>
          
          {/* Existing Videos Preview */}
          {existingVideos.length > 0 && (
            <div className="mt-8">
              <h4 className="font-medium text-zinc-700 mb-4 flex items-center gap-2">
                <Play className="w-4 h-4" />
                Currently Uploaded ({existingVideos.length} videos)
              </h4>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {existingVideos.slice(0, 12).map((video) => (
                  <div 
                    key={video.id}
                    className="aspect-[9/16] rounded-lg overflow-hidden bg-zinc-200"
                  >
                    <img
                      src={video.thumbnail_url}
                      alt="360 Video"
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  </div>
                ))}
                {existingVideos.length > 12 && (
                  <div className="aspect-[9/16] rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-500 text-sm">
                    +{existingVideos.length - 12} more
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        </>
        )}
        
        {/* Footer */}
        <p className="text-center text-sm text-zinc-500 mt-8">
          Powered by Less Real Moments
        </p>
      </div>
    </div>
  );
};

export default FotoshareContributorUpload;

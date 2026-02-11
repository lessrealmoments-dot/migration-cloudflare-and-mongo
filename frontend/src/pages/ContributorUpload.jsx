import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle, AlertCircle, Loader2, Camera, Building2, ChevronRight, Wifi, Zap } from 'lucide-react';
import useBrandConfig from '../hooks/useBrandConfig';
import { useSmartUploader } from '../hooks/useSmartUploader';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Format speed for display
const formatSpeed = (bytesPerSecond) => {
  if (!bytesPerSecond || bytesPerSecond === 0) return '-- Mbps';
  const mbps = (bytesPerSecond * 8) / (1024 * 1024);
  return `${mbps.toFixed(1)} Mbps`;
};

const ContributorUpload = () => {
  const { contributorLink } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hubLink = searchParams.get('hub');
  const brandConfig = useBrandConfig();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  
  // Company name flow
  const [step, setStep] = useState('name'); // 'name', 'confirm', 'role_confirm', 'upload'
  const [companyName, setCompanyName] = useState('');
  const [confirmedName, setConfirmedName] = useState('');
  
  // Upload state
  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  
  // Smart uploader hook - confirmed name needs to be stable before hook setup
  const {
    uploading,
    progress: uploadProgress,
    stats: uploadStats,
    startUpload,
    cancelUpload,
    clearProgress,
  } = useSmartUploader({
    uploadEndpoint: `${API}/contributor/${contributorLink}/upload`,
    formDataBuilder: (file) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('company_name', confirmedName);
      return formData;
    },
    onFileSuccess: (file, data) => {
      setUploadedPhotos(prev => [...prev, {
        id: data.id,
        url: data.url,
        filename: file.name
      }]);
    },
    onFileError: (file, error, errorMsg) => {
      toast.error(`${file.name}: ${errorMsg}`);
    },
    onAllComplete: (results, completed, failed) => {
      if (completed > 0) {
        toast.success(`${completed} photo(s) uploaded successfully!`);
      }
      // Clear progress after delay
      setTimeout(() => clearProgress(), 3000);
    },
  });
  
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
    const fetchInfo = async () => {
      try {
        const response = await axios.get(`${API}/contributor/${contributorLink}`);
        
        // If this is a video section, redirect to videographer upload page
        if (response.data.section_type === 'video') {
          navigate(`/v/${contributorLink}`, { replace: true });
          return;
        }
        
        setInfo(response.data);
        
        // If contributor name already exists, skip to role confirmation
        if (response.data.existing_contributor_name) {
          setConfirmedName(response.data.existing_contributor_name);
          setStep('role_confirm');
        }
      } catch (err) {
        setError(err.response?.data?.detail || 'Invalid or expired contributor link');
      } finally {
        setLoading(false);
      }
    };
    
    fetchInfo();
  }, [contributorLink, navigate]);

  const handleNameSubmit = (e) => {
    e.preventDefault();
    if (!companyName.trim()) {
      toast.error('Please enter your company name');
      return;
    }
    setStep('confirm');
  };

  const handleNameConfirm = async () => {
    try {
      await axios.post(`${API}/contributor/${contributorLink}/set-name`, {
        company_name: companyName.trim()
      });
      setConfirmedName(companyName.trim());
      setStep('role_confirm');
      toast.success('Company name confirmed!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save company name');
    }
  };

  const handleRoleConfirm = () => {
    setStep('upload');
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;

    // Validate files
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    const validFiles = [];
    const invalidFiles = [];

    for (const file of acceptedFiles) {
      if (file.size > MAX_FILE_SIZE) {
        invalidFiles.push({ name: file.name, reason: 'File too large (max 50MB)' });
      } else if (!file.type.startsWith('image/')) {
        invalidFiles.push({ name: file.name, reason: 'Not an image file' });
      } else {
        validFiles.push(file);
      }
    }

    if (invalidFiles.length > 0) {
      invalidFiles.forEach(f => toast.error(`${f.name}: ${f.reason}`));
    }

    if (validFiles.length === 0) return;

    setUploading(true);
    setUploadProgress(validFiles.map(f => ({ name: f.name, status: 'pending', progress: 0 })));

    // Upload files sequentially
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      
      setUploadProgress(prev => prev.map((p, idx) => 
        idx === i ? { ...p, status: 'uploading', progress: 0 } : p
      ));

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('company_name', confirmedName);

        const response = await axios.post(
          `${API}/contributor/${contributorLink}/upload`,
          formData,
          {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (progressEvent) => {
              const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setUploadProgress(prev => prev.map((p, idx) => 
                idx === i ? { ...p, progress } : p
              ));
            }
          }
        );

        setUploadProgress(prev => prev.map((p, idx) => 
          idx === i ? { ...p, status: 'success', progress: 100 } : p
        ));

        setUploadedPhotos(prev => [...prev, {
          id: response.data.id,
          url: response.data.url,
          filename: file.name
        }]);

      } catch (err) {
        const errorMsg = err.response?.data?.detail || 'Upload failed';
        setUploadProgress(prev => prev.map((p, idx) => 
          idx === i ? { ...p, status: 'error', error: errorMsg } : p
        ));
        toast.error(`${file.name}: ${errorMsg}`);
      }
    }

    setUploading(false);
  }, [contributorLink, confirmedName]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp', '.heic', '.heif']
    },
    disabled: uploading
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-lg shadow-sm p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-medium mb-2">Link Not Found</h1>
          <p className="text-zinc-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <nav className="border-b border-zinc-200 bg-white">
        <div className="max-w-screen-xl mx-auto px-6 py-6">
          <h1 
            className="text-2xl font-medium"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            {brandConfig.brand_name || 'PhotoShare'}
          </h1>
        </div>
      </nav>

      <div className="max-w-screen-md mx-auto px-6 py-12">
        {/* Gallery Info */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Camera className="w-6 h-6 text-zinc-400" />
            <div>
              <h2 className="text-lg font-medium">{info?.gallery_title}</h2>
              <p className="text-sm text-zinc-500">by {info?.photographer_name}</p>
            </div>
          </div>
          <div className="bg-zinc-50 rounded-lg p-4">
            <p className="text-sm text-zinc-600">
              You're uploading to: <span className="font-medium text-zinc-900">{info?.section_name}</span>
            </p>
          </div>
        </div>

        {/* Step 1: Enter Company Name */}
        {step === 'name' && (
          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="flex items-center gap-3 mb-6">
              <Building2 className="w-6 h-6 text-primary" />
              <h3 className="text-xl font-medium">Enter Your Company Name</h3>
            </div>
            <p className="text-zinc-600 mb-6">
              Your company name will be displayed as the contributor for this section. 
              Please ensure correct spelling and capitalization.
            </p>
            <form onSubmit={handleNameSubmit}>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g., Studio XYZ Photography"
                className="w-full px-4 py-3 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-lg"
                autoFocus
                data-testid="company-name-input"
              />
              <button
                type="submit"
                className="mt-4 w-full bg-primary text-white py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                data-testid="continue-btn"
              >
                Continue <ChevronRight className="w-5 h-5" />
              </button>
            </form>
          </div>
        )}

        {/* Step 2: Confirm Company Name */}
        {step === 'confirm' && (
          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="flex items-center gap-3 mb-6">
              <CheckCircle className="w-6 h-6 text-green-500" />
              <h3 className="text-xl font-medium">Confirm Your Company Name</h3>
            </div>
            <p className="text-zinc-600 mb-4">
              Please verify this is exactly how you want your company name to appear:
            </p>
            <div className="bg-zinc-100 rounded-lg p-6 mb-6 text-center">
              <p className="text-2xl font-medium" style={{ fontFamily: 'Playfair Display, serif' }}>
                {companyName}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep('name')}
                className="flex-1 bg-zinc-100 text-zinc-700 py-3 rounded-lg font-medium hover:bg-zinc-200 transition-colors"
              >
                Edit Name
              </button>
              <button
                onClick={handleNameConfirm}
                className="flex-1 bg-primary text-white py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors"
                data-testid="confirm-name-btn"
              >
                Confirm & Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Role Confirmation */}
        {step === 'role_confirm' && (
          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="flex items-center gap-3 mb-6">
              <AlertCircle className="w-6 h-6 text-amber-500" />
              <h3 className="text-xl font-medium">Please Confirm Your Role</h3>
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 mb-6">
              <p className="text-amber-900 text-lg text-center mb-4">
                Are you sure you are the
              </p>
              <p className="text-2xl font-bold text-center text-amber-800" style={{ fontFamily: 'Playfair Display, serif' }}>
                OFFICIAL PHOTOGRAPHER
              </p>
              <p className="text-amber-900 text-lg text-center mt-4">
                for the section "<strong>{info?.section_name}</strong>"?
              </p>
            </div>
            
            <p className="text-zinc-600 text-sm mb-6 text-center">
              ⚠️ Please make sure you're uploading to the correct section. 
              If you're not the assigned photographer for this section, please go back and check with your coordinator.
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={goBackToHub}
                className="flex-1 bg-zinc-100 text-zinc-700 py-3 rounded-lg font-medium hover:bg-zinc-200 transition-colors"
              >
                No, Go Back
              </button>
              <button
                onClick={handleRoleConfirm}
                className="flex-1 bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
                data-testid="confirm-role-btn"
              >
                Yes, I Confirm
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Upload Photos */}
        {step === 'upload' && (
          <div className="space-y-6">
            {/* Contributor Badge */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-green-800 font-medium">Uploading as: {confirmedName}</p>
                <p className="text-green-700 text-sm">Your photos will be credited to this name</p>
              </div>
            </div>

            {/* Gentle Reminder */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-amber-800 text-sm">
                💡 <strong>Tip:</strong> Please upload only your best photos that best represent you as a supplier.
              </p>
            </div>

            {/* Upload Area */}
            <div className="bg-white rounded-lg shadow-sm p-8">
              <h3 className="text-xl font-medium mb-6">Upload Your Photos</h3>
              
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                  isDragActive 
                    ? 'border-primary bg-primary/5' 
                    : uploading 
                      ? 'border-zinc-200 bg-zinc-50 cursor-not-allowed'
                      : 'border-zinc-300 hover:border-primary hover:bg-zinc-50'
                }`}
                data-testid="contributor-upload-dropzone"
              >
                <input {...getInputProps()} disabled={uploading} />
                {uploading ? (
                  <>
                    <Loader2 className="w-12 h-12 mx-auto mb-4 text-primary animate-spin" />
                    <p className="text-base font-light text-zinc-600">Uploading photos...</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-12 h-12 mx-auto mb-4 text-zinc-400" strokeWidth={1.5} />
                    <p className="text-base font-light text-zinc-600 mb-2">
                      Drag & drop your photos here, or click to select
                    </p>
                    <p className="text-sm text-zinc-500">JPEG, PNG, GIF, WebP • Max 50MB per file</p>
                  </>
                )}
              </div>

              {/* Upload Progress */}
              {uploadProgress.length > 0 && (
                <div className="mt-6 space-y-3">
                  <h4 className="font-medium text-zinc-700">Upload Progress</h4>
                  {uploadProgress.map((file, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg">
                      {file.status === 'pending' && (
                        <div className="w-5 h-5 rounded-full border-2 border-zinc-300" />
                      )}
                      {file.status === 'uploading' && (
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                      )}
                      {file.status === 'success' && (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                      {file.status === 'error' && (
                        <AlertCircle className="w-5 h-5 text-red-500" />
                      )}
                      <span className="flex-1 text-sm truncate">{file.name}</span>
                      {file.status === 'uploading' && (
                        <span className="text-sm text-zinc-500">{file.progress}%</span>
                      )}
                      {file.status === 'error' && (
                        <span className="text-sm text-red-500">{file.error}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Uploaded Photos Count */}
              {uploadedPhotos.length > 0 && (
                <div className="mt-6 p-4 bg-green-50 rounded-lg">
                  <p className="text-green-800 font-medium">
                    ✓ {uploadedPhotos.length} photo{uploadedPhotos.length !== 1 ? 's' : ''} uploaded successfully
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-200 py-8 mt-12">
        <div className="max-w-screen-xl mx-auto px-6 text-center text-sm text-zinc-500">
          <p>© {new Date().getFullYear()} {brandConfig.brand_name || 'PhotoShare'}. Contributor Upload Portal.</p>
        </div>
      </footer>
    </div>
  );
};

export default ContributorUpload;

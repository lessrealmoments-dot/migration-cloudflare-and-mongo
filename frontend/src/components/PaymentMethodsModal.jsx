import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { X, Upload, Loader2, Check, CreditCard, Building2, Smartphone, QrCode } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helper to get the correct URL for uploaded files
const getFileUrl = (path) => {
  if (!path) return null;
  // If it's already an absolute URL (http:// or https://), return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  // If path already starts with /api/files, use it directly
  if (path.startsWith('/api/files/')) {
    return `${BACKEND_URL}${path}`;
  }
  // Convert old /uploads/ paths to new /api/files/ format
  if (path.startsWith('/uploads/')) {
    const newPath = path.replace('/uploads/', '/api/files/');
    return `${BACKEND_URL}${newPath}`;
  }
  // For any other path, assume it's relative to backend
  return `${BACKEND_URL}${path}`;
};

const PaymentMethodsModal = ({ 
  isOpen, 
  onClose, 
  onPaymentProofUploaded,
  title = "Choose Payment Method",
  subtitle = "Select your preferred payment method",
  amount = null,
  itemDescription = "payment"
}) => {
  const [paymentMethods, setPaymentMethods] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [paymentProofUrl, setPaymentProofUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      fetchPaymentMethods();
    }
  }, [isOpen]);

  const fetchPaymentMethods = async () => {
    try {
      const response = await axios.get(`${API}/billing/pricing`);
      setPaymentMethods(response.data.payment_methods || {
        gcash: { enabled: true, name: 'GCash', account_name: 'Less Real Moments', account_number: '09952568450' },
        maya: { enabled: true, name: 'Maya', account_name: 'Less Real Moments', account_number: '09952568450' },
        bank: { enabled: false, name: 'Bank Transfer', account_name: '', account_number: '', bank_name: '' },
        paypal: { enabled: false, name: 'PayPal', account_name: '', account_number: '', paypal_email: '' }
      });
    } catch (error) {
      console.error('Failed to fetch payment methods');
      // Use defaults
      setPaymentMethods({
        gcash: { enabled: true, name: 'GCash', account_name: 'Less Real Moments', account_number: '09952568450' },
        maya: { enabled: true, name: 'Maya', account_name: 'Less Real Moments', account_number: '09952568450' },
        bank: { enabled: false, name: 'Bank Transfer', account_name: '', account_number: '', bank_name: '' }
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentProofUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    
    // Check file size (max 10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast.error('File too large. Maximum size is 10MB');
      return;
    }
    
    setUploadingProof(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API}/upload-payment-proof`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        },
        timeout: 60000, // 60 second timeout for large files
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          if (percentCompleted < 100) {
            // Could add progress indicator here
          }
        }
      });
      
      if (response.data.url) {
        setPaymentProofUrl(response.data.url);
        toast.success('Payment proof uploaded!');
      } else {
        throw new Error('No URL returned');
      }
    } catch (error) {
      console.error('Upload error:', error);
      if (error.response?.data?.detail) {
        toast.error(error.response.data.detail);
      } else if (error.code === 'ECONNABORTED') {
        toast.error('Upload timed out. Please try with a smaller image.');
      } else {
        toast.error('Failed to upload payment proof. Please try again.');
      }
    } finally {
      setUploadingProof(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSubmit = () => {
    if (!paymentProofUrl) {
      toast.error('Please upload payment proof first');
      return;
    }
    onPaymentProofUploaded(paymentProofUrl);
  };

  const getMethodIcon = (methodKey) => {
    switch (methodKey) {
      case 'gcash': return <Smartphone className="w-5 h-5 text-blue-600" />;
      case 'maya': return <CreditCard className="w-5 h-5 text-green-600" />;
      case 'bank': return <Building2 className="w-5 h-5 text-zinc-600" />;
      default: return <CreditCard className="w-5 h-5" />;
    }
  };

  const getMethodColor = (methodKey) => {
    switch (methodKey) {
      case 'gcash': return 'border-blue-500 bg-blue-50';
      case 'maya': return 'border-green-500 bg-green-50';
      case 'bank': return 'border-zinc-500 bg-zinc-50';
      default: return 'border-zinc-300 bg-zinc-50';
    }
  };

  if (!isOpen) return null;

  const enabledMethods = paymentMethods ? Object.entries(paymentMethods).filter(([_, m]) => m.enabled) : [];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold">{title}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <p className="text-zinc-600 mb-6">{subtitle}</p>
        
        {amount && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6 text-center">
            <p className="text-sm text-purple-600 mb-1">Amount to Pay</p>
            <p className="text-3xl font-bold text-purple-700">₱{amount.toLocaleString()}</p>
            <p className="text-xs text-purple-500 mt-1">{itemDescription}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
          </div>
        ) : (
          <>
            {/* Payment Method Selection */}
            {!selectedMethod ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-zinc-700 mb-3">Select Payment Method</p>
                {enabledMethods.map(([key, method]) => (
                  <button
                    key={key}
                    onClick={() => setSelectedMethod(key)}
                    className={`w-full p-4 rounded-xl border-2 border-zinc-200 hover:border-purple-400 hover:bg-purple-50/50 transition-colors flex items-center gap-4 text-left`}
                  >
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      key === 'gcash' ? 'bg-blue-100' : 
                      key === 'maya' ? 'bg-green-100' : 'bg-zinc-100'
                    }`}>
                      {getMethodIcon(key)}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-zinc-900">{method.name}</div>
                      <div className="text-sm text-zinc-500">{method.account_number}</div>
                    </div>
                    <div className="text-zinc-400">→</div>
                  </button>
                ))}
                {enabledMethods.length === 0 && (
                  <p className="text-center text-zinc-500 py-4">No payment methods available</p>
                )}
              </div>
            ) : (
              <>
                {/* Selected Method Details */}
                <div className={`rounded-xl border-2 p-4 mb-6 ${getMethodColor(selectedMethod)}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      selectedMethod === 'gcash' ? 'bg-blue-200' : 
                      selectedMethod === 'maya' ? 'bg-green-200' : 'bg-zinc-200'
                    }`}>
                      {getMethodIcon(selectedMethod)}
                    </div>
                    <div>
                      <div className="font-semibold">{paymentMethods[selectedMethod]?.name}</div>
                      <button 
                        onClick={() => { setSelectedMethod(null); setPaymentProofUrl(null); }}
                        className="text-xs text-zinc-500 hover:text-zinc-700"
                      >
                        Change method
                      </button>
                    </div>
                  </div>
                  
                  {/* QR Code */}
                  {paymentMethods[selectedMethod]?.qr_code_url && (
                    <div className="bg-white rounded-lg p-4 mb-4 text-center">
                      <img 
                        src={getFileUrl(paymentMethods[selectedMethod].qr_code_url)}
                        alt={`${paymentMethods[selectedMethod].name} QR Code`}
                        className="w-48 h-48 mx-auto object-contain"
                      />
                      <p className="text-xs text-zinc-500 mt-2">Scan to pay</p>
                    </div>
                  )}
                  
                  {/* Account Details */}
                  <div className="bg-white/80 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-zinc-600">Account Name:</span>
                      <span className="text-sm font-medium">{paymentMethods[selectedMethod]?.account_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-zinc-600">Account Number:</span>
                      <span className="text-sm font-bold text-lg">{paymentMethods[selectedMethod]?.account_number}</span>
                    </div>
                    {selectedMethod === 'bank' && paymentMethods[selectedMethod]?.bank_name && (
                      <div className="flex justify-between">
                        <span className="text-sm text-zinc-600">Bank:</span>
                        <span className="text-sm font-medium">{paymentMethods[selectedMethod].bank_name}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Payment Proof Upload */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    Upload Payment Screenshot *
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePaymentProofUpload}
                    className="hidden"
                  />
                  {paymentProofUrl ? (
                    <div className="border-2 border-green-300 bg-green-50 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-green-700">
                          <Check className="w-5 h-5" />
                          <span className="text-sm font-medium">Payment proof uploaded!</span>
                        </div>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="text-sm text-green-600 hover:underline"
                        >
                          Change
                        </button>
                      </div>
                      <img 
                        src={getFileUrl(paymentProofUrl)} 
                        alt="Payment proof" 
                        className="mt-3 w-full h-32 object-cover rounded-lg"
                      />
                    </div>
                  ) : (
                    <div
                      onClick={() => !uploadingProof && fileInputRef.current?.click()}
                      className="border-2 border-dashed border-zinc-300 rounded-xl p-6 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50/50 transition-colors"
                    >
                      {uploadingProof ? (
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
                          <span className="text-sm text-zinc-600">Uploading...</span>
                        </div>
                      ) : (
                        <>
                          <Upload className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
                          <p className="text-sm font-medium text-zinc-700">Click to upload payment screenshot</p>
                          <p className="text-xs text-zinc-500 mt-1">PNG, JPG up to 5MB</p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Submit Button */}
                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    className="flex-1 py-3 rounded-xl font-medium bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!paymentProofUrl}
                    className="flex-1 py-3 rounded-xl font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Submit Payment
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PaymentMethodsModal;

import React, { useState, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { X, Upload, AlertTriangle, MessageSquare, Loader2, Phone, Mail } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helper to get the correct URL for uploaded files
const getFileUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('/api/files/')) {
    return `${BACKEND_URL}${path}`;
  }
  if (path.startsWith('/uploads/')) {
    const newPath = path.replace('/uploads/', '/api/files/');
    return `${BACKEND_URL}${newPath}`;
  }
  return `${BACKEND_URL}${path}`;
};

const PaymentDisputeModal = ({ 
  isOpen, 
  onClose, 
  onDisputeSubmitted,
  rejectionReason,
  originalProofUrl 
}) => {
  const [disputeMessage, setDisputeMessage] = useState('');
  const [newProofUrl, setNewProofUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API}/upload-payment-proof`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      setNewProofUrl(response.data.url);
      toast.success('New proof uploaded!');
    } catch (error) {
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!disputeMessage.trim()) {
      toast.error('Please explain why you are disputing');
      return;
    }
    if (!newProofUrl) {
      toast.error('Please upload a new payment proof');
      return;
    }
    
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/user/payment-dispute`, {
        dispute_message: disputeMessage,
        new_proof_url: newProofUrl
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('Dispute submitted successfully!');
      onDisputeSubmitted();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit dispute');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold">Dispute Payment</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Warning Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-amber-900">Important Notice</h4>
              <p className="text-sm text-amber-800 mt-1">
                You have <span className="font-bold">1 attempt</span> to dispute this rejection and submit new proof. 
                After this, you will need to contact customer service.
              </p>
            </div>
          </div>
        </div>

        {/* Rejection Reason */}
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-6">
          <h4 className="text-sm font-medium text-red-800 mb-1">Rejection Reason:</h4>
          <p className="text-sm text-red-700">{rejectionReason || 'No reason provided'}</p>
        </div>

        {/* Original Proof */}
        {originalProofUrl && (
          <div className="mb-6">
            <h4 className="text-sm font-medium text-zinc-700 mb-2">Your Original Proof:</h4>
            <img 
              src={getFileUrl(originalProofUrl)} 
              alt="Original payment proof" 
              className="w-full h-32 object-cover rounded-lg border border-zinc-200"
            />
          </div>
        )}

        {/* Dispute Message */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-zinc-700 mb-2">
            <MessageSquare className="w-4 h-4 inline mr-1" />
            Explain Your Dispute *
          </label>
          <textarea
            value={disputeMessage}
            onChange={(e) => setDisputeMessage(e.target.value)}
            placeholder="Please explain why you believe this payment should be approved..."
            className="w-full border border-zinc-300 rounded-xl px-4 py-3 h-24 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {/* New Proof Upload */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-zinc-700 mb-2">
            Upload New Payment Proof *
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          {newProofUrl ? (
            <div className="border-2 border-green-300 bg-green-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-green-700">New proof uploaded</span>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm text-green-600 hover:underline"
                >
                  Change
                </button>
              </div>
              <img 
                src={getFileUrl(newProofUrl)} 
                alt="New payment proof" 
                className="w-full h-32 object-cover rounded-lg"
              />
            </div>
          ) : (
            <div
              onClick={() => !uploading && fileInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-300 rounded-xl p-6 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50/50 transition-colors"
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
                  <span className="text-sm text-zinc-600">Uploading...</span>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
                  <p className="text-sm font-medium text-zinc-700">Click to upload new proof</p>
                  <p className="text-xs text-zinc-500 mt-1">PNG, JPG up to 5MB</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Customer Service Contact */}
        <div className="bg-zinc-50 rounded-xl p-4 mb-6">
          <h4 className="text-sm font-medium text-zinc-700 mb-2">Need Help?</h4>
          <div className="flex flex-col gap-1 text-sm text-zinc-600">
            <a href="tel:09952568450" className="flex items-center gap-2 hover:text-purple-600">
              <Phone className="w-4 h-4" />
              09952568450
            </a>
            <a href="mailto:lessrealmoments@gmail.com" className="flex items-center gap-2 hover:text-purple-600">
              <Mail className="w-4 h-4" />
              lessrealmoments@gmail.com
            </a>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl font-medium bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !disputeMessage.trim() || !newProofUrl}
            className="flex-1 py-3 rounded-xl font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            data-testid="submit-dispute-btn"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Dispute'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentDisputeModal;

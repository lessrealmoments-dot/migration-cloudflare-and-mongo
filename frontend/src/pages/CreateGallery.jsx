import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, AlertCircle, Plus, CreditCard } from 'lucide-react';
import { themes } from '@/themes';
import useBrandConfig from '../hooks/useBrandConfig';
import PaymentMethodsModal from '../components/PaymentMethodsModal';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CreateGallery = () => {
  const navigate = useNavigate();
  const brandConfig = useBrandConfig();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    password: '',
    event_title: '',
    event_date: '',
    coordinator_name: '',
    share_link_expiration_days: 30,
    guest_upload_enabled_days: 3,
    download_all_password: '',
    theme: 'classic'
  });
  const [loading, setLoading] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [limitMessage, setLimitMessage] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pricing, setPricing] = useState({ extra_credit: 500 });
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    fetchPricing();
    fetchSubscription();
  }, []);

  const fetchPricing = async () => {
    try {
      const response = await axios.get(`${API}/billing/pricing`);
      setPricing(response.data);
    } catch (error) {
      console.error('Failed to fetch pricing');
    }
  };

  const fetchSubscription = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/user/subscription`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSubscription(response.data);
    } catch (error) {
      console.error('Failed to fetch subscription');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const payload = {
        title: formData.title,
        description: formData.description || null,
        password: formData.password || null,
        event_title: formData.event_title || null,
        event_date: formData.event_date || null,
        coordinator_name: formData.coordinator_name || null,
        share_link_expiration_days: parseInt(formData.share_link_expiration_days),
        guest_upload_enabled_days: parseInt(formData.guest_upload_enabled_days),
        download_all_password: formData.download_all_password || null,
        theme: formData.theme
      };

      const response = await axios.post(`${API}/galleries`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Check if gallery was created with download lock
      if (response.data.download_locked_until_payment) {
        toast.success('Gallery created! Note: Downloads are locked until your payment is approved.', {
          duration: 5000
        });
      } else {
        toast.success('Gallery created successfully!');
      }
      navigate(`/gallery/${response.data.id}`);
    } catch (error) {
      if (error.response?.status === 403) {
        const detail = error.response?.data?.detail || '';
        if (detail.includes('Demo gallery already created')) {
          setLimitMessage('You have used your free demo gallery. Upgrade to Standard or Pro to create more galleries.');
        } else if (detail.includes('No event credits')) {
          setLimitMessage('You have run out of event credits. Purchase extra credits or wait for your next billing cycle.');
        } else {
          setLimitMessage(detail || 'Gallery limit reached. Please contact administrator.');
        }
        setLimitReached(true);
      } else {
        toast.error(error.response?.data?.detail || 'Failed to create gallery');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBuyCredits = () => {
    setShowPaymentModal(true);
  };

  const handlePaymentProofSubmitted = async (proofUrl) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/user/extra-credits-request`, {
        quantity: 1,
        proof_url: proofUrl
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Extra credit request submitted! Admin will approve shortly.');
      setShowPaymentModal(false);
      setLimitReached(false);
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit request');
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-zinc-200 bg-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-12 py-6">
          <h1
            className="text-2xl font-medium cursor-pointer"
            style={{ fontFamily: 'Playfair Display, serif' }}
            onClick={() => navigate('/dashboard')}
          >
            {brandConfig.brand_name || 'PhotoShare'}
          </h1>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <button
          data-testid="back-button"
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          Back to Dashboard
        </button>

        <h2
          className="text-4xl md:text-5xl font-normal tracking-tight mb-4"
          style={{ fontFamily: 'Playfair Display, serif' }}
        >
          Create New Gallery
        </h2>
        <p className="text-base font-light text-zinc-600 mb-12">
          Set up a new gallery to share with your clients
        </p>

        {/* Gallery Limit Reached Modal */}
        {limitReached && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-8 max-w-md w-full text-center">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8 text-amber-600" strokeWidth={1.5} />
              </div>
              <h3 className="text-2xl font-medium mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
                Gallery Limit Reached
              </h3>
              <p className="text-zinc-600 mb-6">
                {limitMessage}
              </p>
              
              {/* Show Buy Credits option if user is not on free plan */}
              {subscription && subscription.effective_plan !== 'free' && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-purple-700 mb-3">Need more galleries?</p>
                  <button
                    onClick={handleBuyCredits}
                    className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-500 flex items-center gap-2 mx-auto font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Buy Extra Credit (₱{pricing?.extra_credit || 500})
                  </button>
                </div>
              )}
              
              {/* Show Upgrade option if user is on free plan */}
              {subscription && subscription.effective_plan === 'free' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-blue-700 mb-3">Upgrade to create more galleries</p>
                  <button
                    onClick={() => navigate('/pricing')}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-500 flex items-center gap-2 mx-auto font-medium"
                  >
                    <CreditCard className="w-4 h-4" />
                    View Plans
                  </button>
                </div>
              )}
              
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-6 rounded-sm font-medium transition-colors"
                >
                  Back to Dashboard
                </button>
                <button
                  onClick={() => setLimitReached(false)}
                  className="border border-input h-10 px-6 rounded-sm hover:bg-zinc-50 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Payment Methods Modal */}
        <PaymentMethodsModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          onPaymentProofUploaded={handlePaymentProofSubmitted}
          title="Buy Extra Credits"
          subtitle="Purchase additional event credits to create more galleries"
          amount={pricing?.extra_credit || 500}
          itemDescription="1 extra event credit"
        />

        <form onSubmit={handleSubmit} className="space-y-8" data-testid="create-gallery-form">
          <div>
            <label className="block text-sm font-medium mb-2">Gallery Title *</label>
            <input
              data-testid="gallery-title-input"
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200 focus:border-primary"
              placeholder="e.g., Sarah & John Wedding Gallery"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Event Title</label>
            <input
              data-testid="event-title-input"
              type="text"
              value={formData.event_title}
              onChange={(e) => setFormData({ ...formData, event_title: e.target.value })}
              className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200 focus:border-primary"
              placeholder="e.g., Sarah & John's Wedding"
            />
            <p className="text-xs text-zinc-500 mt-2">
              The event name that will be displayed to guests
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Event Date</label>
            <input
              data-testid="event-date-input"
              type="date"
              value={formData.event_date}
              onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
              className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200 focus:border-primary"
            />
            <p className="text-xs text-zinc-500 mt-2">
              Guest upload window will be calculated from this date
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Coordinator Name (Optional)</label>
            <input
              data-testid="coordinator-name-input"
              type="text"
              value={formData.coordinator_name}
              onChange={(e) => setFormData({ ...formData, coordinator_name: e.target.value })}
              placeholder="e.g., Events by Sarah"
              className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200 focus:border-primary"
            />
            <p className="text-xs text-zinc-500 mt-2">
              Event coordinator/planner who organized this event
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description (Optional)</label>
            <textarea
              data-testid="gallery-description-input"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="flex min-h-[100px] w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200 focus:border-primary resize-none"
              placeholder="Add a description for your gallery..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">Share Link Expiration</label>
              <select
                data-testid="share-link-expiration-select"
                value={formData.share_link_expiration_days}
                onChange={(e) => setFormData({ ...formData, share_link_expiration_days: e.target.value })}
                className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200 focus:border-primary"
              >
                <option value="30">30 days</option>
                <option value="60">60 days</option>
                <option value="90">90 days</option>
              </select>
              <p className="text-xs text-zinc-500 mt-2">
                Gallery access will expire after this period
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Guest Upload Window</label>
              <select
                data-testid="guest-upload-window-select"
                value={formData.guest_upload_enabled_days}
                onChange={(e) => setFormData({ ...formData, guest_upload_enabled_days: e.target.value })}
                className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200 focus:border-primary"
              >
                <option value="1">1 day after event</option>
                <option value="2">2 days after event</option>
                <option value="3">3 days after event</option>
                <option value="4">4 days after event</option>
                <option value="5">5 days after event</option>
                <option value="6">6 days after event</option>
                <option value="7">7 days after event</option>
              </select>
              <p className="text-xs text-zinc-500 mt-2">
                How long guests can upload photos after the event
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Gallery Password (Optional)</label>
            <input
              data-testid="gallery-password-input"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200 focus:border-primary"
              placeholder="Leave empty for public access"
            />
            <p className="text-xs text-zinc-500 mt-2">
              If set, guests will need this password to view and upload photos
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Download All Password (Optional)</label>
            <input
              data-testid="download-all-password-input"
              type="password"
              value={formData.download_all_password}
              onChange={(e) => setFormData({ ...formData, download_all_password: e.target.value })}
              className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200 focus:border-primary"
              placeholder="Password for bulk download"
            />
            <p className="text-xs text-zinc-500 mt-2">
              Separate password for the celebrant to download all photos at once
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-4">Gallery Theme</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(themes).map(([key, theme]) => (
                <div
                  key={key}
                  data-testid={`theme-${key}`}
                  onClick={() => setFormData({ ...formData, theme: key })}
                  className={`cursor-pointer border-2 rounded-lg p-4 transition-all duration-300 hover:shadow-md ${
                    formData.theme === key 
                      ? 'border-primary ring-2 ring-primary/20' 
                      : 'border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  {/* Color palette preview */}
                  <div className="flex gap-1 mb-3">
                    <div 
                      className="w-8 h-8 rounded-full border border-zinc-200"
                      style={{ backgroundColor: theme.colors.background }}
                      title="Background"
                    />
                    <div 
                      className="w-8 h-8 rounded-full border border-zinc-200"
                      style={{ backgroundColor: theme.colors.primary }}
                      title="Primary"
                    />
                    <div 
                      className="w-8 h-8 rounded-full border border-zinc-200"
                      style={{ backgroundColor: theme.colors.accent }}
                      title="Accent"
                    />
                    <div 
                      className="w-8 h-8 rounded-full border border-zinc-200"
                      style={{ backgroundColor: theme.colors.text }}
                      title="Text"
                    />
                  </div>
                  <h4 className="font-medium text-sm">{theme.name}</h4>
                  <p className="text-xs text-zinc-500 line-clamp-1">{theme.description}</p>
                  {formData.theme === key && (
                    <div className="mt-2 text-xs text-primary font-medium">✓ Selected</div>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Choose a theme that matches your event style
            </p>
          </div>

          <div className="flex gap-4">
            <button
              data-testid="create-gallery-submit-button"
              type="submit"
              disabled={loading}
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-8 rounded-sm font-medium tracking-wide transition-all duration-300 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Gallery'}
            </button>
            <button
              data-testid="create-gallery-cancel-button"
              type="button"
              onClick={() => navigate('/dashboard')}
              className="border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-8 rounded-sm transition-all duration-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateGallery;

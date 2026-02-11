import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Crown, Zap, Star, ArrowRight, Sparkles, Shield, Clock, Users, QrCode, Monitor, Download, AlertCircle, X, Upload } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import useBrandConfig from '../hooks/useBrandConfig';
import PaymentMethodsModal from '../components/PaymentMethodsModal';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helper to get the correct URL for uploaded files
const getFileUrl = (path) => {
  if (!path) return null;
  // If it's already an absolute URL (http:// or https://), return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  if (path.startsWith('/api/files/')) {
    return `${BACKEND_URL}${path}`;
  }
  if (path.startsWith('/uploads/')) {
    const newPath = path.replace('/uploads/', '/api/files/');
    return `${BACKEND_URL}${newPath}`;
  }
  return `${BACKEND_URL}${path}`;
};

const PricingPage = () => {
  const navigate = useNavigate();
  const brandConfig = useBrandConfig();
  const [pricing, setPricing] = useState({
    standard_monthly: 1000,
    pro_monthly: 1500,
    extra_credit: 500,
    plan_features: {
      standard: { display_mode: false, collaboration_link: false, gallery_retention: '6 months' },
      pro: { display_mode: true, collaboration_link: true, gallery_retention: '6 months' }
    }
  });
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(null); // Plan name
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  useEffect(() => {
    fetchPricing();
    checkUser();
  }, []);

  const checkUser = async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const response = await axios.get(`${API}/user/subscription`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSubscription(response.data);
        setUser(true);
      } catch (error) {
        setUser(null);
      }
    }
  };

  const fetchPricing = async () => {
    try {
      const response = await fetch(`${API}/billing/pricing`);
      if (response.ok) {
        const data = await response.json();
        setPricing(data);
      }
    } catch (error) {
      console.error('Failed to fetch pricing');
    }
  };

  const handlePlanSelect = (planName) => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/auth');
      return;
    }
    
    const currentPlan = subscription?.effective_plan || 'free';
    const selectedPlan = planName.toLowerCase();
    
    if (selectedPlan === currentPlan) {
      toast.info('You are already on this plan');
      return;
    }
    
    // Determine if this is a downgrade
    const planHierarchy = { 'free': 0, 'standard': 1, 'pro': 2 };
    const isDowngrade = planHierarchy[selectedPlan] < planHierarchy[currentPlan];
    
    if (isDowngrade) {
      // Show downgrade confirmation
      const billingCycleStart = subscription?.billing_cycle_start;
      let nextBillingDate = 'your next billing cycle';
      if (billingCycleStart) {
        const cycleStart = new Date(billingCycleStart);
        cycleStart.setDate(cycleStart.getDate() + 30);
        nextBillingDate = cycleStart.toLocaleDateString();
      }
      
      if (selectedPlan === 'free') {
        toast.info(`Downgrade to Free: Please contact admin. Your current features will remain until ${nextBillingDate}.`);
      } else {
        toast.info(`Downgrade to ${planName}: Your account will be downgraded on ${nextBillingDate}. Features like Display Mode and Contributor Links will be disabled then.`);
      }
      return;
    }
    
    // Show upgrade modal with PaymentMethodsModal
    setShowUpgradeModal(selectedPlan);
  };

  const handleUpgradeWithProof = async (proofUrl) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/user/upgrade-request`, {
        requested_plan: showUpgradeModal,
        proof_url: proofUrl
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Upgrade request submitted! Awaiting admin approval.');
      setShowUpgradeModal(null);
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit request');
    }
  };

  const formatPrice = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  // Dynamic plan features from admin settings
  const freeFeatures = pricing.plan_features?.free || {};
  const standardFeatures = pricing.plan_features?.standard || {};
  const proFeatures = pricing.plan_features?.pro || {};

  // Build plans dynamically from API data
  const plans = [
    {
      name: 'Free',
      description: 'Try before you commit',
      price: 0,
      icon: Star,
      color: 'zinc',
      features: [
        { text: '1 Demo Gallery', included: true },
        { text: `${freeFeatures.storage_per_gallery_gb || 1}GB Storage per Gallery`, included: true },
        { text: `Gallery expires in ${freeFeatures.gallery_retention || '6 hours'}`, included: true, warning: true },
        { text: 'All features during demo', included: true },
        { text: 'QR Code Sharing', included: false, afterDemo: true },
        { text: 'Display Mode', included: false, afterDemo: true },
        { text: 'Contributor Links', included: false, afterDemo: true },
      ],
      cta: 'Start Free',
      popular: false
    },
    {
      name: 'Standard',
      description: 'For growing photographers',
      price: pricing.standard_monthly,
      icon: Zap,
      color: 'blue',
      features: [
        { text: `${standardFeatures.tokens_per_month || 2} Subscription Tokens/month`, included: true },
        { text: `${standardFeatures.storage_per_gallery_gb || 10}GB Storage per Gallery`, included: true },
        { text: `${standardFeatures.gallery_retention || '3 months'} Gallery Retention`, included: true },
        { text: 'QR Code Sharing', included: standardFeatures.qr_code !== false },
        { text: 'Online Gallery Access', included: true },
        { text: 'Guest Uploads', included: true },
        { text: 'Display Mode (Slideshow + Collage)', included: standardFeatures.display_mode === true },
        { text: 'Contributor Links', included: standardFeatures.collaboration_link === true },
      ],
      cta: 'Get Started',
      popular: false
    },
    {
      name: 'Pro',
      description: 'For professional studios',
      price: pricing.pro_monthly,
      icon: Crown,
      color: 'purple',
      features: [
        { text: `${proFeatures.tokens_per_month || 2} Subscription Tokens/month`, included: true },
        { text: `${proFeatures.storage_per_gallery_gb || 15}GB Storage per Gallery`, included: true },
        { text: `${proFeatures.gallery_retention || '6 months'} Gallery Retention`, included: true },
        { text: 'All Standard Features', included: true },
        { text: 'Display Mode (Slideshow + Collage)', included: proFeatures.display_mode !== false },
        { text: 'Contributor Upload Links', included: proFeatures.collaboration_link !== false },
        { text: 'Supplier-specific Sections', included: true },
        { text: 'Priority Support', included: true },
      ],
      cta: 'Go Pro',
      popular: true
    }
  ];

  // FAQs updated to match current system
  const faqs = [
    {
      q: 'What is a Subscription Token?',
      a: `Each Subscription Token allows you to create one Event Gallery. Standard and Pro plans include ${standardFeatures.tokens_per_month || 2} tokens per month. Unused subscription tokens do NOT roll over - they reset each billing cycle.`
    },
    {
      q: 'What are Add-on Tokens?',
      a: `Add-on Tokens can be purchased separately at ${formatPrice(pricing.addon_token_price || pricing.extra_credit || 500)} each. Unlike subscription tokens, add-on tokens are valid for 12 months from purchase and are used first when creating galleries.`
    },
    {
      q: 'What is the storage limit?',
      a: `Storage is measured per gallery, not total account storage. Standard plans get ${standardFeatures.storage_per_gallery_gb || 10}GB per gallery, while Pro plans get ${proFeatures.storage_per_gallery_gb || 15}GB per gallery.`
    },
    {
      q: 'How long are galleries stored?',
      a: `Gallery retention depends on your plan. Standard galleries are stored for ${standardFeatures.gallery_retention || '3 months'}, and Pro galleries for ${proFeatures.gallery_retention || '6 months'}. After your subscription expires, you have a 2-month grace period to upload, and galleries remain viewable for 6 months.`
    },
    {
      q: 'What happens if my subscription expires?',
      a: 'Your existing galleries remain accessible. Subscription tokens are lost, but any unused add-on tokens are preserved for up to 12 months. You can still upload for 2 months after expiration, and galleries stay viewable for 6 months.'
    },
    {
      q: 'What is Display Mode?',
      a: 'Display Mode lets you showcase your galleries as a slideshow or live collage on TVs and projectors at events. This feature is available on Pro plans only.'
    },
    {
      q: 'What are Contributor Links?',
      a: 'Contributor Links allow other suppliers (videographers, second shooters, HMUA, etc.) to upload directly to your gallery with their company name credited. Available on Pro plans only.'
    }
  ];

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Navigation */}
      <nav className="border-b border-zinc-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <h1
            className="text-lg sm:text-xl font-medium cursor-pointer"
            style={{ fontFamily: 'Playfair Display, serif' }}
            onClick={() => navigate('/')}
          >
            {brandConfig.brand_name || 'PhotoShare'}
          </h1>
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => navigate('/auth')}
              className="text-sm text-zinc-600 hover:text-zinc-900 hidden sm:block"
            >
              Sign In
            </button>
            <button
              onClick={() => navigate('/auth')}
              className="bg-zinc-900 text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-800"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="bg-gradient-to-b from-white to-zinc-50 pt-10 sm:pt-16 pb-8 sm:pb-12">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6">
          <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium mb-4 sm:mb-6">
            <Sparkles className="w-4 h-4" />
            Simple, transparent pricing
          </div>
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-medium mb-3 sm:mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
            Choose the plan that fits your needs
          </h1>
          <p className="text-base sm:text-lg text-zinc-600 max-w-2xl mx-auto">
            Start free, upgrade when you're ready. No hidden fees, no surprises.
          </p>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-12 sm:pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {plans.map((plan) => {
            const Icon = plan.icon;
            const colorClasses = {
              zinc: { bg: 'bg-zinc-100', text: 'text-zinc-600', border: 'border-zinc-200' },
              blue: { bg: 'bg-blue-100', text: 'text-blue-600', border: 'border-blue-200' },
              purple: { bg: 'bg-purple-100', text: 'text-purple-600', border: 'border-purple-300' }
            };
            const colors = colorClasses[plan.color];
            
            return (
              <div
                key={plan.name}
                className={`bg-white rounded-2xl border-2 ${plan.popular ? 'border-purple-400 shadow-lg shadow-purple-100 sm:scale-105' : 'border-zinc-200'} p-4 sm:p-6 relative`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white px-3 sm:px-4 py-1 rounded-full text-xs font-medium whitespace-nowrap">
                    Most Popular
                  </div>
                )}
                
                <div className={`w-10 h-10 sm:w-12 sm:h-12 ${colors.bg} rounded-xl flex items-center justify-center mb-3 sm:mb-4`}>
                  <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${colors.text}`} />
                </div>
                
                <h3 className="text-lg sm:text-xl font-semibold mb-1">{plan.name}</h3>
                <p className="text-xs sm:text-sm text-zinc-500 mb-3 sm:mb-4">{plan.description}</p>
                
                <div className="mb-4 sm:mb-6">
                  <span className="text-3xl sm:text-4xl font-bold">{formatPrice(plan.price)}</span>
                  {plan.price > 0 && <span className="text-zinc-500 text-sm">/month</span>}
                </div>
                
                <button
                  onClick={() => handlePlanSelect(plan.name)}
                  className={`w-full py-2.5 sm:py-3 rounded-xl font-medium mb-4 sm:mb-6 transition-colors text-sm sm:text-base ${
                    plan.popular 
                      ? 'bg-purple-600 text-white hover:bg-purple-700' 
                      : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200'
                  } ${subscription?.effective_plan === plan.name.toLowerCase() ? 'opacity-50 cursor-default' : ''}`}
                >
                  {subscription?.effective_plan === plan.name.toLowerCase() 
                    ? 'Current Plan' 
                    : plan.cta}
                </button>
                
                <ul className="space-y-2 sm:space-y-3">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2 sm:gap-3">
                      {feature.included ? (
                        <Check className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      ) : (
                        <X className="w-4 h-4 sm:w-5 sm:h-5 text-zinc-300 flex-shrink-0 mt-0.5" />
                      )}
                      <span className={`text-sm ${feature.included ? 'text-zinc-700' : 'text-zinc-400'}`}>
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Extra Credits */}
        <div className="mt-6 sm:mt-8 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600" />
            </div>
            <div>
              <h4 className="font-semibold text-base sm:text-lg">Need more events?</h4>
              <p className="text-sm text-zinc-600">Purchase extra Event Credits anytime</p>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-xl sm:text-2xl font-bold text-amber-700">{formatPrice(pricing.extra_credit)}</div>
            <div className="text-xs sm:text-sm text-zinc-500">per Event Credit</div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="bg-white border-y border-zinc-200 py-12 sm:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-xl sm:text-2xl font-semibold text-center mb-8 sm:mb-12" style={{ fontFamily: 'Playfair Display, serif' }}>
            Everything you need to share your events
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
            {[
              { icon: QrCode, title: 'QR Code Sharing', desc: 'Generate QR codes for easy gallery access at events' },
              { icon: Monitor, title: 'Display Mode', desc: 'Slideshow and Live Collage for viewing stations' },
              { icon: Upload, title: 'Guest Uploads', desc: 'Let guests contribute their photos to the gallery' },
              { icon: Users, title: 'Contributor Links', desc: 'Invite other photographers to upload to sections' },
              { icon: Download, title: 'Bulk Downloads', desc: 'Download all photos in one click' },
              { icon: Shield, title: '6-Month Retention', desc: 'Your galleries are safe for 6 months' },
              { icon: Clock, title: '7-Day Edit Window', desc: 'Edit event details within 7 days of creation' },
              { icon: Sparkles, title: 'Custom Branding', desc: 'Your brand, your galleries' },
            ].map((feature, idx) => (
              <div key={idx} className="text-center">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-zinc-100 rounded-xl flex items-center justify-center mx-auto mb-2 sm:mb-3">
                  <feature.icon className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-600" />
                </div>
                <h4 className="font-medium mb-1 text-sm sm:text-base">{feature.title}</h4>
                <p className="text-xs sm:text-sm text-zinc-500">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="py-12 sm:py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <h2 className="text-xl sm:text-2xl font-semibold text-center mb-8 sm:mb-12" style={{ fontFamily: 'Playfair Display, serif' }}>
            Frequently Asked Questions
          </h2>
          <div className="space-y-3 sm:space-y-4">
            {faqs.map((faq, idx) => (
              <div key={idx} className="bg-white border border-zinc-200 rounded-xl p-4 sm:p-5">
                <h4 className="font-medium mb-2 text-sm sm:text-base">{faq.q}</h4>
                <p className="text-xs sm:text-sm text-zinc-600">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-zinc-900 text-white py-12 sm:py-16">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-medium mb-3 sm:mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
            Ready to get started?
          </h2>
          <p className="text-zinc-400 mb-6 sm:mb-8 text-sm sm:text-base">
            Try for free, no credit card required.
          </p>
          <button
            onClick={() => navigate('/auth')}
            className="bg-white text-zinc-900 px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl font-medium hover:bg-zinc-100 inline-flex items-center gap-2 text-sm sm:text-base"
          >
            Create Your First Gallery
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white py-6 sm:py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs sm:text-sm text-zinc-500 text-center sm:text-left">
            © 2024 {brandConfig.brand_name || 'EventsGallery'}. All rights reserved.
          </p>
          <div className="flex items-center gap-4 sm:gap-6">
            <a href="/" className="text-xs sm:text-sm text-zinc-600 hover:text-zinc-900">Home</a>
            <a href="/auth" className="text-xs sm:text-sm text-zinc-600 hover:text-zinc-900">Sign Up</a>
          </div>
        </div>
      </footer>
      
      {/* Upgrade Modal - Using PaymentMethodsModal for consistent UI */}
      <PaymentMethodsModal
        isOpen={!!showUpgradeModal}
        onClose={() => setShowUpgradeModal(null)}
        onPaymentProofUploaded={handleUpgradeWithProof}
        title={`Upgrade to ${showUpgradeModal === 'standard' ? 'Standard' : 'Pro'}`}
        subtitle={
          subscription?.effective_plan === 'standard' && showUpgradeModal === 'pro'
            ? `Your current ${subscription?.total_credits || 0} credit(s) will be kept, plus you'll get 2 additional Pro credits!`
            : "Complete your upgrade by uploading payment proof"
        }
        amount={showUpgradeModal === 'standard' ? pricing.standard_monthly : pricing.pro_monthly}
        itemDescription={`${showUpgradeModal === 'standard' ? 'Standard' : 'Pro'} Plan (Monthly)`}
      />
    </div>
  );
};

export default PricingPage;

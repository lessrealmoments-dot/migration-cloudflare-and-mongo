import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, Crown, Zap, Star, ArrowRight, Sparkles, Shield, Clock, Upload, Users, QrCode, Monitor, Download, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import useBrandConfig from '../hooks/useBrandConfig';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PricingPage = () => {
  const navigate = useNavigate();
  const brandConfig = useBrandConfig();
  const [pricing, setPricing] = useState({
    standard_monthly: 1000,
    pro_monthly: 1500,
    extra_credit: 500
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
    if (!user) {
      navigate('/auth');
      return;
    }
    
    const currentPlan = subscription?.effective_plan || 'free';
    
    if (planName.toLowerCase() === currentPlan) {
      toast.info('You are already on this plan');
      return;
    }
    
    if (planName.toLowerCase() === 'free') {
      toast.info('Contact admin to downgrade to Free plan');
      return;
    }
    
    // Show upgrade modal
    setShowUpgradeModal(planName.toLowerCase());
  };

  const handleUpgradeRequest = async () => {
    setUpgradeLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/user/upgrade-request`, {
        requested_plan: showUpgradeModal
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Upgrade request submitted! Please submit payment proof.');
      setShowUpgradeModal(null);
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit request');
    } finally {
      setUpgradeLoading(false);
    }
  };

  const formatPrice = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const plans = [
    {
      name: 'Free',
      description: 'Try before you commit',
      price: 0,
      icon: Star,
      color: 'zinc',
      features: [
        { text: '1 Demo Gallery', included: true },
        { text: '500MB Storage', included: true },
        { text: 'All features for 6 hours', included: true },
        { text: 'View-only after demo period', included: true },
        { text: 'QR Code Sharing', included: false },
        { text: 'Display Mode', included: false },
        { text: 'Contributor Links', included: false },
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
        { text: '2 Event Credits/month', included: true },
        { text: '500MB Storage per gallery', included: true },
        { text: 'QR Code Sharing', included: true },
        { text: 'Online Gallery Access', included: true },
        { text: 'Display Mode (Slideshow)', included: true },
        { text: 'Guest Uploads', included: true },
        { text: 'Contributor Links', included: false },
        { text: 'Supplier Sections', included: false },
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
        { text: '2 Event Credits/month', included: true },
        { text: '500MB Storage per gallery', included: true },
        { text: 'All Standard Features', included: true },
        { text: 'Contributor Upload Links', included: true },
        { text: 'Supplier-specific Sections', included: true },
        { text: 'Supplier Attribution', included: true },
        { text: 'Live Collage Display', included: true },
        { text: 'Priority Support', included: true },
      ],
      cta: 'Go Pro',
      popular: true
    }
  ];

  const faqs = [
    {
      q: 'What is an Event Credit?',
      a: 'One Event Credit allows you to create one Event Gallery. Each gallery represents a single event (wedding, birthday, corporate event, etc.). Credits reset monthly and do not roll over.'
    },
    {
      q: 'Can I purchase additional credits?',
      a: `Yes! You can purchase extra Event Credits at ${formatPrice(pricing.extra_credit)} per credit. Extra credits are valid for the current billing cycle only.`
    },
    {
      q: 'How long are galleries stored?',
      a: 'All galleries are retained for 6 months from creation date, regardless of your plan. After 6 months, galleries are automatically deleted.'
    },
    {
      q: 'What happens if I downgrade?',
      a: 'Your existing galleries remain accessible. You just won\'t be able to use Pro features for new galleries. No content is deleted when you downgrade.'
    },
    {
      q: 'How do I pay?',
      a: 'We accept GCash and PayMaya. Simply upload a screenshot of your payment confirmation, and our team will verify it within 24 hours.'
    }
  ];

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Navigation */}
      <nav className="border-b border-zinc-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1
            className="text-xl font-medium cursor-pointer"
            style={{ fontFamily: 'Playfair Display, serif' }}
            onClick={() => navigate('/')}
          >
            {brandConfig.brand_name || 'PhotoShare'}
          </h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/auth')}
              className="text-sm text-zinc-600 hover:text-zinc-900"
            >
              Sign In
            </button>
            <button
              onClick={() => navigate('/auth')}
              className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-800"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="bg-gradient-to-b from-white to-zinc-50 pt-16 pb-12">
        <div className="max-w-4xl mx-auto text-center px-6">
          <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-1.5 rounded-full text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            Simple, transparent pricing
          </div>
          <h1 className="text-4xl md:text-5xl font-medium mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
            Choose the plan that fits your needs
          </h1>
          <p className="text-lg text-zinc-600 max-w-2xl mx-auto">
            Start free, upgrade when you're ready. No hidden fees, no surprises.
          </p>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid md:grid-cols-3 gap-6">
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
                className={`bg-white rounded-2xl border-2 ${plan.popular ? 'border-purple-400 shadow-lg shadow-purple-100' : 'border-zinc-200'} p-6 relative`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white px-4 py-1 rounded-full text-xs font-medium">
                    Most Popular
                  </div>
                )}
                
                <div className={`w-12 h-12 ${colors.bg} rounded-xl flex items-center justify-center mb-4`}>
                  <Icon className={`w-6 h-6 ${colors.text}`} />
                </div>
                
                <h3 className="text-xl font-semibold mb-1">{plan.name}</h3>
                <p className="text-sm text-zinc-500 mb-4">{plan.description}</p>
                
                <div className="mb-6">
                  <span className="text-4xl font-bold">{formatPrice(plan.price)}</span>
                  {plan.price > 0 && <span className="text-zinc-500">/month</span>}
                </div>
                
                <button
                  onClick={() => handlePlanSelect(plan.name)}
                  className={`w-full py-3 rounded-xl font-medium mb-6 transition-colors ${
                    plan.popular 
                      ? 'bg-purple-600 text-white hover:bg-purple-700' 
                      : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200'
                  } ${subscription?.effective_plan === plan.name.toLowerCase() ? 'opacity-50 cursor-default' : ''}`}
                >
                  {subscription?.effective_plan === plan.name.toLowerCase() 
                    ? 'Current Plan' 
                    : plan.cta}
                </button>
                
                <ul className="space-y-3">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      {feature.included ? (
                        <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      ) : (
                        <X className="w-5 h-5 text-zinc-300 flex-shrink-0 mt-0.5" />
                      )}
                      <span className={feature.included ? 'text-zinc-700' : 'text-zinc-400'}>
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
        <div className="mt-8 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h4 className="font-semibold text-lg">Need more events?</h4>
              <p className="text-zinc-600">Purchase extra Event Credits anytime</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-amber-700">{formatPrice(pricing.extra_credit)}</div>
            <div className="text-sm text-zinc-500">per Event Credit</div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="bg-white border-y border-zinc-200 py-16">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-2xl font-semibold text-center mb-12" style={{ fontFamily: 'Playfair Display, serif' }}>
            Everything you need to share your events
          </h2>
          <div className="grid md:grid-cols-4 gap-8">
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
                <div className="w-12 h-12 bg-zinc-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <feature.icon className="w-6 h-6 text-zinc-600" />
                </div>
                <h4 className="font-medium mb-1">{feature.title}</h4>
                <p className="text-sm text-zinc-500">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="py-16">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-semibold text-center mb-12" style={{ fontFamily: 'Playfair Display, serif' }}>
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div key={idx} className="bg-white border border-zinc-200 rounded-xl p-5">
                <h4 className="font-medium mb-2">{faq.q}</h4>
                <p className="text-sm text-zinc-600">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-zinc-900 text-white py-16">
        <div className="max-w-4xl mx-auto text-center px-6">
          <h2 className="text-3xl font-medium mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
            Ready to get started?
          </h2>
          <p className="text-zinc-400 mb-8">
            Try for free, no credit card required.
          </p>
          <button
            onClick={() => navigate('/auth')}
            className="bg-white text-zinc-900 px-8 py-3 rounded-xl font-medium hover:bg-zinc-100 inline-flex items-center gap-2"
          >
            Create Your First Gallery
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white py-8">
        <div className="max-w-6xl mx-auto px-6 flex justify-between items-center">
          <p className="text-sm text-zinc-500">
            © 2025 {brandConfig.brand_name || 'PhotoShare'}. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a href="/" className="text-sm text-zinc-600 hover:text-zinc-900">Home</a>
            <a href="/auth" className="text-sm text-zinc-600 hover:text-zinc-900">Sign Up</a>
          </div>
        </div>
      </footer>
      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-semibold mb-2">
              Upgrade to {showUpgradeModal === 'standard' ? 'Standard' : 'Pro'}
            </h3>
            <p className="text-zinc-600 mb-6">
              You're about to upgrade your plan. Here's what happens next:
            </p>
            
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
              <h4 className="font-medium text-blue-900 mb-3">Payment Instructions</h4>
              <ol className="text-sm text-blue-800 space-y-2">
                <li className="flex gap-2">
                  <span className="font-bold">1.</span>
                  <span>Send {formatPrice(showUpgradeModal === 'standard' ? pricing.standard_monthly : pricing.pro_monthly)} via GCash or PayMaya</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold">2.</span>
                  <span>Take a screenshot of the confirmation</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold">3.</span>
                  <span>Upload proof in your Dashboard</span>
                </li>
              </ol>
              <div className="mt-4 pt-3 border-t border-blue-200">
                <p className="text-sm font-medium text-blue-900">GCash/PayMaya Number:</p>
                <p className="text-xl font-bold text-blue-900">09952568450</p>
                <p className="text-xs text-blue-700">Less Real Moments</p>
              </div>
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-6">
              <div className="flex gap-2 items-start">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  Your upgrade will be activated once payment is verified (usually within 24 hours).
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowUpgradeModal(null)}
                className="flex-1 py-3 rounded-xl font-medium bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
              >
                Cancel
              </button>
              <button
                onClick={handleUpgradeRequest}
                disabled={upgradeLoading}
                className="flex-1 py-3 rounded-xl font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {upgradeLoading ? 'Processing...' : 'Request Upgrade'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PricingPage;

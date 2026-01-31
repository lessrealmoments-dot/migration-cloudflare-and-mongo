import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Camera, Mail, ArrowLeft } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Auth = ({ setUser }) => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    business_name: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const endpoint = isLogin ? `${API}/auth/login` : `${API}/auth/register`;
      const payload = isLogin
        ? { email: formData.email, password: formData.password }
        : formData;

      const response = await axios.post(endpoint, payload);
      const { access_token, user } = response.data;

      localStorage.setItem('token', access_token);
      localStorage.setItem('user', JSON.stringify(user));
      setUser(user);

      toast.success(isLogin ? 'Welcome back!' : 'Account created successfully!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await axios.post(`${API}/auth/forgot-password`, { email: forgotEmail });
      toast.success('If this email is registered, a new password has been sent.');
      setShowForgotPassword(false);
      setForgotEmail('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to send password reset');
    } finally {
      setLoading(false);
    }
  };

  // Forgot Password View
  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-white flex">
        <div className="hidden md:flex md:w-1/2 bg-zinc-50/50 items-center justify-center p-12">
          <div className="max-w-md">
            <Camera className="w-16 h-16 mb-8" strokeWidth={1.5} />
            <h2
              className="text-4xl md:text-5xl font-normal tracking-tight mb-6"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              Forgot Your
              <br />
              Password?
            </h2>
            <p className="text-base font-light leading-relaxed text-zinc-600">
              No worries! Enter your email and we&apos;ll send you a new password.
            </p>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            <div className="mb-12">
              <h1
                className="text-4xl md:text-5xl font-normal tracking-tight mb-4"
                style={{ fontFamily: 'Playfair Display, serif' }}
              >
                Reset Password
              </h1>
              <p className="text-base font-light text-zinc-600">
                Enter your email to receive a new password
              </p>
            </div>

            <form onSubmit={handleForgotPassword} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <div className="relative">
                  <Mail className="w-5 h-5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.5} />
                  <input
                    data-testid="forgot-email-input"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="flex h-10 w-full rounded-sm border border-input bg-transparent pl-10 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200"
                    placeholder="Enter your email"
                    required
                  />
                </div>
              </div>

              <button
                data-testid="forgot-submit-button"
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-8 rounded-sm font-medium tracking-wide transition-all duration-300 disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send New Password'}
              </button>
            </form>

            <div className="mt-6">
              <button
                onClick={() => setShowForgotPassword(false)}
                className="flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex">
      <div className="hidden md:flex md:w-1/2 bg-zinc-50/50 items-center justify-center p-12">
        <div className="max-w-md">
          <Camera className="w-16 h-16 mb-8" strokeWidth={1.5} />
          <h2
            className="text-4xl md:text-5xl font-normal tracking-tight mb-6"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            Professional
            <br />
            Photo Galleries
          </h2>
          <p className="text-base font-light leading-relaxed text-zinc-600">
            Create beautiful galleries, share with clients, and accept guest uploads seamlessly.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-12">
            <h1
              className="text-4xl md:text-5xl font-normal tracking-tight mb-4"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              {isLogin ? 'Welcome Back' : 'Get Started'}
            </h1>
            <p className="text-base font-light text-zinc-600">
              {isLogin ? 'Log in to your account' : 'Create your photographer account'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6" data-testid="auth-form">
            {!isLogin && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">Name</label>
                  <input
                    data-testid="auth-name-input"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200 focus:border-primary"
                    placeholder="Your name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Business Name <span className="text-zinc-400 font-normal">(Optional)</span></label>
                  <input
                    data-testid="auth-business-name-input"
                    type="text"
                    value={formData.business_name}
                    onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                    className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200 focus:border-primary"
                    placeholder="Shown on guest galleries instead of your name"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                data-testid="auth-email-input"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200 focus:border-primary"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <input
                data-testid="auth-password-input"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200 focus:border-primary"
                required
              />
            </div>

            <button
              data-testid="auth-submit-button"
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-8 rounded-sm font-medium tracking-wide transition-all duration-300 disabled:opacity-50"
            >
              {loading ? 'Please wait...' : isLogin ? 'Log In' : 'Create Account'}
            </button>
          </form>

          {isLogin && (
            <div className="mt-4 text-center">
              <button
                data-testid="forgot-password-link"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
              >
                Forgot your password?
              </button>
            </div>
          )}

          <div className="mt-6 text-center">
            <button
              data-testid="auth-toggle-button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
            </button>
          </div>

          <div className="mt-8">
            <button
              data-testid="auth-back-home-button"
              onClick={() => navigate('/')}
              className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              ← Back to home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Lock, Key, Loader2 } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

/**
 * Password gate for contributor upload pages.
 * If the section requires a password, renders a form before allowing access.
 *
 * Usage:
 *   <ContributorPasswordGate
 *     contributorLink={contributorLink}
 *     onVerified={() => setStep('company')}
 *     hubLink={hubLink}
 *     onBack={goBackToHub}
 *   />
 */
const ContributorPasswordGate = ({ contributorLink, onVerified, hubLink, onBack }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      toast.error('Please enter the section password');
      return;
    }
    setLoading(true);
    try {
      const response = await axios.post(`${API}/contributor/${contributorLink}/verify-password`, { password });
      if (response.data.verified) {
        toast.success('Access granted!');
        onVerified();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Incorrect password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8 max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-amber-600" />
        </div>
        <h2 className="text-xl font-semibold text-zinc-800 mb-2">Password Required</h2>
        <p className="text-zinc-500 text-sm">
          This section is password-protected. Enter the password to continue.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-2">Section Password</label>
          <div className="relative">
            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter the password"
              className="w-full pl-12 pr-4 py-3 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all text-lg"
              autoFocus
              data-testid="section-password-input"
            />
          </div>
          <p className="text-xs text-zinc-400 mt-2">
            Don't have the password? Contact the section creator or gallery owner.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          data-testid="unlock-section-btn"
        >
          {loading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Verifying...</>
          ) : (
            <><Lock className="w-5 h-5" /> Unlock Section</>
          )}
        </button>
      </form>

      {hubLink && onBack && (
        <div className="text-center mt-6">
          <button
            onClick={onBack}
            className="text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
          >
            ← Back to Coordinator Hub
          </button>
        </div>
      )}
    </div>
  );
};

export default ContributorPasswordGate;

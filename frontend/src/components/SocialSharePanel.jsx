import React, { useState } from 'react';
import { Share2, X, Link, Check } from 'lucide-react';
import { toast } from 'sonner';

// Social media icons as simple SVGs
const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const TwitterIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

const SocialSharePanel = ({ galleryTitle, shareLink, isVisible = true }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Extract share code from the URL
  const shareCode = shareLink.split('/g/')[1] || shareLink.split('/').pop();
  
  // Create OG-enabled share URL (uses backend endpoint for social media previews)
  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
  const ogShareUrl = `${BACKEND_URL}/api/og/gallery/${shareCode}`;
  
  // View-only URL for when users click through
  const viewOnlyUrl = `${shareLink}?view=1`;
  
  const encodedOgUrl = encodeURIComponent(ogShareUrl);
  const encodedTitle = encodeURIComponent(`Check out this photo gallery: ${galleryTitle}`);

  const shareLinks = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedOgUrl}`,
    twitter: `https://twitter.com/intent/tweet?url=${encodedOgUrl}&text=${encodedTitle}`,
    whatsapp: `https://wa.me/?text=${encodedTitle}%20${encodedOgUrl}`,
  };

  const handleShare = (platform) => {
    window.open(shareLinks[platform], '_blank', 'width=600,height=400');
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(viewOnlyUrl);
      setCopied(true);
      toast.success('Link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = viewOnlyUrl;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        toast.success('Link copied!');
        setTimeout(() => setCopied(false), 2000);
      } catch (e) {
        toast.error('Failed to copy link');
      }
      document.body.removeChild(textArea);
    }
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Floating Share Button - Smaller on mobile, positioned lower to avoid covering content */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        data-testid="social-share-toggle"
        className={`fixed z-40 transition-all duration-300 
          right-3 bottom-24 md:right-4 md:top-1/2 md:-translate-y-1/2 md:bottom-auto
          p-2 md:p-3 rounded-full shadow-lg
          ${isOpen 
            ? 'bg-zinc-900 text-white scale-90' 
            : 'bg-white/90 backdrop-blur-sm text-zinc-600 hover:bg-white hover:shadow-xl hover:text-zinc-900'
          }`}
        title="Share this gallery"
      >
        {isOpen ? <X className="w-4 h-4 md:w-5 md:h-5" /> : <Share2 className="w-4 h-4 md:w-5 md:h-5" />}
      </button>

      {/* Share Panel - Positioned above button on mobile, beside on desktop */}
      {isOpen && (
        <div 
          className="fixed z-30
            right-3 bottom-36 md:right-4 md:top-1/2 md:-translate-y-1/2 md:bottom-auto md:mr-14"
          data-testid="social-share-panel"
        >
          <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-xl p-3 md:p-4 space-y-2 md:space-y-3 border border-zinc-200 min-w-[160px] md:min-w-[180px]">
            <p className="text-[10px] md:text-xs text-zinc-500 font-medium uppercase tracking-wide mb-1 md:mb-2">Share Gallery</p>
            
            {/* Facebook */}
            <button
              onClick={() => handleShare('facebook')}
              data-testid="share-facebook"
              className="flex items-center gap-2 md:gap-3 w-full p-1.5 md:p-2 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
            >
              <FacebookIcon />
              <span className="text-xs md:text-sm font-medium">Facebook</span>
            </button>

            {/* Twitter/X */}
            <button
              onClick={() => handleShare('twitter')}
              data-testid="share-twitter"
              className="flex items-center gap-2 md:gap-3 w-full p-1.5 md:p-2 rounded-lg hover:bg-zinc-100 text-zinc-900 transition-colors"
            >
              <TwitterIcon />
              <span className="text-xs md:text-sm font-medium">X (Twitter)</span>
            </button>

            {/* WhatsApp */}
            <button
              onClick={() => handleShare('whatsapp')}
              data-testid="share-whatsapp"
              className="flex items-center gap-2 md:gap-3 w-full p-1.5 md:p-2 rounded-lg hover:bg-green-50 text-green-600 transition-colors"
            >
              <WhatsAppIcon />
              <span className="text-xs md:text-sm font-medium">WhatsApp</span>
            </button>

            {/* Copy Link */}
            <button
              onClick={handleCopyLink}
              data-testid="share-copy-link"
              className="flex items-center gap-2 md:gap-3 w-full p-1.5 md:p-2 rounded-lg hover:bg-zinc-100 text-zinc-700 transition-colors border-t border-zinc-100 pt-2 md:pt-3 mt-1 md:mt-2"
            >
              {copied ? <Check className="w-4 h-4 md:w-5 md:h-5 text-green-500" /> : <Link className="w-4 h-4 md:w-5 md:h-5" />}
              <span className="text-xs md:text-sm font-medium">{copied ? 'Copied!' : 'Copy Link'}</span>
            </button>

            <p className="text-[10px] md:text-xs text-zinc-400 mt-1 md:mt-2 pt-1 md:pt-2 border-t border-zinc-100">
              Shared links are view-only
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default SocialSharePanel;

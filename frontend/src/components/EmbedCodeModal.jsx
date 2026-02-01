import React, { useState } from 'react';
import { X, Copy, Check, Code } from 'lucide-react';
import { toast } from 'sonner';

const EmbedCodeModal = ({ galleryTitle, shareLink, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [embedSize, setEmbedSize] = useState('medium');

  const sizes = {
    small: { width: 400, height: 300 },
    medium: { width: 600, height: 450 },
    large: { width: 800, height: 600 },
    responsive: { width: '100%', height: 500 }
  };

  const selectedSize = sizes[embedSize];
  const isResponsive = embedSize === 'responsive';

  // Generate embed URL with view-only mode
  const embedUrl = `${shareLink}?view=1&embed=1`;

  // Generate embed code
  const embedCode = isResponsive
    ? `<div style="position: relative; width: 100%; padding-bottom: 75%; overflow: hidden;">
  <iframe 
    src="${embedUrl}" 
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; border-radius: 8px;"
    title="${galleryTitle}"
    loading="lazy"
    allowfullscreen>
  </iframe>
</div>`
    : `<iframe 
  src="${embedUrl}" 
  width="${selectedSize.width}" 
  height="${selectedSize.height}" 
  style="border: none; border-radius: 8px;"
  title="${galleryTitle}"
  loading="lazy"
  allowfullscreen>
</iframe>`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      toast.success('Embed code copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = embedCode;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        toast.success('Embed code copied!');
        setTimeout(() => setCopied(false), 2000);
      } catch (e) {
        toast.error('Failed to copy');
      }
      document.body.removeChild(textArea);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-zinc-200">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-zinc-100 rounded-lg flex items-center justify-center">
                <Code className="w-5 h-5 text-zinc-600" />
              </div>
              <div>
                <h3 className="text-xl font-medium">Embed Gallery</h3>
                <p className="text-sm text-zinc-500">Add this gallery to your website</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
              data-testid="close-embed-modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Size Selection */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-3">Select Size</label>
            <div className="grid grid-cols-4 gap-2">
              {Object.keys(sizes).map((size) => (
                <button
                  key={size}
                  onClick={() => setEmbedSize(size)}
                  data-testid={`embed-size-${size}`}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                    embedSize === size
                      ? 'bg-zinc-900 text-white'
                      : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              {isResponsive 
                ? 'Responsive: Adapts to container width' 
                : `${selectedSize.width}×${selectedSize.height}px`}
            </p>
          </div>

          {/* Preview */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-3">Preview</label>
            <div 
              className="border border-zinc-200 rounded-lg bg-zinc-50 p-4 overflow-hidden"
              style={{ maxHeight: 300 }}
            >
              <div 
                className="bg-zinc-200 rounded-lg flex items-center justify-center text-zinc-500"
                style={{ 
                  width: isResponsive ? '100%' : Math.min(selectedSize.width, 500),
                  height: isResponsive ? 200 : Math.min(selectedSize.height, 250),
                  margin: '0 auto'
                }}
              >
                <div className="text-center">
                  <Code className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Gallery Preview</p>
                  <p className="text-xs opacity-75">{galleryTitle}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Embed Code */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-3">Embed Code</label>
            <div className="relative">
              <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap">
                {embedCode}
              </pre>
              <button
                onClick={handleCopy}
                data-testid="copy-embed-code"
                className="absolute top-2 right-2 bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">How to use</h4>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Copy the embed code above</li>
              <li>Paste it into your website's HTML where you want the gallery to appear</li>
              <li>The embedded gallery is view-only (visitors cannot upload photos)</li>
            </ol>
          </div>
        </div>

        <div className="p-6 border-t border-zinc-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-zinc-300 rounded-lg hover:bg-zinc-50 transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleCopy}
            className="px-6 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-2"
          >
            <Copy className="w-4 h-4" />
            Copy Code
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmbedCodeModal;

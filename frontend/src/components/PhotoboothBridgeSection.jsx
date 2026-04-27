import React, { useEffect, useState } from 'react';
import { Camera, Download, QrCode, X, Loader2 } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * PhotoboothBridgeSection
 * Renders DSLRBooth bridge sessions grouped by session_id.
 * Each session = one capture set. Guests can:
 *  - View the photos (oldest first)
 *  - Download the set as ZIP
 *  - Scan a QR code to download on their phone
 */
export default function PhotoboothBridgeSection({ section, shareLink, themeColors }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qrFor, setQrFor] = useState(null); // session_id

  useEffect(() => {
    if (!shareLink) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/public/gallery/${shareLink}/sessions`);
        if (!r.ok) throw new Error('failed');
        const data = await r.json();
        if (cancelled) return;
        // Filter to this section only
        const mine = (data.sessions || []).filter(
          (s) => !s.section_id || s.section_id === section.id
        );
        setSessions(mine);
      } catch (e) {
        if (!cancelled) setSessions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shareLink, section.id]);

  const downloadUrl = (sid) =>
    `${API}/public/gallery/${shareLink}/session/${sid}/download`;
  const qrUrl = (sid) => `${API}/public/gallery/${shareLink}/session/${sid}/qr`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading photobooth sessions…
      </div>
    );
  }

  if (sessions.length === 0) return null;

  const accent = themeColors?.accent || '#a855f7';
  const text = themeColors?.text || '#111827';
  const bg = themeColors?.background || '#ffffff';

  return (
    <section
      id={`section-${section.id}`}
      className="py-16 md:py-24"
      style={{ backgroundColor: bg }}
      data-testid={`photobooth-bridge-section-${section.id}`}
    >
      <div className="max-w-screen-2xl mx-auto px-6 md:px-12 lg:px-24">
        <div className="text-center mb-10 md:mb-14">
          <p className="text-xs uppercase tracking-[0.3em] mb-3" style={{ color: accent }}>
            {sessions.length} {sessions.length === 1 ? 'Set' : 'Sets'} · Photobooth
          </p>
          <h3
            className="text-3xl md:text-4xl lg:text-5xl font-normal tracking-tight flex items-center justify-center gap-3"
            style={{ color: text }}
          >
            <Camera className="h-7 w-7" style={{ color: accent }} />
            {section.name}
          </h3>
          <p className="mt-3 text-sm text-gray-500">
            Find your set, scan the QR with your phone, or download the ZIP instantly.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {sessions.map((s) => (
            <div
              key={s.session_id}
              className="rounded-lg overflow-hidden bg-white shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
              data-testid={`bridge-session-card-${s.session_id}`}
            >
              <div className="aspect-square bg-gray-100 overflow-hidden">
                {s.cover_url ? (
                  <img
                    src={s.cover_url}
                    alt={s.session_id}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <Camera className="h-12 w-12" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 truncate">
                    {(s.earliest_captured_at || '').replace('T', ' ').slice(0, 16) || s.session_id}
                  </span>
                  <span className="text-xs font-medium text-gray-700">
                    {s.file_count} {s.file_count === 1 ? 'file' : 'files'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <a
                    href={downloadUrl(s.session_id)}
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-gray-900 text-white text-xs font-medium py-2 hover:bg-gray-800"
                    data-testid={`bridge-session-download-${s.session_id}`}
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                  <button
                    onClick={() => setQrFor(s.session_id)}
                    className="inline-flex items-center justify-center gap-1 rounded border border-gray-300 text-xs font-medium py-2 px-3 hover:bg-gray-50"
                    style={{ color: text }}
                    data-testid={`bridge-session-qr-${s.session_id}`}
                  >
                    <QrCode className="h-3.5 w-3.5" /> QR
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {qrFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setQrFor(null)}
          data-testid="bridge-qr-modal"
        >
          <div
            className="bg-white rounded-lg p-6 max-w-sm w-full text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-base font-semibold text-gray-900">Scan to download</h4>
              <button
                onClick={() => setQrFor(null)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100"
                data-testid="bridge-qr-close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <img
              src={qrUrl(qrFor)}
              alt="QR code"
              className="mx-auto w-64 h-64"
              data-testid="bridge-qr-image"
            />
            <p className="mt-3 text-xs text-gray-500 break-all">{downloadUrl(qrFor)}</p>
          </div>
        </div>
      )}
    </section>
  );
}

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Users,
  Check,
  X,
  HelpCircle,
  Download,
  Copy,
  ExternalLink,
  Edit,
  Trash2,
  Link2,
  Calendar,
  Clock,
  MapPin,
  Eye,
  QrCode,
  Share2,
  MoreVertical,
  Mail,
  Phone,
  MessageSquare,
  RefreshCw
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function InvitationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState(null);
  const [rsvps, setRsvps] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const [galleries, setGalleries] = useState([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeData, setQrCodeData] = useState(null);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [invRes, rsvpRes, statsRes, galRes] = await Promise.all([
        axios.get(`${API}/api/invitations/${id}`, { headers }),
        axios.get(`${API}/api/invitations/${id}/rsvps`, { headers }),
        axios.get(`${API}/api/invitations/${id}/stats`, { headers }),
        axios.get(`${API}/api/galleries`, { headers })
      ]);

      setInvitation(invRes.data);
      setRsvps(rsvpRes.data);
      setStats(statsRes.data);
      setGalleries(galRes.data);
    } catch (error) {
      toast.error('Failed to load invitation');
      navigate('/invitations');
    } finally {
      setLoading(false);
    }
  };

  const fetchQRCode = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/api/invitations/${id}/qr-code-base64`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setQrCodeData(response.data);
      setShowQRModal(true);
    } catch (error) {
      toast.error('Failed to generate QR code');
    }
  };

  const downloadQRCode = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/api/invitations/${id}/qr-code`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `invitation_qr_${invitation.share_link}.png`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('QR code downloaded!');
    } catch (error) {
      toast.error('Failed to download QR code');
    }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/i/${invitation.share_link}`;
    await navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard!');
  };

  const publishInvitation = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/api/invitations/${id}/publish`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Invitation published!');
      fetchData();
    } catch (error) {
      toast.error('Failed to publish invitation');
    }
  };

  const deleteRSVP = async (rsvpId) => {
    if (!window.confirm('Delete this RSVP?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/api/invitations/${id}/rsvps/${rsvpId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('RSVP deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete RSVP');
    }
  };

  const exportRSVPs = async (format = 'csv') => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/api/invitations/${id}/export?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: format === 'csv' ? 'blob' : 'json'
      });

      if (format === 'csv') {
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const a = document.createElement('a');
        a.href = url;
        a.download = `rsvps_${invitation.title.replace(/\s+/g, '_')}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        toast.success('RSVPs exported!');
      }
    } catch (error) {
      toast.error('Failed to export RSVPs');
    }
  };

  const linkGallery = async (galleryId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/api/invitations/${id}/link-gallery?gallery_id=${galleryId}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Gallery linked!');
      setShowLinkModal(false);
      fetchData();
    } catch (error) {
      toast.error('Failed to link gallery');
    }
  };

  const filteredRSVPs = rsvps.filter(rsvp => {
    if (activeTab === 'all') return true;
    if (activeTab === 'attending') return rsvp.attendance_status === 'attending';
    if (activeTab === 'not_attending') return rsvp.attendance_status === 'not_attending';
    if (activeTab === 'maybe') return rsvp.attendance_status === 'maybe';
    return true;
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return 'TBD';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900"></div>
      </div>
    );
  }

  if (!invitation) return null;

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/invitations')}
                className="p-2 hover:bg-zinc-100 rounded-lg"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-semibold text-zinc-900">{invitation.title}</h1>
                <p className="text-sm text-zinc-500">{invitation.host_names}</p>
              </div>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                invitation.status === 'published' 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {invitation.status === 'published' ? 'Live' : 'Draft'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {invitation.status !== 'published' && (
                <button
                  onClick={publishInvitation}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                >
                  Publish
                </button>
              )}
              <button
                onClick={copyLink}
                className="flex items-center gap-2 px-4 py-2 border border-zinc-300 rounded-lg hover:bg-zinc-50 text-sm"
              >
                <Copy className="w-4 h-4" />
                Copy Link
              </button>
              <button
                onClick={() => window.open(`/i/${invitation.share_link}`, '_blank')}
                className="flex items-center gap-2 px-4 py-2 border border-zinc-300 rounded-lg hover:bg-zinc-50 text-sm"
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="p-2 border border-zinc-300 rounded-lg hover:bg-zinc-50"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-zinc-200 py-1 z-10">
                    <button
                      onClick={() => { navigate(`/invitations/${id}/edit`); setMenuOpen(false); }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-50 flex items-center gap-2"
                    >
                      <Edit className="w-4 h-4" /> Edit Invitation
                    </button>
                    <button
                      onClick={() => { exportRSVPs('csv'); setMenuOpen(false); }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-50 flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" /> Export RSVPs
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Stats & Info */}
          <div className="space-y-6">
            {/* Stats Card */}
            <div className="bg-white rounded-xl border border-zinc-200 p-6">
              <h2 className="text-lg font-semibold text-zinc-900 mb-4">RSVP Summary</h2>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="text-center p-4 bg-zinc-50 rounded-lg">
                  <p className="text-3xl font-bold text-zinc-900">{stats?.total_rsvps || 0}</p>
                  <p className="text-sm text-zinc-500">Total RSVPs</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <p className="text-3xl font-bold text-green-600">{stats?.total_guests || 0}</p>
                  <p className="text-sm text-zinc-500">Total Guests</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-sm text-zinc-600">Attending</span>
                  </div>
                  <span className="font-medium">{stats?.attending_count || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-sm text-zinc-600">Not Attending</span>
                  </div>
                  <span className="font-medium">{stats?.not_attending_count || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-sm text-zinc-600">Maybe</span>
                  </div>
                  <span className="font-medium">{stats?.maybe_count || 0}</span>
                </div>
              </div>
            </div>

            {/* Event Info */}
            <div className="bg-white rounded-xl border border-zinc-200 p-6">
              <h2 className="text-lg font-semibold text-zinc-900 mb-4">Event Details</h2>
              
              <div className="space-y-4">
                {invitation.event_date && (
                  <div className="flex items-start gap-3">
                    <Calendar className="w-5 h-5 text-zinc-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-zinc-500">Date</p>
                      <p className="font-medium">{formatDate(invitation.event_date)}</p>
                    </div>
                  </div>
                )}
                {invitation.event_time && (
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-zinc-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-zinc-500">Time</p>
                      <p className="font-medium">{invitation.event_time}</p>
                    </div>
                  </div>
                )}
                {invitation.venue_name && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-zinc-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-zinc-500">Venue</p>
                      <p className="font-medium">{invitation.venue_name}</p>
                      {invitation.venue_address && (
                        <p className="text-sm text-zinc-500">{invitation.venue_address}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Link Gallery */}
            <div className="bg-white rounded-xl border border-zinc-200 p-6">
              <h2 className="text-lg font-semibold text-zinc-900 mb-4">Linked Gallery</h2>
              
              {invitation.linked_gallery_id ? (
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-medium text-green-700">Gallery Linked</span>
                  </div>
                  <button
                    onClick={() => navigate(`/gallery/${invitation.linked_gallery_id}`)}
                    className="text-sm text-green-600 hover:underline"
                  >
                    View Gallery
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-zinc-500 mb-3">
                    Link a photo gallery to this invitation. Guests who RSVP will see the gallery link.
                  </p>
                  <button
                    onClick={() => setShowLinkModal(true)}
                    className="w-full py-2 border border-zinc-300 rounded-lg hover:bg-zinc-50 text-sm"
                  >
                    Link Gallery
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - RSVP List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-zinc-200">
              {/* Tabs */}
              <div className="border-b border-zinc-200 px-6 py-3">
                <div className="flex items-center gap-1">
                  {[
                    { id: 'all', label: 'All', count: rsvps.length },
                    { id: 'attending', label: 'Attending', count: stats?.attending_count || 0 },
                    { id: 'not_attending', label: 'Not Attending', count: stats?.not_attending_count || 0 },
                    { id: 'maybe', label: 'Maybe', count: stats?.maybe_count || 0 }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === tab.id
                          ? 'bg-zinc-900 text-white'
                          : 'text-zinc-600 hover:bg-zinc-100'
                      }`}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>
              </div>

              {/* RSVP List */}
              <div className="divide-y divide-zinc-100">
                {filteredRSVPs.length === 0 ? (
                  <div className="p-12 text-center">
                    <Users className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
                    <p className="text-zinc-500">No RSVPs yet</p>
                    <p className="text-sm text-zinc-400 mt-1">
                      Share your invitation link to start collecting responses
                    </p>
                  </div>
                ) : (
                  filteredRSVPs.map(rsvp => (
                    <div key={rsvp.id} className="p-4 hover:bg-zinc-50">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            rsvp.attendance_status === 'attending' ? 'bg-green-100' :
                            rsvp.attendance_status === 'not_attending' ? 'bg-red-100' :
                            'bg-amber-100'
                          }`}>
                            {rsvp.attendance_status === 'attending' ? (
                              <Check className="w-5 h-5 text-green-600" />
                            ) : rsvp.attendance_status === 'not_attending' ? (
                              <X className="w-5 h-5 text-red-600" />
                            ) : (
                              <HelpCircle className="w-5 h-5 text-amber-600" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-zinc-900">{rsvp.guest_name}</p>
                            <div className="flex items-center gap-4 mt-1 text-sm text-zinc-500">
                              {rsvp.attendance_status === 'attending' && (
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {rsvp.guest_count} guest{rsvp.guest_count > 1 ? 's' : ''}
                                </span>
                              )}
                              {rsvp.guest_email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="w-3 h-3" />
                                  {rsvp.guest_email}
                                </span>
                              )}
                              {rsvp.guest_phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3" />
                                  {rsvp.guest_phone}
                                </span>
                              )}
                            </div>
                            {rsvp.message && (
                              <p className="mt-2 text-sm text-zinc-600 italic">
                                "{rsvp.message}"
                              </p>
                            )}
                            <p className="text-xs text-zinc-400 mt-2">
                              {formatDateTime(rsvp.submitted_at)}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => deleteRSVP(rsvp.id)}
                          className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Link Gallery Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-zinc-900 mb-4">Link a Gallery</h3>
            <p className="text-sm text-zinc-500 mb-4">
              Select a gallery to link to this invitation. Guests who RSVP will see a link to the gallery.
            </p>
            
            <div className="max-h-64 overflow-y-auto space-y-2">
              {galleries.length === 0 ? (
                <p className="text-center text-zinc-500 py-4">No galleries available</p>
              ) : (
                galleries.map(gallery => (
                  <button
                    key={gallery.id}
                    onClick={() => linkGallery(gallery.id)}
                    className="w-full p-3 text-left border border-zinc-200 rounded-lg hover:bg-zinc-50"
                  >
                    <p className="font-medium text-zinc-900">{gallery.title}</p>
                    <p className="text-sm text-zinc-500">{formatDate(gallery.event_date)}</p>
                  </button>
                ))
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowLinkModal(false)}
                className="flex-1 py-2 border border-zinc-300 rounded-lg hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={() => navigate('/gallery/create')}
                className="flex-1 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800"
              >
                Create New Gallery
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

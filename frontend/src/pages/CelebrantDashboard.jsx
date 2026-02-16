import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
  Link2,
  Unlink,
  Calendar,
  Clock,
  MapPin,
  Eye,
  QrCode,
  Search,
  Plus,
  UserPlus,
  Phone,
  Mail,
  MessageSquare,
  Image as ImageIcon,
  Share2,
  ChevronDown,
  ChevronUp,
  Filter,
  Key,
  Trash2
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function CelebrantDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState(null);
  const [rsvps, setRsvps] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeData, setQrCodeData] = useState(null);
  const [showAddGuestModal, setShowAddGuestModal] = useState(false);
  const [showExternalLinkModal, setShowExternalLinkModal] = useState(false);
  const [showLinkGalleryModal, setShowLinkGalleryModal] = useState(false);
  const [showCelebrantLinkModal, setShowCelebrantLinkModal] = useState(false);
  const [galleries, setGalleries] = useState([]);
  const [celebrantLink, setCelebrantLink] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    attending: true,
    not_attending: true,
    maybe: true
  });
  
  // Add guest form
  const [newGuest, setNewGuest] = useState({
    guest_name: '',
    guest_email: '',
    guest_phone: '',
    attendance_status: 'attending',
    guest_count: 1,
    notes: '',
    added_via: 'manual'
  });
  
  const [externalUrl, setExternalUrl] = useState('');

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
      setRsvps(rsvpRes.data.rsvps || rsvpRes.data);
      setStats(statsRes.data);
      setGalleries(galRes.data || []);
      setExternalUrl(invRes.data.external_invitation_url || '');
      
      // Set celebrant link if exists
      if (invRes.data.celebrant_access_code) {
        setCelebrantLink(`${window.location.origin}/celebrant/${invRes.data.celebrant_access_code}`);
      }
    } catch (error) {
      toast.error('Failed to load data');
      navigate('/invitations');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/i/${invitation.share_link}`;
    await navigator.clipboard.writeText(url);
    toast.success('RSVP link copied!');
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

  const generateCelebrantLink = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API}/api/invitations/${id}/generate-celebrant-link`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const newLink = `${window.location.origin}${response.data.celebrant_link}`;
      setCelebrantLink(newLink);
      setShowCelebrantLinkModal(true);
      toast.success('Celebrant access link generated!');
    } catch (error) {
      toast.error('Failed to generate celebrant link');
    }
  };

  const revokeCelebrantLink = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API}/api/invitations/${id}/revoke-celebrant-link`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCelebrantLink(null);
      toast.success('Celebrant access revoked');
    } catch (error) {
      toast.error('Failed to revoke access');
    }
  };

  const linkGallery = async (galleryId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API}/api/invitations/${id}/link-gallery?gallery_id=${galleryId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Gallery linked successfully!');
      setShowLinkGalleryModal(false);
      fetchData();
    } catch (error) {
      toast.error('Failed to link gallery');
    }
  };

  const unlinkGallery = async () => {
    if (!window.confirm('Are you sure you want to unlink this gallery? The RSVP will no longer show gallery photos.')) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API}/api/invitations/${id}`,
        { linked_gallery_id: null, linked_gallery_share_link: null, linked_gallery_cover_photo: null },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Gallery unlinked');
      fetchData();
    } catch (error) {
      toast.error('Failed to unlink gallery');
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
      a.download = `rsvp_qr_${invitation.share_link}.png`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('QR code downloaded!');
    } catch (error) {
      toast.error('Failed to download QR code');
    }
  };

  const handleAddGuest = async (e) => {
    e.preventDefault();
    if (!newGuest.guest_name) {
      toast.error('Guest name is required');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/api/invitations/${id}/guests`, newGuest, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('Guest added successfully!');
      setShowAddGuestModal(false);
      setNewGuest({
        guest_name: '',
        guest_email: '',
        guest_phone: '',
        attendance_status: 'attending',
        guest_count: 1,
        notes: '',
        added_via: 'manual'
      });
      fetchData();
    } catch (error) {
      toast.error('Failed to add guest');
    }
  };

  const saveExternalLink = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/api/invitations/${id}`, 
        { external_invitation_url: externalUrl },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success('External invitation link saved!');
      setShowExternalLinkModal(false);
      setInvitation(prev => ({ ...prev, external_invitation_url: externalUrl }));
    } catch (error) {
      toast.error('Failed to save link');
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
        a.download = `guest_list_${invitation.title.replace(/\s+/g, '_')}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        toast.success('Guest list exported!');
      }
    } catch (error) {
      toast.error('Failed to export');
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Filter guests by search
  const filterGuests = (guests) => {
    if (!searchQuery) return guests;
    const query = searchQuery.toLowerCase();
    return guests.filter(g => 
      g.guest_name?.toLowerCase().includes(query) ||
      g.guest_email?.toLowerCase().includes(query) ||
      g.guest_phone?.includes(query)
    );
  };

  // Group guests by status
  const groupedGuests = {
    attending: filterGuests(rsvps.filter(r => r.attendance_status === 'attending')),
    not_attending: filterGuests(rsvps.filter(r => r.attendance_status === 'not_attending')),
    maybe: filterGuests(rsvps.filter(r => r.attendance_status === 'maybe' || r.attendance_status === 'pending'))
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
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

  const totalExpectedGuests = groupedGuests.attending.reduce((sum, g) => sum + (g.guest_count || 1), 0);

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4">
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
            </div>
            <div className="flex items-center gap-2">
              <Link
                to={`/invitations/${id}/edit`}
                className="flex items-center gap-2 px-3 py-2 border border-zinc-300 rounded-lg hover:bg-zinc-50 text-sm"
              >
                <Edit className="w-4 h-4" />
                Edit
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <button
              onClick={copyLink}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
              data-testid="copy-link-btn"
            >
              <Copy className="w-6 h-6 text-blue-600" />
              <span className="text-sm font-medium text-zinc-700">Copy Link</span>
            </button>
            
            <button
              onClick={fetchQRCode}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
              data-testid="qr-code-btn"
            >
              <QrCode className="w-6 h-6 text-purple-600" />
              <span className="text-sm font-medium text-zinc-700">QR Code</span>
            </button>
            
            <button
              onClick={() => window.open(`/i/${invitation.share_link}`, '_blank')}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
              data-testid="preview-btn"
            >
              <Eye className="w-6 h-6 text-green-600" />
              <span className="text-sm font-medium text-zinc-700">Preview</span>
            </button>
            
            <button
              onClick={() => setShowAddGuestModal(true)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
              data-testid="add-guest-btn"
            >
              <UserPlus className="w-6 h-6 text-amber-600" />
              <span className="text-sm font-medium text-zinc-700">Add Guest</span>
            </button>
            
            <button
              onClick={() => setShowExternalLinkModal(true)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
              data-testid="external-link-btn"
            >
              <ExternalLink className="w-6 h-6 text-rose-600" />
              <span className="text-sm font-medium text-zinc-700">External Link</span>
            </button>
            
            <button
              onClick={() => exportRSVPs('csv')}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
              data-testid="export-btn"
            >
              <Download className="w-6 h-6 text-zinc-600" />
              <span className="text-sm font-medium text-zinc-700">Export</span>
            </button>
          </div>

          {/* Host-Only Actions */}
          <div className="mt-4 pt-4 border-t border-zinc-200">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Host Controls</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {/* Link/Unlink Gallery */}
              {invitation.linked_gallery_id ? (
                <button
                  onClick={unlinkGallery}
                  className="flex items-center justify-center gap-2 p-3 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 transition-colors"
                  data-testid="unlink-gallery-btn"
                >
                  <Unlink className="w-5 h-5" />
                  <span className="text-sm font-medium">Unlink Gallery</span>
                </button>
              ) : (
                <button
                  onClick={() => setShowLinkGalleryModal(true)}
                  className="flex items-center justify-center gap-2 p-3 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors"
                  data-testid="link-gallery-btn"
                >
                  <Link2 className="w-5 h-5" />
                  <span className="text-sm font-medium">Link Gallery</span>
                </button>
              )}
              
              {/* Generate/View Celebrant Link */}
              {celebrantLink ? (
                <button
                  onClick={() => setShowCelebrantLinkModal(true)}
                  className="flex items-center justify-center gap-2 p-3 rounded-xl border border-green-200 bg-green-50 hover:bg-green-100 text-green-700 transition-colors"
                  data-testid="view-celebrant-link-btn"
                >
                  <Key className="w-5 h-5" />
                  <span className="text-sm font-medium">Celebrant Link</span>
                </button>
              ) : (
                <button
                  onClick={generateCelebrantLink}
                  className="flex items-center justify-center gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 transition-colors"
                  data-testid="generate-celebrant-link-btn"
                >
                  <Key className="w-5 h-5" />
                  <span className="text-sm font-medium">Generate Celebrant Link</span>
                </button>
              )}
              
              {/* Edit Invitation */}
              <Link
                to={`/invitations/${id}/edit`}
                className="flex items-center justify-center gap-2 p-3 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-zinc-700 transition-colors"
              >
                <Edit className="w-5 h-5" />
                <span className="text-sm font-medium">Edit Invitation</span>
              </Link>
            </div>
          </div>

          {/* External Invitation Link Display */}
          {invitation.external_invitation_url && (
            <div className="mt-4 p-3 bg-rose-50 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-rose-600" />
                <span className="text-sm text-rose-700">External Invitation:</span>
                <a 
                  href={invitation.external_invitation_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-rose-600 hover:underline truncate max-w-xs"
                >
                  {invitation.external_invitation_url}
                </a>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(invitation.external_invitation_url);
                  toast.success('External link copied!');
                }}
                className="text-rose-600 hover:text-rose-700"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Gallery Link Display */}
          {invitation.linked_gallery_share_link && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-blue-600" />
                <span className="text-sm text-blue-700">Linked Gallery:</span>
                <Link 
                  to={`/g/${invitation.linked_gallery_share_link}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  View Gallery
                </Link>
              </div>
              <Link
                to={`/gallery/${invitation.linked_gallery_id}`}
                className="text-sm text-blue-600 hover:underline"
              >
                Manage
              </Link>
            </div>
          )}
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-zinc-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-900">{stats?.total_rsvps || 0}</p>
                <p className="text-sm text-zinc-500">Total RSVPs</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl border border-zinc-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Check className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{groupedGuests.attending.length}</p>
                <p className="text-sm text-zinc-500">Attending</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl border border-zinc-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <X className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{groupedGuests.not_attending.length}</p>
                <p className="text-sm text-zinc-500">Not Attending</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl border border-zinc-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <HelpCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{groupedGuests.maybe.length}</p>
                <p className="text-sm text-zinc-500">Maybe/Pending</p>
              </div>
            </div>
          </div>
        </div>

        {/* Expected Guests Banner */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-6 mb-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm">Expected Guests (from attending RSVPs)</p>
              <p className="text-4xl font-bold">{totalExpectedGuests}</p>
            </div>
            <Users className="w-12 h-12 text-green-200" />
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white rounded-xl border border-zinc-200 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search guests by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
              data-testid="search-input"
            />
          </div>
        </div>

        {/* Guest Lists by Status */}
        <div className="space-y-4">
          {/* Attending Section */}
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <button
              onClick={() => toggleSection('attending')}
              className="w-full flex items-center justify-between p-4 bg-green-50 hover:bg-green-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500 rounded-lg">
                  <Check className="w-5 h-5 text-white" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-green-800">Attending</h3>
                  <p className="text-sm text-green-600">
                    {groupedGuests.attending.length} guests • {totalExpectedGuests} total people
                  </p>
                </div>
              </div>
              {expandedSections.attending ? (
                <ChevronUp className="w-5 h-5 text-green-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-green-600" />
              )}
            </button>
            
            {expandedSections.attending && (
              <div className="divide-y divide-zinc-100">
                {groupedGuests.attending.length === 0 ? (
                  <p className="p-4 text-zinc-500 text-center">No attending guests yet</p>
                ) : (
                  groupedGuests.attending.map(guest => (
                    <GuestCard key={guest.id} guest={guest} />
                  ))
                )}
              </div>
            )}
          </div>

          {/* Not Attending Section */}
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <button
              onClick={() => toggleSection('not_attending')}
              className="w-full flex items-center justify-between p-4 bg-red-50 hover:bg-red-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500 rounded-lg">
                  <X className="w-5 h-5 text-white" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-red-800">Not Attending</h3>
                  <p className="text-sm text-red-600">{groupedGuests.not_attending.length} guests</p>
                </div>
              </div>
              {expandedSections.not_attending ? (
                <ChevronUp className="w-5 h-5 text-red-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-red-600" />
              )}
            </button>
            
            {expandedSections.not_attending && (
              <div className="divide-y divide-zinc-100">
                {groupedGuests.not_attending.length === 0 ? (
                  <p className="p-4 text-zinc-500 text-center">No guests declined yet</p>
                ) : (
                  groupedGuests.not_attending.map(guest => (
                    <GuestCard key={guest.id} guest={guest} />
                  ))
                )}
              </div>
            )}
          </div>

          {/* Maybe/Pending Section */}
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <button
              onClick={() => toggleSection('maybe')}
              className="w-full flex items-center justify-between p-4 bg-amber-50 hover:bg-amber-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500 rounded-lg">
                  <HelpCircle className="w-5 h-5 text-white" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-amber-800">Maybe / Pending</h3>
                  <p className="text-sm text-amber-600">{groupedGuests.maybe.length} guests</p>
                </div>
              </div>
              {expandedSections.maybe ? (
                <ChevronUp className="w-5 h-5 text-amber-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-amber-600" />
              )}
            </button>
            
            {expandedSections.maybe && (
              <div className="divide-y divide-zinc-100">
                {groupedGuests.maybe.length === 0 ? (
                  <p className="p-4 text-zinc-500 text-center">No pending responses</p>
                ) : (
                  groupedGuests.maybe.map(guest => (
                    <GuestCard key={guest.id} guest={guest} />
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* QR Code Modal */}
      {showQRModal && qrCodeData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-zinc-900 mb-4 text-center">RSVP QR Code</h3>
            <p className="text-sm text-zinc-500 text-center mb-4">Guests can scan this to access your RSVP page</p>
            
            <div className="bg-white p-4 rounded-lg border border-zinc-200 mb-4">
              <img 
                src={qrCodeData.qr_code_base64} 
                alt="RSVP QR Code"
                className="w-full max-w-[200px] mx-auto"
              />
            </div>
            
            <p className="text-xs text-zinc-400 text-center mb-4 break-all">
              {qrCodeData.invitation_url}
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setShowQRModal(false)}
                className="flex-1 py-2 border border-zinc-300 rounded-lg hover:bg-zinc-50"
              >
                Close
              </button>
              <button
                onClick={downloadQRCode}
                className="flex-1 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Guest Modal */}
      {showAddGuestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-zinc-900 mb-4">Add Guest Manually</h3>
            <p className="text-sm text-zinc-500 mb-4">For guests who RSVPed via phone or in person</p>
            
            <form onSubmit={handleAddGuest} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Guest Name *
                </label>
                <input
                  type="text"
                  value={newGuest.guest_name}
                  onChange={(e) => setNewGuest(prev => ({ ...prev, guest_name: e.target.value }))}
                  className="w-full px-4 py-2 border border-zinc-300 rounded-lg"
                  placeholder="John Doe"
                  required
                  data-testid="new-guest-name"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={newGuest.guest_email}
                    onChange={(e) => setNewGuest(prev => ({ ...prev, guest_email: e.target.value }))}
                    className="w-full px-4 py-2 border border-zinc-300 rounded-lg"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={newGuest.guest_phone}
                    onChange={(e) => setNewGuest(prev => ({ ...prev, guest_phone: e.target.value }))}
                    className="w-full px-4 py-2 border border-zinc-300 rounded-lg"
                    placeholder="+63 912 345 6789"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Attendance Status
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'attending', label: 'Attending', color: 'green' },
                    { value: 'not_attending', label: 'Not Attending', color: 'red' },
                    { value: 'maybe', label: 'Maybe', color: 'amber' }
                  ].map(status => (
                    <button
                      key={status.value}
                      type="button"
                      onClick={() => setNewGuest(prev => ({ ...prev, attendance_status: status.value }))}
                      className={`py-2 px-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                        newGuest.attendance_status === status.value
                          ? `bg-${status.color}-100 border-${status.color}-500 text-${status.color}-700`
                          : 'border-zinc-200 text-zinc-500'
                      }`}
                      style={newGuest.attendance_status === status.value ? {
                        backgroundColor: status.color === 'green' ? '#dcfce7' : status.color === 'red' ? '#fee2e2' : '#fef3c7',
                        borderColor: status.color === 'green' ? '#22c55e' : status.color === 'red' ? '#ef4444' : '#f59e0b',
                        color: status.color === 'green' ? '#15803d' : status.color === 'red' ? '#b91c1c' : '#b45309'
                      } : {}}
                    >
                      {status.label}
                    </button>
                  ))}
                </div>
              </div>

              {newGuest.attendance_status === 'attending' && (
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Number of Guests
                  </label>
                  <select
                    value={newGuest.guest_count}
                    onChange={(e) => setNewGuest(prev => ({ ...prev, guest_count: parseInt(e.target.value) }))}
                    className="w-full px-4 py-2 border border-zinc-300 rounded-lg"
                  >
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <option key={n} value={n}>{n} {n === 1 ? 'person' : 'people'}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  How did they RSVP?
                </label>
                <select
                  value={newGuest.added_via}
                  onChange={(e) => setNewGuest(prev => ({ ...prev, added_via: e.target.value }))}
                  className="w-full px-4 py-2 border border-zinc-300 rounded-lg"
                >
                  <option value="manual">Manual entry</option>
                  <option value="phone">Phone call</option>
                  <option value="in_person">In person</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={newGuest.notes}
                  onChange={(e) => setNewGuest(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-4 py-2 border border-zinc-300 rounded-lg"
                  rows={2}
                  placeholder="Any special notes..."
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddGuestModal(false)}
                  className="flex-1 py-2 border border-zinc-300 rounded-lg hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800"
                  data-testid="submit-add-guest"
                >
                  Add Guest
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* External Invitation Link Modal */}
      {showExternalLinkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-zinc-900 mb-2">External Invitation Link</h3>
            <p className="text-sm text-zinc-500 mb-4">
              Link to your invitation from another platform (e.g., Canva, Paperless Post, etc.)
            </p>
            
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Invitation URL
              </label>
              <input
                type="url"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                className="w-full px-4 py-2 border border-zinc-300 rounded-lg"
                placeholder="https://www.canva.com/design/..."
                data-testid="external-url-input"
              />
              <p className="text-xs text-zinc-400 mt-1">
                This link will be shown on your RSVP page for guests to view your full invitation
              </p>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowExternalLinkModal(false)}
                className="flex-1 py-2 border border-zinc-300 rounded-lg hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={saveExternalLink}
                className="flex-1 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800"
                data-testid="save-external-link"
              >
                Save Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Guest Card Component
function GuestCard({ guest }) {
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  return (
    <div className="p-4 hover:bg-zinc-50 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-zinc-900">{guest.guest_name}</h4>
            {guest.attendance_status === 'attending' && guest.guest_count > 1 && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                +{guest.guest_count - 1} guests
              </span>
            )}
            {guest.added_via && guest.added_via !== 'online' && (
              <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded-full text-xs">
                {guest.added_via === 'phone' ? '📞 Phone' : guest.added_via === 'in_person' ? '🤝 In Person' : '✍️ Manual'}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-4 mt-1 text-sm text-zinc-500">
            {guest.guest_email && (
              <span className="flex items-center gap-1">
                <Mail className="w-3 h-3" />
                {guest.guest_email}
              </span>
            )}
            {guest.guest_phone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {guest.guest_phone}
              </span>
            )}
          </div>
          
          {guest.message && (
            <div className="mt-2 p-2 bg-zinc-50 rounded-lg">
              <p className="text-sm text-zinc-600 flex items-start gap-2">
                <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {guest.message}
              </p>
            </div>
          )}
        </div>
        
        <div className="text-right">
          <p className="text-xs text-zinc-400">{formatDate(guest.submitted_at)}</p>
        </div>
      </div>
    </div>
  );
}

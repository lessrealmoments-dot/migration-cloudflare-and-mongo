import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Users,
  Check,
  X,
  HelpCircle,
  Copy,
  Calendar,
  Clock,
  MapPin,
  Eye,
  QrCode,
  Search,
  UserPlus,
  Phone,
  Mail,
  MessageSquare,
  Edit2,
  Save,
  AlertTriangle,
  Download,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

// Confirmation Dialog Component
const ConfirmDialog = ({ isOpen, title, message, fieldName, oldValue, newValue, onConfirm, onCancel, isLoading }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-amber-100 rounded-full">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
        </div>
        
        <p className="text-zinc-600 mb-4">{message}</p>
        
        <div className="bg-zinc-50 rounded-lg p-4 mb-4 space-y-2">
          <p className="text-sm text-zinc-500">Field: <span className="font-medium text-zinc-700">{fieldName}</span></p>
          {oldValue && (
            <p className="text-sm text-zinc-500">
              Previous: <span className="font-medium text-red-600 line-through">{oldValue}</span>
            </p>
          )}
          <p className="text-sm text-zinc-500">
            New: <span className="font-medium text-green-600">{newValue}</span>
          </p>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 py-2 border border-zinc-300 rounded-lg hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? 'Saving...' : (
              <>
                <Check className="w-4 h-4" />
                Yes, Update
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function CelebrantView() {
  const { accessCode } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editedFields, setEditedFields] = useState({});
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeData, setQrCodeData] = useState(null);
  const [showAddGuestModal, setShowAddGuestModal] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    attending: true,
    not_attending: true,
    maybe: true
  });
  
  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    fieldName: '',
    oldValue: '',
    newValue: '',
    fieldKey: '',
    isLoading: false
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

  useEffect(() => {
    fetchData();
  }, [accessCode]);

  const fetchData = async () => {
    try {
      const response = await axios.get(`${API}/api/invitations/celebrant/${accessCode}`);
      setData(response.data);
      setEditedFields(response.data.invitation);
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid or expired access link');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/i/${data.invitation.share_link}`;
    await navigator.clipboard.writeText(url);
    toast.success('RSVP link copied!');
  };

  const fetchQRCode = async () => {
    try {
      // Generate QR code URL for the public RSVP page
      const invitationUrl = `${window.location.origin}/i/${data.invitation.share_link}`;
      
      // Use a QR code API or generate locally
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(invitationUrl)}`;
      
      setQrCodeData({
        qr_code_url: qrApiUrl,
        invitation_url: invitationUrl
      });
      setShowQRModal(true);
    } catch (error) {
      toast.error('Failed to generate QR code');
    }
  };

  const handleFieldChange = (field, value) => {
    setEditedFields(prev => ({ ...prev, [field]: value }));
  };

  const handleDesignChange = (field, value) => {
    setEditedFields(prev => ({
      ...prev,
      design: { ...prev.design, [field]: value }
    }));
  };

  const promptConfirmation = (fieldKey, fieldName, oldValue, newValue) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Confirm Change',
      message: 'You are about to update your invitation. This change will be visible to your guests.',
      fieldName,
      oldValue: oldValue || '(empty)',
      newValue: newValue || '(empty)',
      fieldKey,
      isLoading: false
    });
  };

  const handleSaveField = async () => {
    setConfirmDialog(prev => ({ ...prev, isLoading: true }));
    
    try {
      const fieldKey = confirmDialog.fieldKey;
      let updates = {};
      
      if (fieldKey.startsWith('design.')) {
        const designField = fieldKey.replace('design.', '');
        updates = { design: { [designField]: editedFields.design[designField] } };
      } else {
        updates = { [fieldKey]: editedFields[fieldKey] };
      }
      
      await axios.put(`${API}/api/invitations/celebrant/${accessCode}`, updates);
      
      toast.success('Changes saved successfully!');
      setConfirmDialog({ isOpen: false });
      fetchData(); // Refresh data
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save changes');
      setConfirmDialog(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleAddGuest = async (e) => {
    e.preventDefault();
    if (!newGuest.guest_name) {
      toast.error('Guest name is required');
      return;
    }

    try {
      await axios.post(`${API}/api/invitations/celebrant/${accessCode}/add-guest`, newGuest);
      
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

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const filterGuests = (guests) => {
    if (!searchQuery) return guests;
    const query = searchQuery.toLowerCase();
    return guests.filter(g => 
      g.guest_name?.toLowerCase().includes(query) ||
      g.guest_email?.toLowerCase().includes(query) ||
      g.guest_phone?.includes(query)
    );
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
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

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <X className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-zinc-900 mb-2">Access Denied</h1>
          <p className="text-zinc-500">{error}</p>
          <p className="text-sm text-zinc-400 mt-4">
            Please contact your host if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  const { invitation, rsvps } = data;
  
  const groupedGuests = {
    attending: filterGuests(rsvps.filter(r => r.attendance_status === 'attending')),
    not_attending: filterGuests(rsvps.filter(r => r.attendance_status === 'not_attending')),
    maybe: filterGuests(rsvps.filter(r => r.attendance_status === 'maybe' || r.attendance_status === 'pending'))
  };

  const totalExpectedGuests = groupedGuests.attending.reduce((sum, g) => sum + (g.guest_count || 1), 0);

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-500">Celebrant Dashboard</p>
              <h1 className="text-xl font-semibold text-zinc-900">{invitation.title}</h1>
            </div>
            <button
              onClick={() => setEditMode(!editMode)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                editMode 
                  ? 'bg-amber-100 text-amber-700 border border-amber-300' 
                  : 'border border-zinc-300 hover:bg-zinc-50'
              }`}
            >
              <Edit2 className="w-4 h-4" />
              {editMode ? 'Editing Mode' : 'Edit Details'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              onClick={copyLink}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
            >
              <Copy className="w-6 h-6 text-blue-600" />
              <span className="text-sm font-medium text-zinc-700">Copy Link</span>
            </button>
            
            <button
              onClick={fetchQRCode}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
            >
              <QrCode className="w-6 h-6 text-purple-600" />
              <span className="text-sm font-medium text-zinc-700">QR Code</span>
            </button>
            
            <button
              onClick={() => window.open(`/i/${invitation.share_link}`, '_blank')}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
            >
              <Eye className="w-6 h-6 text-green-600" />
              <span className="text-sm font-medium text-zinc-700">Preview</span>
            </button>
            
            <button
              onClick={() => setShowAddGuestModal(true)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
            >
              <UserPlus className="w-6 h-6 text-amber-600" />
              <span className="text-sm font-medium text-zinc-700">Add Guest</span>
            </button>
          </div>
        </div>

        {/* Event Details (Editable) */}
        {editMode && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h2 className="text-lg font-semibold text-amber-800">Edit Event Details</h2>
            </div>
            <p className="text-sm text-amber-700 mb-4">
              Changes will require confirmation before saving. Your guests will see the updated information.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Event Title</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editedFields.title || ''}
                    onChange={(e) => handleFieldChange('title', e.target.value)}
                    className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg"
                  />
                  {editedFields.title !== invitation.title && (
                    <button
                      onClick={() => promptConfirmation('title', 'Event Title', invitation.title, editedFields.title)}
                      className="px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Host Names */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Host Names</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editedFields.host_names || ''}
                    onChange={(e) => handleFieldChange('host_names', e.target.value)}
                    className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg"
                  />
                  {editedFields.host_names !== invitation.host_names && (
                    <button
                      onClick={() => promptConfirmation('host_names', 'Host Names', invitation.host_names, editedFields.host_names)}
                      className="px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Event Date */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Event Date</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={editedFields.event_date || ''}
                    onChange={(e) => handleFieldChange('event_date', e.target.value)}
                    className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg"
                  />
                  {editedFields.event_date !== invitation.event_date && (
                    <button
                      onClick={() => promptConfirmation('event_date', 'Event Date', invitation.event_date, editedFields.event_date)}
                      className="px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Event Time */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Event Time</label>
                <div className="flex gap-2">
                  <input
                    type="time"
                    value={editedFields.event_time || ''}
                    onChange={(e) => handleFieldChange('event_time', e.target.value)}
                    className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg"
                  />
                  {editedFields.event_time !== invitation.event_time && (
                    <button
                      onClick={() => promptConfirmation('event_time', 'Event Time', invitation.event_time, editedFields.event_time)}
                      className="px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Venue Name */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 mb-1">Venue Name</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editedFields.venue_name || ''}
                    onChange={(e) => handleFieldChange('venue_name', e.target.value)}
                    className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg"
                  />
                  {editedFields.venue_name !== invitation.venue_name && (
                    <button
                      onClick={() => promptConfirmation('venue_name', 'Venue Name', invitation.venue_name, editedFields.venue_name)}
                      className="px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Venue Address */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 mb-1">Venue Address</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editedFields.venue_address || ''}
                    onChange={(e) => handleFieldChange('venue_address', e.target.value)}
                    className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg"
                  />
                  {editedFields.venue_address !== invitation.venue_address && (
                    <button
                      onClick={() => promptConfirmation('venue_address', 'Venue Address', invitation.venue_address, editedFields.venue_address)}
                      className="px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-zinc-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-900">{rsvps.length}</p>
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
                <p className="text-sm text-zinc-500">Pending</p>
              </div>
            </div>
          </div>
        </div>

        {/* Expected Guests Banner */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-6 mb-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm">Expected Guests</p>
              <p className="text-4xl font-bold">{totalExpectedGuests}</p>
            </div>
            <Users className="w-12 h-12 text-green-200" />
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-xl border border-zinc-200 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search guests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-zinc-200 rounded-lg"
            />
          </div>
        </div>

        {/* Guest Lists */}
        <div className="space-y-4">
          {/* Attending */}
          <GuestSection
            title="Attending"
            guests={groupedGuests.attending}
            totalGuests={totalExpectedGuests}
            icon={Check}
            color="green"
            expanded={expandedSections.attending}
            onToggle={() => toggleSection('attending')}
          />

          {/* Not Attending */}
          <GuestSection
            title="Not Attending"
            guests={groupedGuests.not_attending}
            icon={X}
            color="red"
            expanded={expandedSections.not_attending}
            onToggle={() => toggleSection('not_attending')}
          />

          {/* Maybe/Pending */}
          <GuestSection
            title="Maybe / Pending"
            guests={groupedGuests.maybe}
            icon={HelpCircle}
            color="amber"
            expanded={expandedSections.maybe}
            onToggle={() => toggleSection('maybe')}
          />
        </div>
      </main>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        fieldName={confirmDialog.fieldName}
        oldValue={confirmDialog.oldValue}
        newValue={confirmDialog.newValue}
        onConfirm={handleSaveField}
        onCancel={() => setConfirmDialog({ isOpen: false })}
        isLoading={confirmDialog.isLoading}
      />

      {/* QR Code Modal */}
      {showQRModal && qrCodeData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-zinc-900 mb-4 text-center">RSVP QR Code</h3>
            
            <div className="bg-white p-4 rounded-lg border border-zinc-200 mb-4">
              <img 
                src={qrCodeData.qr_code_url} 
                alt="RSVP QR Code"
                className="w-full max-w-[200px] mx-auto"
              />
            </div>
            
            <p className="text-xs text-zinc-400 text-center mb-4 break-all">
              {qrCodeData.invitation_url}
            </p>

            <button
              onClick={() => setShowQRModal(false)}
              className="w-full py-2 border border-zinc-300 rounded-lg hover:bg-zinc-50"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Add Guest Modal */}
      {showAddGuestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-zinc-900 mb-4">Add Guest Manually</h3>
            
            <form onSubmit={handleAddGuest} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Guest Name *</label>
                <input
                  type="text"
                  value={newGuest.guest_name}
                  onChange={(e) => setNewGuest(prev => ({ ...prev, guest_name: e.target.value }))}
                  className="w-full px-4 py-2 border border-zinc-300 rounded-lg"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={newGuest.guest_email}
                    onChange={(e) => setNewGuest(prev => ({ ...prev, guest_email: e.target.value }))}
                    className="w-full px-4 py-2 border border-zinc-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={newGuest.guest_phone}
                    onChange={(e) => setNewGuest(prev => ({ ...prev, guest_phone: e.target.value }))}
                    className="w-full px-4 py-2 border border-zinc-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Attendance Status</label>
                <div className="grid grid-cols-3 gap-2">
                  {['attending', 'not_attending', 'maybe'].map(status => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setNewGuest(prev => ({ ...prev, attendance_status: status }))}
                      className={`py-2 px-3 rounded-lg border-2 text-sm font-medium ${
                        newGuest.attendance_status === status
                          ? status === 'attending' ? 'bg-green-100 border-green-500 text-green-700'
                          : status === 'not_attending' ? 'bg-red-100 border-red-500 text-red-700'
                          : 'bg-amber-100 border-amber-500 text-amber-700'
                          : 'border-zinc-200 text-zinc-500'
                      }`}
                    >
                      {status === 'attending' ? 'Yes' : status === 'not_attending' ? 'No' : 'Maybe'}
                    </button>
                  ))}
                </div>
              </div>

              {newGuest.attendance_status === 'attending' && (
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Number of Guests</label>
                  <select
                    value={newGuest.guest_count}
                    onChange={(e) => setNewGuest(prev => ({ ...prev, guest_count: parseInt(e.target.value) }))}
                    className="w-full px-4 py-2 border border-zinc-300 rounded-lg"
                  >
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              )}

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
                >
                  Add Guest
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Guest Section Component
function GuestSection({ title, guests, totalGuests, icon: Icon, color, expanded, onToggle }) {
  const bgColors = {
    green: 'bg-green-50 hover:bg-green-100',
    red: 'bg-red-50 hover:bg-red-100',
    amber: 'bg-amber-50 hover:bg-amber-100'
  };
  
  const iconBgColors = {
    green: 'bg-green-500',
    red: 'bg-red-500',
    amber: 'bg-amber-500'
  };
  
  const textColors = {
    green: 'text-green-800',
    red: 'text-red-800',
    amber: 'text-amber-800'
  };

  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between p-4 ${bgColors[color]} transition-colors`}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 ${iconBgColors[color]} rounded-lg`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <h3 className={`font-semibold ${textColors[color]}`}>{title}</h3>
            <p className={`text-sm ${textColors[color]} opacity-70`}>
              {guests.length} {guests.length === 1 ? 'guest' : 'guests'}
              {totalGuests && ` • ${totalGuests} total people`}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className={`w-5 h-5 ${textColors[color]}`} />
        ) : (
          <ChevronDown className={`w-5 h-5 ${textColors[color]}`} />
        )}
      </button>
      
      {expanded && (
        <div className="divide-y divide-zinc-100">
          {guests.length === 0 ? (
            <p className="p-4 text-zinc-500 text-center">No guests in this category</p>
          ) : (
            guests.map(guest => (
              <div key={guest.id} className="p-4 hover:bg-zinc-50">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-zinc-900">{guest.guest_name}</h4>
                      {guest.guest_count > 1 && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          +{guest.guest_count - 1}
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
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

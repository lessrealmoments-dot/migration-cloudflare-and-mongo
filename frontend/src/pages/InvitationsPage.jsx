import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Plus,
  Mail,
  Calendar,
  Users,
  Eye,
  Edit,
  Trash2,
  Link2,
  QrCode,
  ChevronRight,
  PartyPopper,
  Heart,
  Briefcase,
  Cake,
  MoreVertical,
  Copy,
  ExternalLink
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const eventTypeIcons = {
  wedding: Heart,
  birthday: Cake,
  corporate: Briefcase,
  celebration: PartyPopper,
  baby_shower: PartyPopper,
  graduation: PartyPopper,
  anniversary: Heart
};

const eventTypeColors = {
  wedding: 'bg-rose-100 text-rose-700',
  birthday: 'bg-amber-100 text-amber-700',
  corporate: 'bg-blue-100 text-blue-700',
  celebration: 'bg-purple-100 text-purple-700',
  baby_shower: 'bg-pink-100 text-pink-700',
  graduation: 'bg-indigo-100 text-indigo-700',
  anniversary: 'bg-red-100 text-red-700'
};

export default function InvitationsPage() {
  const navigate = useNavigate();
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(null);

  useEffect(() => {
    fetchInvitations();
  }, []);

  const fetchInvitations = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/api/invitations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setInvitations(response.data);
    } catch (error) {
      toast.error('Failed to load invitations');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async (shareLink) => {
    const url = `${window.location.origin}/i/${shareLink}`;
    await navigator.clipboard.writeText(url);
    toast.success('Invitation link copied!');
  };

  const deleteInvitation = async (id) => {
    if (!window.confirm('Are you sure you want to delete this invitation? All RSVPs will be lost.')) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/invitations/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Invitation deleted');
      fetchInvitations();
    } catch (error) {
      toast.error('Failed to delete invitation');
    }
    setMenuOpen(null);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Date TBD';
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

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900">Invitations & RSVP</h1>
              <p className="text-sm text-zinc-500 mt-1">Create beautiful event invitations and track RSVPs</p>
            </div>
            <button
              onClick={() => navigate('/invitations/create')}
              className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-lg hover:bg-zinc-800 transition-colors"
              data-testid="create-invitation-btn"
            >
              <Plus className="w-4 h-4" />
              Create Invitation
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {invitations.length === 0 ? (
          /* Empty State */
          <div className="text-center py-16 bg-white rounded-xl border border-zinc-200">
            <Mail className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-zinc-900 mb-2">No invitations yet</h3>
            <p className="text-zinc-500 mb-6 max-w-md mx-auto">
              Create your first invitation to start collecting RSVPs for your event.
              You can link it to a gallery later when the event date approaches.
            </p>
            <button
              onClick={() => navigate('/invitations/create')}
              className="inline-flex items-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Your First Invitation
            </button>
          </div>
        ) : (
          /* Invitation Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {invitations.map((invitation) => {
              const EventIcon = eventTypeIcons[invitation.event_type] || PartyPopper;
              const colorClass = eventTypeColors[invitation.event_type] || 'bg-zinc-100 text-zinc-700';
              
              return (
                <div
                  key={invitation.id}
                  className="bg-white rounded-xl border border-zinc-200 overflow-hidden hover:shadow-lg transition-shadow"
                  data-testid={`invitation-card-${invitation.id}`}
                >
                  {/* Cover Image or Gradient */}
                  <div 
                    className="h-32 bg-gradient-to-br from-zinc-100 to-zinc-200 relative"
                    style={invitation.cover_image_url ? {
                      backgroundImage: `url(${invitation.cover_image_url})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center'
                    } : {}}
                  >
                    {/* Status Badge */}
                    <div className="absolute top-3 left-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        invitation.status === 'published' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {invitation.status === 'published' ? 'Live' : 'Draft'}
                      </span>
                    </div>
                    
                    {/* Menu */}
                    <div className="absolute top-3 right-3">
                      <button
                        onClick={() => setMenuOpen(menuOpen === invitation.id ? null : invitation.id)}
                        className="p-1.5 bg-white/90 rounded-full hover:bg-white transition-colors"
                      >
                        <MoreVertical className="w-4 h-4 text-zinc-600" />
                      </button>
                      
                      {menuOpen === invitation.id && (
                        <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-zinc-200 py-1 z-10">
                          <button
                            onClick={() => {
                              navigate(`/invitations/${invitation.id}/edit`);
                              setMenuOpen(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2"
                          >
                            <Edit className="w-4 h-4" />
                            Edit
                          </button>
                          <button
                            onClick={() => copyLink(invitation.share_link)}
                            className="w-full px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2"
                          >
                            <Copy className="w-4 h-4" />
                            Copy Link
                          </button>
                          <button
                            onClick={() => window.open(`/i/${invitation.share_link}`, '_blank')}
                            className="w-full px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Preview
                          </button>
                          <hr className="my-1" />
                          <button
                            onClick={() => deleteInvitation(invitation.id)}
                            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Content */}
                  <div className="p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`p-2 rounded-lg ${colorClass}`}>
                        <EventIcon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-zinc-900 truncate">{invitation.title}</h3>
                        <p className="text-sm text-zinc-500 truncate">{invitation.host_names}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-zinc-500 mb-4">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {formatDate(invitation.event_date)}
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {invitation.total_guests} guests
                      </div>
                    </div>
                    
                    {/* RSVP Stats */}
                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex-1 bg-zinc-100 rounded-full h-2 overflow-hidden">
                        {invitation.total_rsvps > 0 && (
                          <div 
                            className="h-full bg-green-500"
                            style={{ 
                              width: `${(invitation.attending_count / invitation.total_rsvps) * 100}%` 
                            }}
                          />
                        )}
                      </div>
                      <span className="text-xs text-zinc-500">
                        {invitation.attending_count} attending
                      </span>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate(`/invitations/${invitation.id}`)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200 transition-colors text-sm"
                      >
                        <Eye className="w-4 h-4" />
                        View RSVPs
                      </button>
                      {invitation.linked_gallery_id ? (
                        <button
                          onClick={() => navigate(`/gallery/${invitation.linked_gallery_id}`)}
                          className="flex items-center justify-center gap-2 px-3 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors text-sm"
                        >
                          <Link2 className="w-4 h-4" />
                          Gallery
                        </button>
                      ) : (
                        <button
                          onClick={() => navigate(`/invitations/${invitation.id}/link-gallery`)}
                          className="flex items-center justify-center gap-2 px-3 py-2 border border-zinc-300 text-zinc-700 rounded-lg hover:bg-zinc-50 transition-colors text-sm"
                        >
                          <Link2 className="w-4 h-4" />
                          Link Gallery
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Heart,
  ExternalLink,
  Check,
  X,
  HelpCircle,
  Send,
  Image as ImageIcon,
  Mail,
  ChevronDown,
  Timer
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

// Countdown Timer Component
const CountdownTimer = ({ eventDate, primaryColor }) => {
  const [timeLeft, setTimeLeft] = React.useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isEventPassed, setIsEventPassed] = React.useState(false);

  React.useEffect(() => {
    if (!eventDate) return;

    const calculateTimeLeft = () => {
      const eventTime = new Date(eventDate).getTime();
      const now = new Date().getTime();
      const difference = eventTime - now;

      if (difference <= 0) {
        setIsEventPassed(true);
        return { days: 0, hours: 0, minutes: 0, seconds: 0 };
      }

      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((difference % (1000 * 60)) / 1000)
      };
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [eventDate]);

  if (!eventDate) return null;
  
  if (isEventPassed) {
    return (
      <div className="text-center py-3">
        <p className="text-white/90 text-sm font-medium">
          🎉 The celebration has begun!
        </p>
      </div>
    );
  }

  const TimeBlock = ({ value, label }) => (
    <div className="text-center">
      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center text-xl sm:text-2xl font-bold text-white mb-1">
        {String(value).padStart(2, '0')}
      </div>
      <p className="text-[10px] sm:text-xs text-white/70 uppercase tracking-wider">{label}</p>
    </div>
  );

  return (
    <div className="py-4">
      <div className="flex items-center justify-center gap-2 sm:gap-3">
        <TimeBlock value={timeLeft.days} label="Days" />
        <span className="text-xl sm:text-2xl font-bold text-white/50 mt-[-20px]">:</span>
        <TimeBlock value={timeLeft.hours} label="Hours" />
        <span className="text-xl sm:text-2xl font-bold text-white/50 mt-[-20px]">:</span>
        <TimeBlock value={timeLeft.minutes} label="Mins" />
        <span className="text-xl sm:text-2xl font-bold text-white/50 mt-[-20px] hidden sm:block">:</span>
        <div className="hidden sm:block">
          <TimeBlock value={timeLeft.seconds} label="Secs" />
        </div>
      </div>
    </div>
  );
};

// Default cover images based on event type
const defaultCoverImages = {
  wedding: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=1200&q=80',
  birthday: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=1200&q=80',
  corporate: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=80',
  baby_shower: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=1200&q=80',
  graduation: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1200&q=80',
  anniversary: 'https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=1200&q=80',
  celebration: 'https://images.unsplash.com/photo-1496843916299-590492c751f4?w=1200&q=80'
};

export default function PublicInvitation() {
  const { shareLink } = useParams();
  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [showRSVPForm, setShowRSVPForm] = useState(false);
  const [coverImage, setCoverImage] = useState(null);
  const [cardHeight, setCardHeight] = useState(null);
  
  // Refs for height matching
  const rsvpCardRef = useRef(null);
  
  // RSVP Form
  const [rsvpData, setRsvpData] = useState({
    guest_name: '',
    guest_email: '',
    guest_phone: '',
    attendance_status: '',
    guest_count: 1,
    responses: {},
    message: ''
  });
  
  // Measure card height when NOT showing form (collapsed state)
  useEffect(() => {
    if (rsvpCardRef.current && !showRSVPForm) {
      const height = rsvpCardRef.current.offsetHeight;
      setCardHeight(height);
    }
  }, [invitation, showRSVPForm]);

  useEffect(() => {
    fetchInvitation();
  }, [shareLink]);

  // Handle cover image loading and fallback
  useEffect(() => {
    if (!invitation) return;
    
    const design = invitation.design || {};
    const defaultImage = defaultCoverImages[invitation.event_type] || defaultCoverImages.celebration;
    
    // Priority: 1) Custom cover image, 2) Gallery cover photo, 3) Default based on event type
    const imageSources = [
      design.cover_image_url,
      invitation.linked_gallery_cover_photo,
      defaultImage
    ].filter(Boolean);
    
    const tryLoadImage = (index) => {
      if (index >= imageSources.length) {
        setCoverImage(defaultImage);
        return;
      }
      
      const img = new Image();
      img.onload = () => {
        // Only use the image if it loads successfully and has a reasonable size
        if (img.width > 10 && img.height > 10) {
          setCoverImage(imageSources[index]);
        } else {
          tryLoadImage(index + 1);
        }
      };
      img.onerror = () => {
        tryLoadImage(index + 1);
      };
      img.src = imageSources[index];
    };
    
    tryLoadImage(0);
  }, [invitation]);

  const fetchInvitation = async (pwd = null) => {
    try {
      const url = pwd 
        ? `${API}/api/invitations/public/${shareLink}?password=${pwd}`
        : `${API}/api/invitations/public/${shareLink}`;
      
      const response = await axios.get(url);
      setInvitation(response.data);
      setNeedsPassword(false);
    } catch (error) {
      if (error.response?.status === 401) {
        setNeedsPassword(true);
      } else {
        toast.error('Invitation not found');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    fetchInvitation(password);
  };

  const handleInputChange = (field, value) => {
    setRsvpData(prev => ({ ...prev, [field]: value }));
  };

  const handleResponseChange = (fieldId, value) => {
    setRsvpData(prev => ({
      ...prev,
      responses: { ...prev.responses, [fieldId]: value }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!rsvpData.guest_name || !rsvpData.attendance_status) {
      toast.error('Please fill in required fields');
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API}/api/invitations/public/${shareLink}/rsvp`, rsvpData);
      setSubmitted(true);
      toast.success('RSVP submitted successfully!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit RSVP');
    } finally {
      setSubmitting(false);
    }
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

  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  // Get initials for header
  const getInitials = (hostNames) => {
    if (!hostNames) return '';
    const parts = hostNames.split(/[&+]/);
    if (parts.length >= 2) {
      return `${parts[0].trim().charAt(0)} + ${parts[1].trim().charAt(0)}`;
    }
    return hostNames.charAt(0);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  // Password Required
  if (needsPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-800 p-4">
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 max-w-md w-full border border-white/20">
          <div className="text-center mb-6">
            <Heart className="w-12 h-12 text-white/80 mx-auto mb-4" />
            <h1 className="text-2xl font-serif text-white">Private Invitation</h1>
            <p className="text-white/60 mt-2">Enter the password to view this invitation</p>
          </div>
          <form onSubmit={handlePasswordSubmit}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:ring-2 focus:ring-white/30 focus:border-transparent"
              data-testid="password-input"
            />
            <button
              type="submit"
              className="w-full mt-4 py-3 bg-white text-zinc-900 rounded-lg hover:bg-white/90 transition-colors font-medium"
              data-testid="view-invitation-btn"
            >
              View Invitation
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-100">
        <div className="text-center">
          <X className="w-12 h-12 text-zinc-400 mx-auto mb-4" />
          <h1 className="text-xl font-medium text-zinc-900">Invitation not found</h1>
          <p className="text-zinc-500">This invitation may have been removed or expired.</p>
        </div>
      </div>
    );
  }

  const design = invitation.design || {};
  const fontFamily = design.font_family || 'Playfair Display';
  const primaryColor = design.primary_color || '#722f37';
  const accentColor = design.accent_color || '#d4a574';
  const displayCoverImage = coverImage || defaultCoverImages[invitation.event_type] || defaultCoverImages.celebration;

  // Thank You Screen
  if (submitted) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center"
        style={{ backgroundImage: `url(${displayCoverImage})` }}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
        <div className="relative z-10 text-center max-w-md bg-white/95 backdrop-blur-xl rounded-2xl p-8 shadow-2xl">
          <div 
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: primaryColor }}
          >
            <Check className="w-10 h-10 text-white" />
          </div>
          <h1 
            className="text-3xl mb-4"
            style={{ fontFamily, color: primaryColor }}
          >
            Thank You!
          </h1>
          <p className="text-zinc-600 mb-6">
            Your RSVP has been received. {rsvpData.attendance_status === 'attending' ? "We can't wait to celebrate with you!" : "We appreciate your response!"}
          </p>
          
          {invitation.linked_gallery_share_link && rsvpData.attendance_status === 'attending' && (
            <a
              href={`/g/${invitation.linked_gallery_share_link}`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
              data-testid="view-gallery-link"
            >
              <ImageIcon className="w-4 h-4" />
              View Photo Gallery
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-cover bg-center bg-fixed"
      style={{ backgroundImage: `url(${coverImage})` }}
    >
      {/* Frosted Overlay */}
      <div className="min-h-screen" style={{ backgroundColor: `${primaryColor}dd` }}>
        <div className="min-h-screen backdrop-blur-md">
          
          {/* Header with Initials */}
          <header className="pt-8 pb-4 text-center">
            <div 
              className="inline-block px-6 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20"
            >
              <p 
                className="text-white text-lg tracking-[0.3em] font-light"
                style={{ fontFamily }}
              >
                {getInitials(invitation.host_names)}
              </p>
            </div>
          </header>

          {/* Main Content */}
          <main className="max-w-5xl mx-auto px-4 pb-8">
            <div className="flex flex-col lg:flex-row gap-6 items-start">
              
              {/* Left Column - Info Card (55% width on lg) */}
              <div className="w-full lg:w-[55%]" id="rsvp-card" ref={rsvpCardRef}>
                <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden">
                  {/* Card Header with Primary Color */}
                  <div 
                    className="px-6 py-8 text-center"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <h1 
                      className="text-2xl sm:text-3xl lg:text-4xl text-white mb-2"
                      style={{ fontFamily }}
                      data-testid="invitation-title"
                    >
                      {invitation.title}
                    </h1>
                    <p className="text-white/80 text-sm">
                      {invitation.host_names}
                    </p>
                    
                    {/* Countdown Timer in Header */}
                    {invitation.event_date && (
                      <CountdownTimer 
                        eventDate={invitation.event_date} 
                        primaryColor={primaryColor}
                      />
                    )}
                  </div>

                  {/* Card Body */}
                  <div className="p-6 sm:p-8">
                    {/* Message */}
                    {invitation.message && (
                      <p className="text-zinc-600 mb-6 leading-relaxed text-center">
                        {invitation.message}
                      </p>
                    )}

                    {/* Event Details */}
                    <div className="space-y-4 mb-6">
                      {/* Location */}
                      {invitation.venue_name && (
                        <div className="flex items-start gap-4 p-4 bg-zinc-50 rounded-xl">
                          <div 
                            className="p-2 rounded-lg"
                            style={{ backgroundColor: `${accentColor}30` }}
                          >
                            <MapPin className="w-5 h-5" style={{ color: primaryColor }} />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Location</p>
                            <p className="font-medium text-zinc-900">{invitation.venue_name}</p>
                            {invitation.venue_address && (
                              <p className="text-sm text-zinc-500 mt-1">{invitation.venue_address}</p>
                            )}
                            {invitation.venue_map_url && (
                              <a
                                href={invitation.venue_map_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm mt-2 hover:underline"
                                style={{ color: primaryColor }}
                                data-testid="map-link"
                              >
                                Open in Google Maps <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Date & Time */}
                      {invitation.event_date && (
                        <div className="flex items-start gap-4 p-4 bg-zinc-50 rounded-xl">
                          <div 
                            className="p-2 rounded-lg"
                            style={{ backgroundColor: `${accentColor}30` }}
                          >
                            <Calendar className="w-5 h-5" style={{ color: primaryColor }} />
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Date & Time</p>
                            <p className="font-medium text-zinc-900">
                              {formatDate(invitation.event_date)}
                            </p>
                            {invitation.event_time && (
                              <p className="text-sm text-zinc-500 mt-1">
                                {formatTime(invitation.event_time)}
                                {invitation.event_end_time && ` - ${formatTime(invitation.event_end_time)}`}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Additional Info */}
                    {invitation.additional_info && (
                      <div 
                        className="text-sm p-4 rounded-xl mb-6 text-center"
                        style={{ backgroundColor: `${accentColor}20`, color: primaryColor }}
                      >
                        {invitation.additional_info}
                      </div>
                    )}

                    {/* RSVP Deadline */}
                    {invitation.rsvp_deadline && (
                      <p className="text-sm text-center mb-6" style={{ color: primaryColor }}>
                        Kindly RSVP by {formatDate(invitation.rsvp_deadline)}
                      </p>
                    )}

                    {/* Action Buttons */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* External Invitation Link (e.g., Canva) */}
                      {invitation.external_invitation_url && (
                        <a
                          href={invitation.external_invitation_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-white transition-all hover:opacity-90"
                          style={{ backgroundColor: accentColor }}
                          data-testid="view-invitation-btn"
                        >
                          <ExternalLink className="w-4 h-4" />
                          View Invitation
                        </a>
                      )}
                      {invitation.linked_gallery_share_link && (
                        <a
                          href={`/g/${invitation.linked_gallery_share_link}`}
                          className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 transition-colors hover:bg-zinc-50"
                          style={{ borderColor: primaryColor, color: primaryColor }}
                          data-testid="view-gallery-btn"
                        >
                          <ImageIcon className="w-4 h-4" />
                          View Gallery
                        </a>
                      )}
                      {invitation.rsvp_enabled && (
                        <button
                          onClick={() => setShowRSVPForm(!showRSVPForm)}
                          className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl transition-all ${
                            !invitation.linked_gallery_share_link && !invitation.external_invitation_url ? 'sm:col-span-2' : ''
                          }`}
                          style={{ 
                            backgroundColor: showRSVPForm ? primaryColor : 'transparent',
                            borderWidth: '2px',
                            borderColor: primaryColor,
                            color: showRSVPForm ? 'white' : primaryColor
                          }}
                          data-testid="rsvp-toggle-btn"
                        >
                          <Mail className="w-4 h-4" />
                          RSVP Now
                          <ChevronDown className={`w-4 h-4 transition-transform ${showRSVPForm ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>

                    {/* RSVP Form - Expandable */}
                    {invitation.rsvp_enabled && showRSVPForm && (
                      <div className="mt-6 pt-6 border-t border-zinc-200">
                        <form onSubmit={handleSubmit} className="space-y-4">
                          {/* Name */}
                          <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-1">
                              Your Name *
                            </label>
                            <input
                              type="text"
                              value={rsvpData.guest_name}
                              onChange={(e) => handleInputChange('guest_name', e.target.value)}
                              required
                              className="w-full px-4 py-3 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-offset-0 focus:outline-none"
                              data-testid="guest-name-input"
                            />
                          </div>

                          {/* Attendance */}
                          <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-2">
                              Will you attend? *
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                { value: 'attending', label: 'Yes', icon: Check, bgColor: 'bg-green-50', borderColor: 'border-green-500', textColor: 'text-green-700' },
                                { value: 'not_attending', label: 'No', icon: X, bgColor: 'bg-red-50', borderColor: 'border-red-500', textColor: 'text-red-700' },
                                { value: 'maybe', label: 'Maybe', icon: HelpCircle, bgColor: 'bg-amber-50', borderColor: 'border-amber-500', textColor: 'text-amber-700' }
                              ].map(option => (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => handleInputChange('attendance_status', option.value)}
                                  className={`p-3 rounded-xl border-2 transition-all ${
                                    rsvpData.attendance_status === option.value
                                      ? `${option.bgColor} ${option.borderColor} ${option.textColor}`
                                      : 'border-zinc-200 text-zinc-500 hover:border-zinc-300'
                                  }`}
                                  data-testid={`attendance-${option.value}`}
                                >
                                  <option.icon className="w-5 h-5 mx-auto mb-1" />
                                  <span className="text-sm font-medium">{option.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Guest Count - only show if attending */}
                          {rsvpData.attendance_status === 'attending' && (
                            <div>
                              <label className="block text-sm font-medium text-zinc-700 mb-1">
                                <Users className="w-4 h-4 inline mr-1" />
                                Number of Guests
                              </label>
                              <select
                                value={rsvpData.guest_count}
                                onChange={(e) => handleInputChange('guest_count', parseInt(e.target.value))}
                                className="w-full px-4 py-3 border border-zinc-300 rounded-xl"
                                data-testid="guest-count-select"
                              >
                                {Array.from({ length: invitation.max_guests_per_rsvp }, (_, i) => i + 1).map(n => (
                                  <option key={n} value={n}>{n} {n === 1 ? 'guest' : 'guests'}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Dynamic RSVP Fields */}
                          {invitation.rsvp_fields?.filter(f => f.enabled && f.field_id !== 'attendance' && f.field_id !== 'guest_count').map(field => (
                            <div key={field.field_id}>
                              <label className="block text-sm font-medium text-zinc-700 mb-1">
                                {field.label} {field.required && '*'}
                              </label>
                              
                              {field.field_type === 'text' && (
                                <input
                                  type={field.field_id === 'email' ? 'email' : field.field_id === 'phone' ? 'tel' : 'text'}
                                  value={field.field_id === 'email' ? rsvpData.guest_email : 
                                         field.field_id === 'phone' ? rsvpData.guest_phone :
                                         rsvpData.responses[field.field_id] || ''}
                                  onChange={(e) => {
                                    if (field.field_id === 'email') handleInputChange('guest_email', e.target.value);
                                    else if (field.field_id === 'phone') handleInputChange('guest_phone', e.target.value);
                                    else handleResponseChange(field.field_id, e.target.value);
                                  }}
                                  placeholder={field.placeholder}
                                  required={field.required}
                                  className="w-full px-4 py-3 border border-zinc-300 rounded-xl"
                                  data-testid={`field-${field.field_id}`}
                                />
                              )}

                              {field.field_type === 'textarea' && (
                                <textarea
                                  value={field.field_id === 'message' ? rsvpData.message : rsvpData.responses[field.field_id] || ''}
                                  onChange={(e) => {
                                    if (field.field_id === 'message') handleInputChange('message', e.target.value);
                                    else handleResponseChange(field.field_id, e.target.value);
                                  }}
                                  placeholder={field.placeholder}
                                  rows={3}
                                  className="w-full px-4 py-3 border border-zinc-300 rounded-xl"
                                  data-testid={`field-${field.field_id}`}
                                />
                              )}

                              {field.field_type === 'select' && field.options && (
                                <select
                                  value={rsvpData.responses[field.field_id] || ''}
                                  onChange={(e) => handleResponseChange(field.field_id, e.target.value)}
                                  required={field.required}
                                  className="w-full px-4 py-3 border border-zinc-300 rounded-xl"
                                  data-testid={`field-${field.field_id}`}
                                >
                                  <option value="">Select...</option>
                                  {field.options.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          ))}

                          {/* Submit Button */}
                          <button
                            type="submit"
                            disabled={submitting || !rsvpData.guest_name || !rsvpData.attendance_status}
                            className="w-full py-4 rounded-xl text-white font-medium flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
                            style={{ backgroundColor: primaryColor }}
                            data-testid="submit-rsvp-btn"
                          >
                            {submitting ? 'Submitting...' : (
                              <>
                                <Send className="w-4 h-4" />
                                Submit RSVP
                              </>
                            )}
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column - Couple's Photo (2/5 width on lg) */}
              <div className="lg:col-span-2 hidden lg:block">
                {/* Photo container - height matches RSVP card (collapsed) */}
                <div 
                  className="rounded-2xl overflow-hidden shadow-2xl bg-cover bg-center relative"
                  style={{ 
                    backgroundImage: `url(${displayCoverImage})`,
                    height: cardHeight ? `${cardHeight}px` : '500px',
                    backgroundColor: '#1a1a1a'
                  }}
                >
                  {/* Subtle vignette effect */}
                  <div className="absolute inset-0 shadow-[inset_0_0_50px_rgba(0,0,0,0.2)]"></div>
                </div>
              </div>

              {/* Mobile Photo - Show below the card on mobile */}
              <div className="lg:hidden mt-6">
                <div 
                  className="h-64 rounded-2xl overflow-hidden shadow-xl bg-cover bg-center"
                  style={{ backgroundImage: `url(${displayCoverImage})` }}
                />
              </div>
            </div>
          </main>

          {/* Footer */}
          <footer className="py-6 text-center">
            <p className="text-white/30 text-xs">
              Powered by EventsGallery.vip
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}

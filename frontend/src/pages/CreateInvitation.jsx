import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock,
  MapPin,
  Users,
  MessageSquare,
  Check,
  Eye,
  Heart,
  Cake,
  Briefcase,
  PartyPopper,
  Palette,
  Type,
  Image as ImageIcon,
  Plus,
  Trash2,
  GripVertical,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const eventTypes = [
  { id: 'wedding', name: 'Wedding', icon: Heart, color: 'rose' },
  { id: 'birthday', name: 'Birthday', icon: Cake, color: 'amber' },
  { id: 'corporate', name: 'Corporate', icon: Briefcase, color: 'blue' },
  { id: 'baby_shower', name: 'Baby Shower', icon: PartyPopper, color: 'pink' },
  { id: 'graduation', name: 'Graduation', icon: PartyPopper, color: 'indigo' },
  { id: 'anniversary', name: 'Anniversary', icon: Heart, color: 'red' },
  { id: 'celebration', name: 'Other', icon: PartyPopper, color: 'purple' }
];

export default function CreateInvitation() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [defaultFields, setDefaultFields] = useState([]);
  
  // Form state
  const [formData, setFormData] = useState({
    // Step 1: Event Type
    event_type: '',
    
    // Step 2: Basic Info
    title: '',
    host_names: '',
    event_date: '',
    event_time: '',
    event_end_time: '',
    venue_name: '',
    venue_address: '',
    venue_map_url: '',
    
    // Step 3: Message
    message: '',
    additional_info: '',
    
    // Step 4: Design
    template_id: 'wedding-elegant',
    design: {
      cover_image_url: null,
      background_color: '#ffffff',
      primary_color: '#1a1a1a',
      secondary_color: '#666666',
      accent_color: '#d4a574',
      font_family: 'Playfair Display'
    },
    
    // Step 5: RSVP Settings
    rsvp_enabled: true,
    rsvp_deadline: '',
    max_guests_per_rsvp: 5,
    rsvp_fields: []
  });

  useEffect(() => {
    fetchTemplates();
    fetchDefaultFields();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await axios.get(`${API}/api/invitations/templates`);
      setTemplates(response.data);
    } catch (error) {
      console.error('Failed to load templates');
    }
  };

  const fetchDefaultFields = async () => {
    try {
      const response = await axios.get(`${API}/api/invitations/default-rsvp-fields`);
      setDefaultFields(response.data);
      setFormData(prev => ({ ...prev, rsvp_fields: response.data }));
    } catch (error) {
      console.error('Failed to load default fields');
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDesignChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      design: { ...prev.design, [field]: value }
    }));
  };

  const toggleRSVPField = (fieldId) => {
    setFormData(prev => ({
      ...prev,
      rsvp_fields: prev.rsvp_fields.map(f =>
        f.field_id === fieldId ? { ...f, enabled: !f.enabled } : f
      )
    }));
  };

  const selectTemplate = (template) => {
    setFormData(prev => ({
      ...prev,
      template_id: template.id,
      design: {
        ...prev.design,
        ...template.theme_colors,
        font_family: template.font_family
      }
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API}/api/invitations`, {
        ...formData,
        rsvp_fields: formData.rsvp_fields.filter(f => f.enabled)
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('Invitation created successfully!');
      navigate(`/invitations/${response.data.id}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create invitation');
    } finally {
      setLoading(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1: return formData.event_type !== '';
      case 2: return formData.title && formData.host_names;
      case 3: return true;
      case 4: return true;
      case 5: return true;
      default: return false;
    }
  };

  const filteredTemplates = templates.filter(t => 
    formData.event_type ? t.category === formData.event_type || t.category === 'celebration' : true
  );

  const selectedTemplate = templates.find(t => t.id === formData.template_id);

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <button
            onClick={() => step > 1 ? setStep(step - 1) : navigate('/invitations')}
            className="flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900"
          >
            <ArrowLeft className="w-4 h-4" />
            {step > 1 ? 'Back' : 'Cancel'}
          </button>
        </div>
      </header>

      {/* Progress */}
      <div className="bg-white border-b border-zinc-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            {['Event Type', 'Details', 'Message', 'Design', 'RSVP'].map((label, i) => (
              <div key={i} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step > i + 1 ? 'bg-green-500 text-white' :
                  step === i + 1 ? 'bg-zinc-900 text-white' :
                  'bg-zinc-200 text-zinc-500'
                }`}>
                  {step > i + 1 ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`ml-2 text-sm hidden sm:inline ${
                  step === i + 1 ? 'text-zinc-900 font-medium' : 'text-zinc-500'
                }`}>{label}</span>
                {i < 4 && <div className="w-8 sm:w-16 h-0.5 mx-2 bg-zinc-200" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Step 1: Event Type */}
        {step === 1 && (
          <div className="bg-white rounded-xl p-8 border border-zinc-200">
            <h2 className="text-2xl font-semibold text-zinc-900 mb-2">What type of event?</h2>
            <p className="text-zinc-500 mb-8">Choose the type of event you're planning</p>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {eventTypes.map(type => {
                const Icon = type.icon;
                const isSelected = formData.event_type === type.id;
                return (
                  <button
                    key={type.id}
                    onClick={() => handleInputChange('event_type', type.id)}
                    className={`p-6 rounded-xl border-2 transition-all ${
                      isSelected 
                        ? 'border-zinc-900 bg-zinc-50' 
                        : 'border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <Icon className={`w-8 h-8 mx-auto mb-3 ${
                      isSelected ? 'text-zinc-900' : 'text-zinc-400'
                    }`} />
                    <span className={`text-sm font-medium ${
                      isSelected ? 'text-zinc-900' : 'text-zinc-600'
                    }`}>{type.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Event Details */}
        {step === 2 && (
          <div className="bg-white rounded-xl p-8 border border-zinc-200">
            <h2 className="text-2xl font-semibold text-zinc-900 mb-2">Event Details</h2>
            <p className="text-zinc-500 mb-8">Tell us about your event</p>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Event Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  placeholder="e.g., John & Jane's Wedding"
                  className="w-full px-4 py-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Host Names *
                </label>
                <input
                  type="text"
                  value={formData.host_names}
                  onChange={(e) => handleInputChange('host_names', e.target.value)}
                  placeholder="e.g., John Smith & Jane Doe"
                  className="w-full px-4 py-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    <Calendar className="w-4 h-4 inline mr-1" /> Event Date
                  </label>
                  <input
                    type="date"
                    value={formData.event_date}
                    onChange={(e) => handleInputChange('event_date', e.target.value)}
                    className="w-full px-4 py-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    <Clock className="w-4 h-4 inline mr-1" /> Start Time
                  </label>
                  <input
                    type="time"
                    value={formData.event_time}
                    onChange={(e) => handleInputChange('event_time', e.target.value)}
                    className="w-full px-4 py-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    <Clock className="w-4 h-4 inline mr-1" /> End Time
                  </label>
                  <input
                    type="time"
                    value={formData.event_end_time}
                    onChange={(e) => handleInputChange('event_end_time', e.target.value)}
                    className="w-full px-4 py-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  <MapPin className="w-4 h-4 inline mr-1" /> Venue Name
                </label>
                <input
                  type="text"
                  value={formData.venue_name}
                  onChange={(e) => handleInputChange('venue_name', e.target.value)}
                  placeholder="e.g., The Grand Ballroom"
                  className="w-full px-4 py-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Venue Address
                </label>
                <input
                  type="text"
                  value={formData.venue_address}
                  onChange={(e) => handleInputChange('venue_address', e.target.value)}
                  placeholder="e.g., 123 Wedding Lane, City"
                  className="w-full px-4 py-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Google Maps Link (optional)
                </label>
                <input
                  type="url"
                  value={formData.venue_map_url}
                  onChange={(e) => handleInputChange('venue_map_url', e.target.value)}
                  placeholder="https://maps.google.com/..."
                  className="w-full px-4 py-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Message */}
        {step === 3 && (
          <div className="bg-white rounded-xl p-8 border border-zinc-200">
            <h2 className="text-2xl font-semibold text-zinc-900 mb-2">Your Message</h2>
            <p className="text-zinc-500 mb-8">Write a personal message for your guests</p>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  <MessageSquare className="w-4 h-4 inline mr-1" /> Invitation Message
                </label>
                <textarea
                  value={formData.message}
                  onChange={(e) => handleInputChange('message', e.target.value)}
                  placeholder="We joyfully invite you to celebrate with us..."
                  rows={5}
                  className="w-full px-4 py-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Additional Information (optional)
                </label>
                <textarea
                  value={formData.additional_info}
                  onChange={(e) => handleInputChange('additional_info', e.target.value)}
                  placeholder="Dress code, parking information, special notes..."
                  rows={3}
                  className="w-full px-4 py-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Design */}
        {step === 4 && (
          <div className="bg-white rounded-xl p-8 border border-zinc-200">
            <h2 className="text-2xl font-semibold text-zinc-900 mb-2">Choose a Design</h2>
            <p className="text-zinc-500 mb-8">Select a template that matches your style</p>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
              {filteredTemplates.map(template => (
                <button
                  key={template.id}
                  onClick={() => selectTemplate(template)}
                  className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                    formData.template_id === template.id 
                      ? 'border-zinc-900 ring-2 ring-zinc-900 ring-offset-2' 
                      : 'border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  <div 
                    className="h-32"
                    style={{ backgroundColor: template.theme_colors.background }}
                  >
                    <div className="h-full flex flex-col items-center justify-center p-4">
                      <div 
                        className="text-lg font-serif mb-1"
                        style={{ 
                          color: template.theme_colors.primary,
                          fontFamily: template.font_family
                        }}
                      >
                        Preview
                      </div>
                      <div 
                        className="w-12 h-0.5"
                        style={{ backgroundColor: template.theme_colors.accent }}
                      />
                    </div>
                  </div>
                  <div className="p-3 bg-white">
                    <p className="text-sm font-medium text-zinc-900">{template.name}</p>
                    <p className="text-xs text-zinc-500 capitalize">{template.category}</p>
                  </div>
                  {formData.template_id === template.id && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-zinc-900 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Color Customization */}
            <div className="border-t border-zinc-200 pt-6">
              <h3 className="text-sm font-medium text-zinc-900 mb-4 flex items-center gap-2">
                <Palette className="w-4 h-4" /> Customize Colors
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { key: 'primary_color', label: 'Primary' },
                  { key: 'secondary_color', label: 'Secondary' },
                  { key: 'accent_color', label: 'Accent' },
                  { key: 'background_color', label: 'Background' }
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-xs text-zinc-500 mb-1">{label}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={formData.design[key]}
                        onChange={(e) => handleDesignChange(key, e.target.value)}
                        className="w-10 h-10 rounded cursor-pointer border border-zinc-200"
                      />
                      <input
                        type="text"
                        value={formData.design[key]}
                        onChange={(e) => handleDesignChange(key, e.target.value)}
                        className="flex-1 px-2 py-1 text-xs border border-zinc-200 rounded"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 5: RSVP Settings */}
        {step === 5 && (
          <div className="bg-white rounded-xl p-8 border border-zinc-200">
            <h2 className="text-2xl font-semibold text-zinc-900 mb-2">RSVP Settings</h2>
            <p className="text-zinc-500 mb-8">Configure how guests can respond to your invitation</p>
            
            <div className="space-y-6">
              {/* RSVP Toggle */}
              <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-lg">
                <div>
                  <h3 className="font-medium text-zinc-900">Enable RSVP</h3>
                  <p className="text-sm text-zinc-500">Allow guests to respond to your invitation</p>
                </div>
                <button
                  onClick={() => handleInputChange('rsvp_enabled', !formData.rsvp_enabled)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    formData.rsvp_enabled ? 'bg-green-500' : 'bg-zinc-300'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                    formData.rsvp_enabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              {formData.rsvp_enabled && (
                <>
                  {/* RSVP Deadline */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      RSVP Deadline
                    </label>
                    <input
                      type="date"
                      value={formData.rsvp_deadline}
                      onChange={(e) => handleInputChange('rsvp_deadline', e.target.value)}
                      className="w-full sm:w-64 px-4 py-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                    />
                  </div>

                  {/* Max Guests */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      Maximum Guests per RSVP
                    </label>
                    <select
                      value={formData.max_guests_per_rsvp}
                      onChange={(e) => handleInputChange('max_guests_per_rsvp', parseInt(e.target.value))}
                      className="w-full sm:w-64 px-4 py-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                        <option key={n} value={n}>{n} guest{n > 1 ? 's' : ''}</option>
                      ))}
                    </select>
                  </div>

                  {/* RSVP Fields */}
                  <div>
                    <h3 className="text-sm font-medium text-zinc-700 mb-4">RSVP Form Fields</h3>
                    <div className="space-y-3">
                      {formData.rsvp_fields.map((field) => (
                        <div 
                          key={field.field_id}
                          className={`flex items-center justify-between p-4 rounded-lg border ${
                            field.enabled ? 'border-zinc-300 bg-white' : 'border-zinc-200 bg-zinc-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <GripVertical className="w-4 h-4 text-zinc-400" />
                            <div>
                              <p className={`font-medium ${field.enabled ? 'text-zinc-900' : 'text-zinc-500'}`}>
                                {field.label}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {field.field_type} {field.required && '• Required'}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => toggleRSVPField(field.field_id)}
                            className={`w-10 h-5 rounded-full transition-colors ${
                              field.enabled ? 'bg-green-500' : 'bg-zinc-300'
                            }`}
                          >
                            <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
                              field.enabled ? 'translate-x-5' : 'translate-x-0.5'
                            }`} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <button
            onClick={() => step > 1 ? setStep(step - 1) : navigate('/invitations')}
            className="px-6 py-3 text-zinc-600 hover:text-zinc-900"
          >
            {step > 1 ? 'Back' : 'Cancel'}
          </button>
          
          {step < 5 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:bg-zinc-300 disabled:cursor-not-allowed"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 px-8 py-3 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:bg-zinc-300"
            >
              {loading ? 'Creating...' : 'Create Invitation'}
              <Check className="w-4 h-4" />
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

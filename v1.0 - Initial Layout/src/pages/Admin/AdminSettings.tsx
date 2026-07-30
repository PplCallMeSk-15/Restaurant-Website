import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, useBlocker } from 'react-router-dom';
import { 
  Settings, Save, Plus, X, Clock, 
  MapPin, Phone, Building2, Users,
  AlertTriangle, Trash2, Database,
  ArrowRight, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { getAppSettings, updateAppSettings, AppSettings } from '../../services/settingsService';
import { syncTableStatuses } from '../../services/bookingSyncService';
import { formatTo12Hour, sortTimes } from '../../utils/timeUtils';
import { TimePicker } from '../../components/TimePicker';
import { resetDatabase } from '../../services/databaseService';
import DeliveryMap from '../../components/DeliveryMap';

const hoursList = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const minutesList = Array.from({ length: 60 }, (_, idx) => idx.toString().padStart(2, '0'));

const get12HourParts = (time24: string) => {
  const [hStr, mStr] = (time24 || '00:00').split(':');
  let h = parseInt(hStr, 10);
  if (isNaN(h)) h = 0;
  const m = mStr || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return {
    hour: h12.toString().padStart(2, '0'),
    minute: m,
    ampm
  };
};

const joinTo24Hour = (hour12: string, minute: string, ampm: string): string => {
  let h = parseInt(hour12, 10);
  if (isNaN(h)) h = 12;
  if (ampm === 'PM' && h < 12) {
    h += 12;
  } else if (ampm === 'AM' && h === 12) {
    h = 0;
  }
  return `${h.toString().padStart(2, '0')}:${minute}`;
};

const AdminSettings = () => {
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [initialSettings, setInitialSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [newTime, setNewTime] = useState('12:00 PM');
  const [selectedDay, setSelectedDay] = useState('Monday');
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({ Monday: true });

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate('/');
      return;
    }

    const fetchSettings = async () => {
      const data = await getAppSettings();
      if (data) {
        if (data.timeSlots) {
          data.timeSlots = data.timeSlots.filter(t => t && !t.includes('NaN'));
        }
        if (data.daySlots) {
          Object.keys(data.daySlots).forEach(day => {
            if (data.daySlots![day]) {
              data.daySlots![day] = data.daySlots![day].filter(t => t && !t.includes('NaN'));
            }
          });
        }
      }
      setSettings(data);
      setInitialSettings(JSON.parse(JSON.stringify(data)));
      setLoading(false);
    };

    fetchSettings();
  }, [isAdmin, authLoading, navigate]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await updateAppSettings(settings);
      await syncTableStatuses();
      setInitialSettings(JSON.parse(JSON.stringify(settings)));
      toast.success('Settings updated successfully!');
    } catch (error) {
      toast.error('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const addTimeSlot = () => {
    if (!newTime || !settings) return;
    const formattedTime = formatTo12Hour(newTime);
    
    // Initialize daySlots if it doesn't exist
    const currentDaySlots = settings.daySlots?.[selectedDay] || [];
    
    // Check for duplicates by normalizing
    const normalizedExisting = currentDaySlots.map(t => formatTo12Hour(t));
    if (normalizedExisting.includes(formattedTime)) {
      toast.error(`Time slot already exists for ${selectedDay}`);
      return;
    }

    const updatedDaySlots = {
      ...(settings.daySlots || {}),
      [selectedDay]: sortTimes([...currentDaySlots, formattedTime])
    };

    setSettings({
      ...settings,
      daySlots: updatedDaySlots
    });
    setExpandedDays(prev => ({ ...prev, [selectedDay]: true }));
    setNewTime('12:00 PM');
  };

  const removeTimeSlot = (time: string, day: string) => {
    if (!settings || !settings.daySlots) return;
    
    const updatedDaySlots = {
      ...settings.daySlots,
      [day]: settings.daySlots[day].filter(t => t !== time)
    };

    setSettings({
      ...settings,
      daySlots: updatedDaySlots
    });
  };

  const isDirty = initialSettings && settings && JSON.stringify(settings) !== JSON.stringify(initialSettings);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (isDirty) {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = '';
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, [isDirty]);

  const handleResetDatabase = async () => {
    if (resetConfirmText.toLowerCase() !== 'reset') {
      toast.error('Please type "RESET" to confirm');
      return;
    }

    setResetting(true);
    try {
      const deletedCount = await resetDatabase();
      toast.success(`System reset successful! Deleted ${deletedCount} records.`);
      setShowResetConfirm(false);
      setResetConfirmText('');
      // Force refresh data if needed or just reload
      window.location.reload();
    } catch (error) {
      toast.error('Database reset failed');
      console.error(error);
    } finally {
      setResetting(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-32 pb-20 px-4">
      <AnimatePresence>
        {blocker.state === 'blocked' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl space-y-6"
            >
              <div className="w-16 h-16 bg-orange-100 rounded-3xl flex items-center justify-center mx-auto">
                <AlertTriangle className="w-8 h-8 text-orange-600" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-black text-gray-900">Unsaved Changes</h2>
                <p className="text-gray-500 font-medium">You have made changes to the settings. Do you want to save them before leaving?</p>
              </div>
              <div className="flex flex-col gap-3 pt-2">
                <button
                  onClick={() => {
                    handleSave().then(() => blocker.proceed?.());
                  }}
                  className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-orange-600 transition-all flex items-center justify-center"
                >
                  <Save className="w-5 h-5 mr-2" /> Save & Continue
                </button>
                <button
                  onClick={() => blocker.proceed?.()}
                  className="w-full py-4 bg-gray-50 text-gray-900 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                >
                  Discard Changes
                </button>
                <button
                  onClick={() => blocker.reset?.()}
                  className="w-full py-2 text-gray-400 font-bold hover:text-gray-600 transition-colors"
                >
                  Stay on Page
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
          <div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tight flex items-center">
              <Settings className="w-10 h-10 mr-3 text-orange-600" /> System Settings
            </h1>
            <p className="text-gray-500 mt-2 font-medium">Configure restaurant timings and general preferences</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center justify-center px-8 py-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-orange-600 transition-all shadow-xl shadow-gray-200 active:scale-95 disabled:bg-gray-400"
          >
            {saving ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            ) : (
              <Save className="w-5 h-5 mr-2" />
            )}
            Save Changes
          </button>
        </div>

        <div className="grid grid-cols-1 gap-8">
          {/* General Information */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
              <Building2 className="w-5 h-5 mr-2 text-orange-600" /> Restaurant Info
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 ml-1">Restaurant Name</label>
                <input
                  type="text"
                  className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-medium"
                  value={settings.restaurantName || ''}
                  onChange={(e) => setSettings({ ...settings, restaurantName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 ml-1">Contact Number</label>
                <div className="relative">
                  <Phone className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    className="w-full pl-14 pr-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-medium"
                    value={settings.contactNumber || ''}
                    onChange={(e) => setSettings({ ...settings, contactNumber: e.target.value })}
                  />
                </div>
              </div>
              <div className="md:col-span-2 space-y-2">
                <label className="text-sm font-bold text-gray-700 ml-1">Restaurant Address</label>
                <div className="relative">
                  <MapPin className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    className="w-full pl-14 pr-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-medium"
                    value={settings.address || ''}
                    onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 ml-1">Max Party Size</label>
                <div className="relative">
                  <Users className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="number"
                    className="w-full pl-14 pr-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-medium"
                    value={settings.maxPartySize ?? 10}
                    onChange={(e) => setSettings({ ...settings, maxPartySize: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Feature Access & Timing Management */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
              <Settings className="w-5 h-5 mr-2 text-orange-600" /> Feature Controls & Timing
            </h2>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Menu Enabled Toggle */}
                <div className="flex items-center justify-between p-6 bg-gray-50 rounded-3xl border border-gray-100">
                  <div className="text-left pr-4">
                    <h3 className="font-bold text-gray-950 text-sm">Enable Menu / Food Ordering</h3>
                    <p className="text-xs text-gray-500 mt-1 font-semibold leading-relaxed">Toggling this off restricts customers from placing food orders across the app.</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setSettings({ ...settings, menuEnabled: settings.menuEnabled !== false ? false : true })}
                    className={`w-14 h-8 rounded-full transition-colors relative shrink-0 ${settings.menuEnabled !== false ? 'bg-orange-600' : 'bg-gray-300'}`}
                  >
                    <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform ${settings.menuEnabled !== false ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                {/* Table Reservation Toggle */}
                <div className="flex items-center justify-between p-6 bg-gray-50 rounded-3xl border border-gray-100">
                  <div className="text-left pr-4">
                    <h3 className="font-bold text-gray-950 text-sm">Enable Table Booking</h3>
                    <p className="text-xs text-gray-500 mt-1 font-semibold leading-relaxed">Toggling this off closes table registrations and reservations across the app.</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setSettings({ ...settings, reservationsEnabled: settings.reservationsEnabled !== false ? false : true })}
                    className={`w-14 h-8 rounded-full transition-colors relative shrink-0 ${settings.reservationsEnabled !== false ? 'bg-orange-600' : 'bg-gray-300'}`}
                  >
                    <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform ${settings.reservationsEnabled !== false ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
              </div>

              {/* Food ordering timing period */}
              <div className="p-6 bg-orange-50/40 rounded-3xl border border-orange-100 text-left space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-orange-950 text-sm">Restrict Food Ordering Hours</h3>
                    <p className="text-xs text-orange-850 mt-0.5 font-semibold">When enabled, customers can only place orders during the specified timing period.</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setSettings({ ...settings, orderTimingEnabled: !settings.orderTimingEnabled })}
                    className={`w-14 h-8 rounded-full transition-colors relative shrink-0 ${settings.orderTimingEnabled ? 'bg-orange-600' : 'bg-gray-300'}`}
                  >
                    <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform ${settings.orderTimingEnabled ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                {settings.orderTimingEnabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 text-left">
                    {/* Start Time Picker */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-orange-950 ml-1">Order Start Time (12h format)</label>
                      <div className="flex items-center gap-2">
                        {/* Hour */}
                        <div className="flex-1">
                          <select
                            value={get12HourParts(settings.orderStartTime || '09:00').hour}
                            onChange={(e) => {
                              const parts = get12HourParts(settings.orderStartTime || '09:00');
                              const newVal = joinTo24Hour(e.target.value, parts.minute, parts.ampm);
                              setSettings({ ...settings, orderStartTime: newVal });
                            }}
                            className="w-full px-4 py-4 bg-white border border-orange-100 rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-medium text-sm text-center"
                          >
                            {hoursList.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </div>
                        <span className="font-extrabold text-orange-950">:</span>
                        {/* Minute */}
                        <div className="flex-1">
                          <select
                            value={get12HourParts(settings.orderStartTime || '09:00').minute}
                            onChange={(e) => {
                              const parts = get12HourParts(settings.orderStartTime || '09:00');
                              const newVal = joinTo24Hour(parts.hour, e.target.value, parts.ampm);
                              setSettings({ ...settings, orderStartTime: newVal });
                            }}
                            className="w-full px-4 py-4 bg-white border border-orange-100 rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-medium text-sm text-center"
                          >
                            {minutesList.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>
                        {/* AM/PM */}
                        <div className="flex-1">
                          <select
                            value={get12HourParts(settings.orderStartTime || '09:00').ampm}
                            onChange={(e) => {
                              const parts = get12HourParts(settings.orderStartTime || '09:00');
                              const newVal = joinTo24Hour(parts.hour, parts.minute, e.target.value);
                              setSettings({ ...settings, orderStartTime: newVal });
                            }}
                            className="w-full px-4 py-4 bg-white border border-orange-100 rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-medium text-sm text-center font-bold text-orange-950"
                          >
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* End Time Picker */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-orange-950 ml-1">Order End Time (12h format)</label>
                      <div className="flex items-center gap-2">
                        {/* Hour */}
                        <div className="flex-1">
                          <select
                            value={get12HourParts(settings.orderEndTime || '22:00').hour}
                            onChange={(e) => {
                              const parts = get12HourParts(settings.orderEndTime || '22:00');
                              const newVal = joinTo24Hour(e.target.value, parts.minute, parts.ampm);
                              setSettings({ ...settings, orderEndTime: newVal });
                            }}
                            className="w-full px-4 py-4 bg-white border border-orange-100 rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-medium text-sm text-center"
                          >
                            {hoursList.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </div>
                        <span className="font-extrabold text-orange-950">:</span>
                        {/* Minute */}
                        <div className="flex-1">
                          <select
                            value={get12HourParts(settings.orderEndTime || '22:00').minute}
                            onChange={(e) => {
                              const parts = get12HourParts(settings.orderEndTime || '22:00');
                              const newVal = joinTo24Hour(parts.hour, e.target.value, parts.ampm);
                              setSettings({ ...settings, orderEndTime: newVal });
                            }}
                            className="w-full px-4 py-4 bg-white border border-orange-100 rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-medium text-sm text-center"
                          >
                            {minutesList.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>
                        {/* AM/PM */}
                        <div className="flex-1">
                          <select
                            value={get12HourParts(settings.orderEndTime || '22:00').ampm}
                            onChange={(e) => {
                              const parts = get12HourParts(settings.orderEndTime || '22:00');
                              const newVal = joinTo24Hour(parts.hour, parts.minute, e.target.value);
                              setSettings({ ...settings, orderEndTime: newVal });
                            }}
                            className="w-full px-4 py-4 bg-white border border-orange-100 rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-medium text-sm text-center font-bold text-orange-950"
                          >
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Delivery & Range Settings */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
              <MapPin className="w-5 h-5 mr-1 text-orange-600" /> Delivery Management & Geofencing Range
            </h2>
            <div className="space-y-6">
              <div className="p-6 bg-orange-50/50 rounded-3xl border border-orange-100/60 text-left">
                <h3 className="font-extrabold text-orange-950 uppercase tracking-wider text-xs">Define Outlet Location & Delivery Radius</h3>
                <p className="text-xs text-orange-800 mt-1 leading-normal font-medium">
                  Search, click, or drag the map marker to set your kitchen base location coordinates on the map. Adjust the maximum delivery slider in kilometers — customers whose location pin lies outside this circle will have ordering permissions disabled automatically.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                <div className="space-y-6 text-left">
                  <div className="space-y-2.5">
                    <label className="text-sm font-bold text-gray-750 ml-1">Maximum Delivery Radius Limit</label>
                    <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <input
                        type="range"
                        min="1"
                        max="50"
                        step="0.5"
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-650"
                        value={settings.deliveryRangeKm ?? 5}
                        onChange={(e) => setSettings({ ...settings, deliveryRangeKm: parseFloat(e.target.value) || 5 })}
                      />
                      <span className="text-xs font-black text-white bg-orange-600 px-3.5 py-2 rounded-xl font-mono shrink-0 select-none shadow">
                        {(settings.deliveryRangeKm ?? 5).toFixed(1)} KM
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 ml-1 uppercase">Latitude Offset</label>
                      <input
                        type="number"
                        step="any"
                        className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-xl font-mono text-xs font-semibold focus:ring-2 focus:ring-orange-500/20 focus:bg-white"
                        value={settings.restaurantLatitude ?? 12.9716}
                        onChange={(e) => setSettings({ ...settings, restaurantLatitude: parseFloat(e.target.value) || 12.9716 })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 ml-1 uppercase">Longitude Offset</label>
                      <input
                        type="number"
                        step="any"
                        className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-xl font-mono text-xs font-semibold focus:ring-2 focus:ring-orange-500/20 focus:bg-white"
                        value={settings.restaurantLongitude ?? 77.5946}
                        onChange={(e) => setSettings({ ...settings, restaurantLongitude: parseFloat(e.target.value) || 77.5946 })}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 ml-1 block text-left uppercase">Draggable Outlet Landmark Pin</label>
                  <DeliveryMap
                    mode="picker"
                    latitude={settings.restaurantLatitude ?? 12.9716}
                    longitude={settings.restaurantLongitude ?? 77.5946}
                    restaurantLatitude={settings.restaurantLatitude ?? 12.9716}
                    restaurantLongitude={settings.restaurantLongitude ?? 77.5946}
                    deliveryRangeKm={settings.deliveryRangeKm ?? 5}
                    onLocationSelect={(lat, lng) => {
                      setSettings(prev => prev ? ({
                        ...prev,
                        restaurantLatitude: lat,
                        restaurantLongitude: lng
                      }) : null);
                    }}
                    height="280px"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Timing Settings */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
              <Clock className="w-5 h-5 mr-2 text-orange-600" /> Timing & Automation
            </h2>
            
            <div className="space-y-8">
              {/* Manual Time Override */}
              <div className="p-6 bg-orange-50 rounded-3xl border border-orange-100">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-orange-900">System Time Override</h3>
                    <p className="text-xs text-orange-700 mt-1">Force the system to think it's a specific time for testing table statuses.</p>
                  </div>
                  <button 
                    onClick={() => setSettings({ ...settings, useManualTime: !settings.useManualTime, manualTimeSetAt: Date.now() })}
                    className={`w-14 h-8 rounded-full transition-colors relative ${settings.useManualTime ? 'bg-orange-600' : 'bg-gray-300'}`}
                  >
                    <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform ${settings.useManualTime ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
                {settings.useManualTime && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-orange-800 ml-1">Override Date</label>
                      <input
                        type="date"
                        className="w-full px-6 py-4 bg-white border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                        value={settings.manualDate || ''}
                        onChange={(e) => setSettings({ ...settings, manualDate: e.target.value, manualTimeSetAt: Date.now() })}
                      />
                    </div>
                    <div className="space-y-2">
                      <TimePicker 
                        label="Override Time"
                        value={settings.manualTime || '12:00 PM'}
                        onChange={(time) => setSettings({ ...settings, manualTime: time, manualTimeSetAt: Date.now() })}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-end gap-3 bg-gray-50 p-6 rounded-3xl border border-gray-100">
                  <div className="flex-1 space-y-2">
                    <label className="text-xs font-bold text-gray-700 ml-1">Target Day</label>
                    <select 
                      value={selectedDay}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedDay(val);
                        setExpandedDays(prev => ({ ...prev, [val]: true }));
                      }}
                      className="w-full px-6 py-4 bg-white border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 transition-all font-medium appearance-none"
                    >
                      {days.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <TimePicker 
                    label="Add Reservation Slot"
                    value={newTime}
                    onChange={setNewTime}
                    className="flex-1"
                  />
                  <button
                    onClick={addTimeSlot}
                    className="px-8 py-4 bg-orange-600 text-white rounded-2xl font-bold hover:bg-orange-700 transition-all flex items-center shadow-lg shadow-orange-100 shrink-0 h-[58px]"
                  >
                    <Plus className="w-5 h-5 mr-2" /> Add Slot
                  </button>
                </div>

                <div className="space-y-4">
                  {days.map(day => {
                    const slots = settings.daySlots?.[day] || [];
                    if (slots.length === 0) return null;
                    const isExpanded = !!expandedDays[day];
                    
                    return (
                      <div key={day} className="border border-gray-100 bg-gray-50/30 rounded-3xl overflow-hidden transition-all duration-200">
                        {/* Drawer Toggle Header */}
                        <button
                          onClick={() => setExpandedDays(prev => ({ ...prev, [day]: !prev[day] }))}
                          className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-orange-50/30 transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-3">
                            <span className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${isExpanded ? 'bg-orange-600 scale-110 shadow-md shadow-orange-200' : 'bg-gray-450 bg-gray-400'}`} />
                            <span className="text-sm font-black text-gray-900 uppercase tracking-wider">{day}</span>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-white border border-gray-150 px-2.5 py-0.5 rounded-full ml-2">
                              {slots.length} {slots.length === 1 ? 'Slot' : 'Slots'}
                            </span>
                          </div>
                          <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-300 group-hover:text-orange-600 ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Collapsible Body */}
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.22, ease: 'easeInOut' }}
                              className="border-t border-gray-100 bg-white"
                            >
                              <div className="p-6">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                  {sortTimes(slots).map(time => (
                                    <div 
                                      key={`${day}-${time}`}
                                      className="relative group px-6 py-4 bg-gray-50/50 hover:bg-white hover:border-orange-200 hover:shadow-xs rounded-2xl border border-gray-150 flex items-center justify-center font-bold text-gray-900 transition-all"
                                    >
                                      {formatTo12Hour(time)}
                                      <button
                                        onClick={() => removeTimeSlot(time, day)}
                                        className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-lg cursor-pointer"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                  
                  {(!settings.daySlots || Object.values(settings.daySlots).every((s: any) => s.length === 0)) && (
                    <div className="text-center py-12 bg-gray-50 rounded-[2.5rem] border border-dashed border-gray-200">
                      <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-400 font-medium">No time slots configured yet.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* System Maintenance */}
          <div className="bg-red-50 p-8 rounded-[2.5rem] border border-red-100 mt-12 mb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h2 className="text-xl font-bold text-red-900 flex items-center">
                  <Database className="w-5 h-5 mr-2" /> Danger Zone
                </h2>
                <p className="text-red-700 mt-1 text-sm font-medium">Reset the database to a clean state. This will delete all tables, bookings, transactions, and non-admin users.</p>
              </div>
              <button 
                onClick={() => setShowResetConfirm(true)}
                className="px-8 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-xl shadow-red-100 flex items-center gap-2 shrink-0"
              >
                <Trash2 className="w-5 h-5" /> Reset Database
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] p-10 max-w-lg w-full shadow-2xl space-y-8 border border-red-100"
            >
              <div className="w-20 h-20 bg-red-50 rounded-[2rem] flex items-center justify-center mx-auto shadow-inner text-red-600">
                <AlertTriangle className="w-10 h-10" />
              </div>
              
              <div className="text-center space-y-3">
                <h2 className="text-3xl font-black text-gray-900 tracking-tight">Factory Reset?</h2>
                <p className="text-gray-500 font-medium leading-relaxed">
                  This action is <span className="text-red-600 font-bold underline">permanent</span>. All customer data, table registries, and transaction histories will be wiped from the server.
                </p>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest text-center">Type <span className="text-gray-900">"RESET"</span> to confirm</p>
                <input 
                  type="text" 
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder="RESET"
                  className="w-full px-6 py-5 bg-gray-50 border-2 border-gray-100 rounded-3xl text-center font-black text-2xl tracking-widest text-gray-900 placeholder:text-gray-200 focus:border-red-500 outline-none transition-all"
                />
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleResetDatabase}
                  disabled={resetting || resetConfirmText.toLowerCase() !== 'reset'}
                  className="w-full py-5 bg-red-600 text-white rounded-3xl font-bold flex items-center justify-center gap-3 hover:bg-red-700 transition-all shadow-xl shadow-red-100 active:scale-95 disabled:bg-gray-200 disabled:shadow-none"
                >
                  {resetting ? (
                    <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>Confirm Global Reset <ArrowRight className="w-5 h-5" /></>
                  )}
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  disabled={resetting}
                  className="w-full py-5 bg-gray-50 text-gray-600 rounded-3xl font-bold hover:bg-white transition-all border border-gray-100"
                >
                  Cancel Maintenance
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminSettings;

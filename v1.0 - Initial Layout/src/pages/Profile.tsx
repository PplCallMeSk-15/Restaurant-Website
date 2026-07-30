import React, { useEffect, useState, useRef } from 'react';
import { db, auth } from '../firebase/config';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { User, MapPin, Mail, Phone, Lock, Save, HelpCircle, Key, FileText, CheckCircle, Locate } from 'lucide-react';
import { PasswordField } from '../components/PasswordField';
import { validatePhoneNumber, sanitizePhoneInput } from '../utils/validation';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Safe-guard Leaflet's coordinate readers from unmounted DOM crashes
if (L && L.DomUtil) {
  if (typeof L.DomUtil.getPosition === 'function') {
    const originalGetPosition = L.DomUtil.getPosition;
    L.DomUtil.getPosition = function (el: any) {
      if (!el) return { x: 0, y: 0 } as any;
      return el._leaflet_pos || { x: 0, y: 0 } as any;
    };
  }
  if (typeof L.DomUtil.setPosition === 'function') {
    const originalSetPosition = L.DomUtil.setPosition;
    L.DomUtil.setPosition = function (el: any, point: any) {
      if (!el) return;
      originalSetPosition(el, point);
    };
  }
}

export default function Profile() {
  const { user, profile, refreshProfile, isAdmin } = useAuth();
  
  // Tabs: 'personal', 'address', 'security'
  const [activeTab, setActiveTab] = useState<'personal' | 'address' | 'security'>('personal');

  useEffect(() => {
    if (activeTab === 'address' && isAdmin) {
      setActiveTab('personal');
    }
  }, [activeTab, isAdmin]);

  // Personal/Contact state
  const [fullName, setFullName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  
  // Address/Map state
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  // Security elements
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [updating, setUpdating] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Setup form on load
  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName || profile.displayName || '');
      setDisplayName(profile.displayName || '');
      setPhone(profile.phone || '');
      setAddress(profile.address || '');
      setLandmark(profile.landmark || '');
      setCity(profile.city || '');
      setState(profile.state || '');
      setPincode(profile.pincode || '');
      setLatitude(profile.latitude || 12.9716);
      setLongitude(profile.longitude || 77.5946);
    }
  }, [profile]);

  // Map Initializer
  useEffect(() => {
    if (activeTab === 'address' && mapContainerRef.current && !mapRef.current) {
      const initialLat = latitude || 12.9716;
      const initialLng = longitude || 77.5946;

      const mapInstance = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 14,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(mapInstance);

      // Custom marker icon mimicking a high-contrast Spice Garden badge
      const markerIcon = L.divIcon({
        html: `
          <div class="relative flex items-center justify-center">
            <div class="absolute w-10 h-10 bg-orange-500/20 rounded-full animate-ping"></div>
            <div class="bg-orange-600 text-white p-2 ml-1 rounded-full border-2 border-white flex items-center justify-center shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
          </div>
        `,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const pinMarker = L.marker([initialLat, initialLng], {
        icon: markerIcon,
        draggable: false,
      }).addTo(mapInstance);

      mapRef.current = mapInstance;
      markerRef.current = pinMarker;

      // Force refresh size
      setTimeout(() => {
        mapInstance.invalidateSize();
      }, 300);
    }

    // Cleanup reference
    return () => {
      try {
        if (mapRef.current) {
          mapRef.current.off();
          mapRef.current.remove();
        }
      } catch (err) {
        console.warn('Leaflet map cleanup warning:', err);
      } finally {
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [activeTab]);

  // Search address coordinates using OSN Nominatim (Free API)
  const handleGeocodeSearch = async () => {
    if (!address && !city) {
      toast.error('Please enter an address or city to fetch coordinates!');
      return;
    }
    const searchQuery = `${address}, ${city}, ${state} ${pincode}`.trim();
    toast.loading('Searching coordinate details...', { id: 'geocode' });
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`);
      const results = await res.json();
      if (results && results.length > 0) {
        const item = results[0];
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        setLatitude(lat);
        setLongitude(lon);
        toast.success(`Location centered exactly! (${lat.toFixed(4)}, ${lon.toFixed(4)})`, { id: 'geocode' });
        
        if (mapRef.current && markerRef.current) {
          mapRef.current.setView([lat, lon], 15);
          markerRef.current.setLatLng([lat, lon]);
        }
      } else {
        toast.error('Address reference not found.', { id: 'geocode' });
      }
    } catch (err) {
      toast.error('Could not fetch address mapping coordinate.', { id: 'geocode' });
    }
  };

  // Detect current location via navigator.geolocation
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }
    toast.loading('Detecting your location...', { id: 'gps' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setLatitude(lat);
        setLongitude(lon);
        
        toast.success('Current location detected successfully!', { id: 'gps' });
        if (mapRef.current && markerRef.current) {
          mapRef.current.setView([lat, lon], 15);
          markerRef.current.setLatLng([lat, lon]);
        }
      },
      (error) => {
        toast.error('Could not retrieve current location. Please verify location permissions.', { id: 'gps' });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validation checks
    if (!fullName.trim() || !displayName.trim()) {
      toast.error('Name & Display Name fields are required.');
      return;
    }

    if (!validatePhoneNumber(phone)) {
      toast.error('Invalid phone number! Only standard 10-digit Indian mobile numbers (starting with 6, 7, 8, or 9) are saved.');
      return;
    }

    setUpdating(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      const profileRef = doc(db, 'user_profiles', user.uid);

      // Sync basic users collection
      await setDoc(userRef, {
        displayName,
        phone: phone.trim(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // Save complete user profiles collection
      await setDoc(profileRef, {
        uid: user.uid,
        fullName: fullName.trim(),
        displayName: displayName.trim(),
        email: user.email || '',
        phone: phone.trim(),
        address: address.trim(),
        landmark: landmark.trim(),
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        latitude,
        longitude,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      await refreshProfile();
      toast.success('Your workspace profile has been successfully saved!');
    } catch (err: any) {
      toast.error(err.message || 'Profile save failed.');
    } finally {
      setUpdating(false);
    }
  };

  // Change Password flow
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;

    if (!currentPassword) {
      toast.error('Verify your current password first!');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match!');
      return;
    }

    setUpdating(true);
    try {
      // Re-authenticate user
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      
      // Execute password write
      await updatePassword(user, newPassword);
      
      toast.success('Security password upgraded successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Could not upgrade password. Check credentials.');
    } finally {
      setUpdating(false);
    }
  };

  if (!profile) {
    return (
      <div className="pt-36 pb-20 text-center text-gray-500 font-medium">
        Loading Profile Dashboard...
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-28 md:pt-32 pb-16 bg-gray-50">
      <div className="max-w-5xl mx-auto px-4">
        {/* Banner Area */}
        <div className="relative bg-orange-600 rounded-[3rem] px-8 py-12 md:p-14 text-white overflow-hidden shadow-2xl flex flex-col md:flex-row items-center gap-6 mb-8 text-left">
          <div className="absolute right-0 bottom-0 top-0 opacity-10 flex items-center justify-center p-4">
            <User className="w-96 h-96" />
          </div>

          {/* Profile initials block */}
          <div className="shrink-0 w-28 h-28 md:w-32 md:h-32 rounded-[2.5rem] bg-white text-orange-600 font-extrabold text-3xl md:text-4xl flex items-center justify-center border-4 border-white/30 shadow-xl z-10 transition-transform">
            {(fullName || displayName || 'Valued Guest')
              .trim()
              .split(/\s+/)
              .map(part => part[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()}
          </div>

          <div className="space-y-2 z-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur-sm text-white text-xs font-bold rounded-full">
              <span>Verified Account</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">{fullName || 'Valued Guest'}</h2>
            <p className="text-orange-100 text-sm font-semibold">{user?.email}</p>
          </div>
        </div>

        {/* Dashboard grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Left Menu Tabs */}
          <div className="space-y-3 lg:col-span-1">
            <button
              onClick={() => setActiveTab('personal')}
              className={`w-full p-4 rounded-2xl font-bold flex items-center gap-3 transition-all ${
                activeTab === 'personal'
                  ? 'bg-orange-600 text-white shadow-xl shadow-orange-100/50'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              <User className="w-5 h-5" />
              <span>Personal Details</span>
            </button>

            {!isAdmin && (
              <button
                onClick={() => setActiveTab('address')}
                className={`w-full p-4 rounded-2xl font-bold flex items-center gap-3 transition-all ${
                  activeTab === 'address'
                    ? 'bg-orange-600 text-white shadow-xl shadow-orange-100/50'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                <MapPin className="w-5 h-5" />
                <span>Address & Location</span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('security')}
              className={`w-full p-4 rounded-2xl font-bold flex items-center gap-3 transition-all ${
                activeTab === 'security'
                  ? 'bg-orange-600 text-white shadow-xl shadow-orange-100/50'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Lock className="w-5 h-5" />
              <span>Security & Password</span>
            </button>
          </div>

          {/* Tab content area */}
          <div className="lg:col-span-3">
            
            {/* PERSONAL DETAILS TABS */}
            {activeTab === 'personal' && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-8 rounded-[3rem] shadow-xl border border-gray-100 text-left"
              >
                <h3 className="text-xl font-extrabold text-gray-900 mb-6 flex items-center gap-2">
                  <User className="w-6 h-6 text-orange-600" /> Complete Contact Information
                </h3>

                <form onSubmit={handleUpdateProfile} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">Full Name</label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-semibold focus:outline-none"
                        placeholder="Your full name"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">Display Name</label>
                      <input
                        type="text"
                        required
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-semibold focus:outline-none"
                        placeholder="Profile screen name"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">Email <span className="text-xs text-gray-400 font-normal">(Private)</span></label>
                      <input
                        type="text"
                        disabled
                        value={user?.email || ''}
                        className="w-full px-5 py-4 bg-gray-100 border-none rounded-2xl font-semibold outline-none cursor-not-allowed text-gray-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">Indian Mobile (+91)</label>
                      <input
                        type="tel"
                        inputMode="tel"
                        required
                        maxLength={10}
                        value={phone}
                        onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
                        className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-bold focus:outline-none"
                        placeholder="9876543210"
                      />
                      <p className="text-[10px] text-gray-400 font-semibold ml-1">Exactly 10 digits starting with 6-9.</p>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={updating}
                    className="py-4 px-8 bg-orange-600 hover:bg-orange-700 text-white font-extrabold rounded-2xl shadow-xl shadow-orange-100 flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Save className="w-5 h-5" />
                    {updating ? 'Saving...' : 'Save Profile Changes'}
                  </button>
                </form>
              </motion.div>
            )}

            {/* ADDRESS AND MAP TABS */}
            {activeTab === 'address' && !isAdmin && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-8 rounded-[3rem] shadow-xl border border-gray-100 text-left space-y-6"
              >
                <div>
                  <h3 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                    <MapPin className="w-6 h-6 text-orange-600" /> Pin Delivery Address & Location
                  </h3>
                  <p className="text-xs text-gray-400 mt-1 font-semibold">
                    Set your permanent delivery location to auto-fill ordering, reservations, and driver maps!
                  </p>
                </div>

                <form onSubmit={handleUpdateProfile} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 ml-1">Address Lines (House No, Street name)</label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-semibold focus:outline-none"
                      placeholder="e.g. flat 301, Heritage Boulevard"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">Landmark</label>
                      <input
                        type="text"
                        value={landmark}
                        onChange={(e) => setLandmark(e.target.value)}
                        className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-semibold focus:outline-none"
                        placeholder="Near Spice Central Park"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">City</label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-semibold focus:outline-none"
                        placeholder="e.g. Bangalore"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">State</label>
                      <input
                        type="text"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-semibold focus:outline-none"
                        placeholder="Karnataka"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">Pincode</label>
                      <input
                        type="text"
                        value={pincode}
                        onChange={(e) => setPincode(e.target.value.replace(/[^0-9]/g, ''))}
                        maxLength={6}
                        className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-bold focus:outline-none"
                        placeholder="560001"
                      />
                    </div>
                  </div>

                  {/* Location selection actions */}
                  <div className="flex gap-4 flex-wrap">
                    <button
                      type="button"
                      onClick={handleGeocodeSearch}
                      className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <MapPin className="w-3.5 h-3.5 text-orange-600" /> Search Address on Map
                    </button>
                    
                    <button
                      type="button"
                      onClick={handleGetCurrentLocation}
                      className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Locate className="w-3.5 h-3.5 text-orange-600" /> Use Current Location
                    </button>
                  </div>

                  {/* Leaflet map Container element block */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-bold text-gray-500 ml-1">
                      <span>Home Delivery Location Preview Map</span>
                      <button
                        type="button"
                        onClick={handleGetCurrentLocation}
                        className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-100 text-[10px] font-extrabold rounded-lg transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                      >
                        <Locate className="w-3 h-3 text-orange-600 animate-pulse" /> Refresh GPS Location
                      </button>
                    </div>
                    <div
                      ref={mapContainerRef}
                      className="w-full h-72 rounded-[2.5rem] border border-gray-100 shadow-sm z-0 relative"
                      style={{ minHeight: '280px' }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={updating}
                    className="py-4 px-8 bg-orange-600 hover:bg-orange-700 text-white font-extrabold rounded-2xl shadow-xl shadow-orange-100 flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Save className="w-5 h-5" />
                    {updating ? 'Saving Location...' : 'Save Address Details'}
                  </button>
                </form>
              </motion.div>
            )}

            {/* SECURITY & CREDENTIALS RESET TABS */}
            {activeTab === 'security' && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-8 rounded-[3rem] shadow-xl border border-gray-100 text-left"
              >
                <h3 className="text-xl font-extrabold text-gray-900 mb-6 flex items-center gap-2">
                  <Key className="w-6 h-6 text-orange-600" /> Upgrade Password Credentials
                </h3>

                <form onSubmit={handleChangePassword} className="space-y-5">
                  <PasswordField
                    label="Current Verification Password"
                    required
                    placeholder="••••••••"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />

                  <hr className="border-gray-50 my-6" />

                  <PasswordField
                    label="New Account Password"
                    required
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />

                  <PasswordField
                    label="Confirm New Password"
                    required
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />

                  <button
                    type="submit"
                    disabled={updating}
                    className="py-4 px-8 bg-orange-600 hover:bg-orange-700 text-white font-extrabold rounded-2xl shadow-xl shadow-orange-100 flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Save className="w-5 h-5" />
                    {updating ? 'Upgrading Password...' : 'Upgrade Password Credentials'}
                  </button>
                </form>
              </motion.div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

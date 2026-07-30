import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { db, auth } from '../firebase/config';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { MapPin, ArrowRight, Clock, Info, Check, Save, Locate } from 'lucide-react';
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

export default function ProfileSetup() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect to home if they are not logged in
  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  // Form State
  const [fullName, setFullName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [latitude, setLatitude] = useState<number>(12.9716);
  const [longitude, setLongitude] = useState<number>(77.5946);

  const [saving, setSaving] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Sync initial prefilled states
  useEffect(() => {
    const signupPhone = location.state?.phone || '';
    const signupName = location.state?.name || '';

    if (profile) {
      // Autofill Name (Full Name) only if it exists and is not a default guest string
      const rawFullName = profile.fullName || profile.displayName || user?.displayName || signupName || '';
      const isGuest = /guest/i.test(rawFullName);
      setFullName(isGuest ? '' : rawFullName);

      // Leave display name empty so they can fill their own as requested
      setDisplayName('');

      setPhone(profile.phone || signupPhone || user?.phoneNumber || '');
      setAddress(profile.address || '');
      setLandmark(profile.landmark || '');
      setCity(profile.city || '');
      setState(profile.state || '');
      setPincode(profile.pincode || '');
      setLatitude(profile.latitude || 12.9716);
      setLongitude(profile.longitude || 77.5946);
    } else if (signupPhone || signupName) {
      // Prefill from signup state immediately if profile is still loading/null
      setFullName(signupName);
      setPhone(signupPhone);
    }
  }, [profile, user, location.state]);

  // Initialize Map
  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      const mapInstance = L.map(mapContainerRef.current, {
        center: [latitude, longitude],
        zoom: 14,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(mapInstance);

      const markerIcon = L.divIcon({
        html: `
          <div class="relative flex items-center justify-center animate-bounce">
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

      const pinMarker = L.marker([latitude, longitude], {
        icon: markerIcon,
        draggable: false,
      }).addTo(mapInstance);

      mapRef.current = mapInstance;
      markerRef.current = pinMarker;

      setTimeout(() => {
        mapInstance.invalidateSize();
      }, 500);
    }

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
  }, []);

  const handleSuggestLocation = async () => {
    if (!address && !city) {
      toast.error('Type Address & City first so we can center your pin map.');
      return;
    }
    const query = `${address}, ${city}, ${state} ${pincode}`.trim();
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        const item = data[0];
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        setLatitude(lat);
        setLongitude(lon);
        toast.success(`Marker centered successfully! 📍`);
        
        if (mapRef.current && markerRef.current) {
          mapRef.current.setView([lat, lon], 15);
          markerRef.current.setLatLng([lat, lon]);
        }
      }
    } catch (e) {
      console.warn("Nominatim Geocode geocoder failed:", e);
    }
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }
    toast.loading('Detecting your location...', { id: 'gps-setup' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setLatitude(lat);
        setLongitude(lon);
        
        toast.success('Current location detected successfully!', { id: 'gps-setup' });
        if (mapRef.current && markerRef.current) {
          mapRef.current.setView([lat, lon], 15);
          markerRef.current.setLatLng([lat, lon]);
        }
      },
      (error) => {
        toast.error('Could not retrieve current location. Please verify location permissions.', { id: 'gps-setup' });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSaveAndContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!fullName.trim() || !displayName.trim()) {
      toast.error('Real Name & Display Name are required!');
      return;
    }

    if (!validatePhoneNumber(phone)) {
      toast.error('Invalid phone number! Enter a real 10-digit Indian mobile phone number (starting with 6, 7, 8 or 9). No alpha/special chars.');
      return;
    }

    setSaving(true);
    try {
      const uRef = doc(db, 'users', user.uid);
      const profRef = doc(db, 'user_profiles', user.uid);

      await setDoc(uRef, {
        displayName: displayName.trim(),
        phone: phone.trim(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      await setDoc(profRef, {
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
        photoUrl: profile?.photoUrl || '',
        latitude,
        longitude,
        profileSetupPrompted: true,
        profileSetupDeferred: false,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      localStorage.setItem('profile_setup_completed_' + user.uid, 'true');

      await refreshProfile();
      toast.success('Your Profile details are saved! Welcome to Spice Garden 🌿');
      const targetRedirect = (location.state as any)?.redirectTo || '/';
      navigate(targetRedirect);
    } catch (err: any) {
      toast.error(err.message || 'Saving profile coordinates failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleFillLater = async () => {
    if (!user) return;
    try {
      const profRef = doc(db, 'user_profiles', user.uid);
      await setDoc(profRef, {
        uid: user.uid,
        profileSetupPrompted: true,
        profileSetupDeferred: true, // Mark it so we can gently remind them
        updatedAt: serverTimestamp(),
      }, { merge: true });

      localStorage.setItem('profile_setup_completed_' + user.uid, 'false');
      
      await refreshProfile();
      toast.success('Understood! You can manage this at any time in your Account Menu.');
      const targetRedirect = (location.state as any)?.redirectTo || '/';
      navigate(targetRedirect);
    } catch (err) {
      console.error("Error deferring setup:", err);
      // Navigate anyway to assure access
      const targetRedirect = (location.state as any)?.redirectTo || '/';
      navigate(targetRedirect);
    }
  };

  return (
    <div className="min-h-screen pt-28 md:pt-32 pb-16 bg-gray-50 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-4xl w-full bg-white rounded-[3.5rem] border border-gray-100 shadow-2xl p-8 md:p-12 text-left grid grid-cols-1 md:grid-cols-12 gap-8"
      >
        {/* Left Side Info Panel */}
        <div className="md:col-span-4 flex flex-col justify-between py-2 border-r border-gray-100 pr-0 md:pr-8 space-y-6">
          <div className="space-y-4">
            <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-600 mb-6">
              <MapPin className="w-7 h-7" />
            </div>
            
            <h1 className="text-3xl font-black text-gray-900 leading-tight tracking-tight">One-Step Profile Setup File</h1>
            <p className="text-gray-505 text-sm font-medium leading-relaxed">
              Complete your profile address just once, and we will safely auto-fill it for ordering, high-accuracy map-delivery, and quick table reservations!
            </p>
          </div>

          <div className="space-y-3 pt-6">
            <div className="flex items-center gap-2.5 text-xs text-gray-500 font-bold">
              <div className="w-5 h-5 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-[10px]">✓</div>
              <span>Safe and verified contact matching</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-gray-500 font-bold">
              <div className="w-5 h-5 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-[10px]">✓</div>
              <span>Leaflet geolocation mapping</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-gray-500 font-bold">
              <div className="w-5 h-5 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-[10px]">✓</div>
              <span>100% Secure database syncing</span>
            </div>
          </div>
        </div>

        {/* Right Side Form Panel */}
        <form onSubmit={handleSaveAndContinue} className="md:col-span-8 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1">
              <label className="text-xs font-black text-gray-700 uppercase tracking-wider ml-1">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-semibold text-sm focus:outline-none"
                placeholder="John Doe"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-black text-gray-700 uppercase tracking-wider ml-1">Display Name</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-semibold text-sm focus:outline-none"
                placeholder="Nickname / Display"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-black text-gray-700 uppercase tracking-wider ml-1">Indian Mobile (+91)</label>
              <input
                type="tel"
                inputMode="tel"
                required
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
                className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-bold text-sm focus:outline-none"
                placeholder="9876543210"
              />
              <p className="text-[10px] text-gray-400 font-semibold ml-1">10-digit only. No alpha/whitespace.</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-black text-gray-700 uppercase tracking-wider ml-1">Address Lines</label>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onBlur={handleSuggestLocation}
                className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-semibold text-sm focus:outline-none"
                placeholder="e.g. Room 4, Heritage Apt"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-black text-gray-700 uppercase tracking-wider ml-1">Landmark</label>
              <input
                type="text"
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-semibold text-sm focus:outline-none"
                placeholder="Near Park Central Gate"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-black text-gray-700 uppercase tracking-wider ml-1">City</label>
              <input
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                onBlur={handleSuggestLocation}
                className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-semibold text-sm focus:outline-none"
                placeholder="City"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-black text-gray-700 uppercase tracking-wider ml-1">State</label>
              <input
                type="text"
                required
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-semibold text-sm focus:outline-none"
                placeholder="State"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-black text-gray-700 uppercase tracking-wider ml-1">Pincode</label>
              <input
                type="text"
                required
                maxLength={6}
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={handleSuggestLocation}
                className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-bold text-sm focus:outline-none"
                placeholder="560001"
              />
            </div>
          </div>

          {/* Setup Leaflet map selection */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-bold text-gray-400 ml-1">
              <span>Home location preview map</span>
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
              className="w-full h-44 rounded-2xl border border-gray-100 shadow-sm relative z-0"
              style={{ minHeight: '180px' }}
            />
          </div>

          {/* Options: Save & Continue AND Fill Later buttons */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-gray-50">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-4 bg-orange-600 hover:bg-orange-700 text-white font-extrabold rounded-2xl shadow-xl shadow-orange-100 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Save className="w-5 h-5" />
              {saving ? 'Saving...' : 'Save & Continue'}
            </button>
            
            <button
              type="button"
              onClick={handleFillLater}
              disabled={saving}
              className="px-8 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Clock className="w-4 h-4" />
              <span>Fill Later</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

import React, { useEffect, useState, useRef } from 'react';
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
import { MapPin, Navigation, Search, Check, AlertCircle, Loader2, Home } from 'lucide-react';
import toast from 'react-hot-toast';
import { getDistanceKm } from '../utils/coordinateUtils';

// Custom inline SVG icons for Leaflet - Avoids broken image assets with Webpack/Vite bundlers
const customerIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center">
      <!-- Outer glowing circle -->
      <div class="absolute w-12 h-12 bg-orange-500/20 rounded-full animate-ping"></div>
      <!-- Rounded badge with Home Icon -->
      <div class="bg-orange-600 text-white p-2.5 rounded-full shadow-lg border-2 border-white flex items-center justify-center animate-bounce">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      </div>
      <div class="w-3.5 h-3.5 bg-orange-600/30 rounded-full absolute -bottom-1"></div>
    </div>
  `,
  className: '', // Clear standard Leaflet class decoration
  iconSize: [38, 38],
  iconAnchor: [19, 19],
});

const partnerIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center">
      <!-- Glowing radar pulse -->
      <div class="absolute w-14 h-14 bg-blue-500/20 rounded-full animate-ping"></div>
      <div class="absolute w-10 h-10 bg-blue-500/15 rounded-full animate-pulse"></div>
      <!-- Round vehicle container moped/scooter -->
      <div class="bg-blue-600 text-white p-2.5 rounded-full shadow-xl border-2 border-white flex items-center justify-center transition-transform hover:scale-110">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <!-- Scooter wheels -->
          <circle cx="6" cy="18" r="2" />
          <circle cx="18" cy="18" r="2" />
          <!-- Base / body -->
          <path d="M8 18h8" />
          <path d="M18 18h1c.6 0 1-.4 1-1v-2c0-.6-.4-1-1-1h-2" />
          <path d="M6 18H5a1 1 0 0 1-1-1v-2c0-.6.4-1 1-1h1" />
          <!-- Columns -->
          <path d="M16 14V8a1 1 0 0 0-1-1h-3" />
          <path d="M12 7h-2.5a.5.5 0 0 0-.5.5V14" />
          <!-- Delivery thermal backpack box -->
          <rect x="5" y="8" width="5" height="5" rx="1" fill="currentColor" stroke="none" />
        </svg>
      </div>
    </div>
  `,
  className: '',
  iconSize: [38, 38],
  iconAnchor: [19, 19],
});

const restaurantIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center">
      <!-- Glow beacon -->
      <div class="absolute w-12 h-12 bg-red-500/10 rounded-full"></div>
      <!-- Rounded Utensils badge -->
      <div class="bg-red-600 text-white p-2.5 rounded-full shadow-xl border-2 border-white flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
          <path d="M7 2v4" />
          <path d="M21 15V2v0a5 5 0 0 0-5 5v3c0 1.1.9 2 2 2h3Zm0 0v7" />
          <path d="M12 15v7" />
        </svg>
      </div>
    </div>
  `,
  className: '',
  iconSize: [38, 38],
  iconAnchor: [19, 19],
});

interface DeliveryMapProps {
  mode: 'picker' | 'view' | 'track';
  latitude?: number;
  longitude?: number;
  partnerLatitude?: number;
  partnerLongitude?: number;
  onLocationSelect?: (lat: number, lng: number, address?: string) => void;
  height?: string;
  addressToSearch?: string;
  restaurantLatitude?: number;
  restaurantLongitude?: number;
  deliveryRangeKm?: number;
  isLocked?: boolean;
}

export default function DeliveryMap({
  mode,
  latitude = 12.9716, // Defaults to central Bangalore coordinates
  longitude = 77.5946,
  partnerLatitude,
  partnerLongitude,
  onLocationSelect,
  height = '400px',
  addressToSearch = '',
  restaurantLatitude,
  restaurantLongitude,
  deliveryRangeKm,
  isLocked = false
}: DeliveryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Keep refs updated on every render to circumvent Leaflet event closure entrapments
  const isLockedRef = useRef(isLocked);
  const onLocationSelectRef = useRef(onLocationSelect);

  useEffect(() => {
    isLockedRef.current = isLocked;
  }, [isLocked]);

  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);
  
  // Leaflet references
  const mapRef = useRef<L.Map | null>(null);
  const customerMarkerRef = useRef<L.Marker | null>(null);
  const partnerMarkerRef = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const restaurantMarkerRef = useRef<L.Marker | null>(null);
  const rangeCircleRef = useRef<L.Circle | null>(null);

  // Fetch real road connection route from free project-osrm driving router API
  const fetchAndApplyOSRMRoute = async (custLat: number, custLng: number, partnerLat: number, partnerLng: number) => {
    if (!polylineRef.current) return;

    // Apply baseline straight dashed line first so it displays instantly
    polylineRef.current.setLatLngs([
      [custLat, custLng],
      [partnerLat, partnerLng]
    ]);
    polylineRef.current.setStyle({
      color: '#ea580c',
      weight: 4,
      dashArray: '6, 6',
      opacity: 0.7
    });

    try {
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${custLng},${custLat};${partnerLng},${partnerLat}?overview=full&geometries=geojson`
      );
      if (!response.ok) throw new Error('OSRM router returned error status');
      const data = await response.json();
      
      if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates) {
        const coords = data.routes[0].geometry.coordinates;
        const roadPath = coords.map((c: [number, number]) => [c[1], c[0]]);
        
        if (polylineRef.current) {
          polylineRef.current.setLatLngs(roadPath);
          polylineRef.current.setStyle({
            color: '#ea580c', // Design theme orange
            weight: 5,
            dashArray: undefined, // Solid bold path on road connection!
            opacity: 0.95
          });
        }
      }
    } catch (err) {
      console.warn('[OSRM Routing Fallback] Drawing default straight-line connector:', err);
    }
  };

  // Address search state variables
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addressDetails, setAddressDetails] = useState('');
  const [distanceToRest, setDistanceToRest] = useState<number | null>(null);

  // Handle address searches via OSM Nominatim API (Free and keyless)
  const handleAddressSearch = async (queryStr: string) => {
    if (!queryStr.trim()) return;
    setSearchLoading(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryStr)}&limit=5`,
        {
          headers: {
            'Accept-Language': 'en'
          }
        }
      );
      const data = await response.json();
      setSearchResults(data);
    } catch (err) {
      console.error('Nominatim query error:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  // Debounced search trigger effect to prevent network flooding and wrong location results
  useEffect(() => {
    if (searchQuery.trim().length <= 2) {
      setSearchResults([]);
      return;
    }
    if (searchQuery === addressDetails) {
      return;
    }

    const timer = setTimeout(() => {
      handleAddressSearch(searchQuery);
    }, 600);

    return () => clearTimeout(timer);
  }, [searchQuery, addressDetails]);

  // Dynamic distance computation to validation range limit
  useEffect(() => {
    if (latitude && longitude && restaurantLatitude && restaurantLongitude) {
      const dist = getDistanceKm(latitude, longitude, restaurantLatitude, restaurantLongitude);
      setDistanceToRest(dist);
    } else {
      setDistanceToRest(null);
    }
  }, [latitude, longitude, restaurantLatitude, restaurantLongitude]);

  // Geo-reverse lookups to translate coords back to readable street names
  const handleReverseGeocode = async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
        {
          headers: {
            'Accept-Language': 'en'
          }
        }
      );
      const data = await response.json();
      if (data && data.display_name) {
        setSearchQuery(data.display_name);
        setAddressDetails(data.display_name);
        if (onLocationSelectRef.current) {
          onLocationSelectRef.current(lat, lng, data.display_name);
        }
      } else {
        if (onLocationSelectRef.current) {
          onLocationSelectRef.current(lat, lng);
        }
      }
    } catch (err) {
      console.error('Nominatim reverse lookup error:', err);
      if (onLocationSelectRef.current) {
        onLocationSelectRef.current(lat, lng);
      }
    }
  };

  // Trigger geolocation pin finder
  const handleUseMyCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }

    const toastId = toast.loading('Connecting standard GPS satellite...');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        if (mapRef.current) {
          mapRef.current.setView([lat, lng], 16);
          customerMarkerRef.current?.setLatLng([lat, lng]);
        }

        toast.dismiss(toastId);
        toast.success('Successfully retrieved GPS telemetry!');
        await handleReverseGeocode(lat, lng);
      },
      (error) => {
        toast.dismiss(toastId);
        toast.error('Failed to resolve GPS coordinates. Check browser permissions.');
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  };

  // Setup Leaflet Map On Mounted
  useEffect(() => {
    if (!containerRef.current) return;

    // Check if map is already initialized, if so, cleanly destroy it first
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    // Determine default center coordinates
    // If we have custom restaurant coordinates and latitude/longitude is at default Bangalore, center on the restaurant coordinates
    let startLat = latitude;
    let startLng = longitude;
    if (latitude === 12.9716 && longitude === 77.5946 && restaurantLatitude && restaurantLongitude) {
      startLat = restaurantLatitude;
      startLng = restaurantLongitude;
    }

    // Initialize map object with computed view state
    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
      maxZoom: 19
    }).setView([startLat, startLng], 14);

    mapRef.current = map;

    // Real delivery UI styled clean map tiles (CartoDB Positron)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);

    // Add Customer Marker Pin
    const customerMarker = L.marker([startLat, startLng], {
      icon: customerIcon,
      draggable: mode === 'picker' && !isLockedRef.current
    }).addTo(map);

    customerMarkerRef.current = customerMarker;

    // If Mode is Picker: Allow click/drags to select locations
    if (mode === 'picker') {
      // Pin Drag Events
      customerMarker.on('dragend', async () => {
        if (isLockedRef.current) return;
        const coords = customerMarker.getLatLng();
        await handleReverseGeocode(coords.lat, coords.lng);
      });

      // Map Canvas Click Events
      map.on('click', async (e: L.LeafletMouseEvent) => {
        if (isLockedRef.current) return;
        const { lat, lng } = e.latlng;
        customerMarker.setLatLng([lat, lng]);
        await handleReverseGeocode(lat, lng);
      });
    }

    // Load static restaurant pin and limit boundaries circle if settings are supplied
    if (restaurantLatitude && restaurantLongitude) {
      const restMarker = L.marker([restaurantLatitude, restaurantLongitude], {
        icon: restaurantIcon
      }).addTo(map);
      restMarker.bindPopup('<b>Restaurant Location</b>');
      restaurantMarkerRef.current = restMarker;

      if (deliveryRangeKm) {
        const circle = L.circle([restaurantLatitude, restaurantLongitude], {
          radius: deliveryRangeKm * 1000,
          color: '#ea580c',
          fillColor: '#ea580c',
          fillOpacity: 0.1,
          weight: 1.5,
          dashArray: '5, 5'
        }).addTo(map);
        rangeCircleRef.current = circle;
        
        // Fit view bounds to comfortably show entire radius circle
        if (mode === 'picker') {
          map.fitBounds(circle.getBounds(), { padding: [30, 30] });
        }
      }
    }

    // If Mode is Track: Instantiate partner telemetry and route overlays
    if (mode === 'track' && partnerLatitude && partnerLongitude) {
      const partnerMarker = L.marker([partnerLatitude, partnerLongitude], {
        icon: partnerIcon
      }).addTo(map);

      partnerMarkerRef.current = partnerMarker;

      const polyline = L.polyline([[startLat, startLng], [partnerLatitude, partnerLongitude]], {
        color: '#ea580c',
        weight: 4,
        dashArray: '6, 6',
        opacity: 0.8
      }).addTo(map);

      polylineRef.current = polyline;

      // Fit bounds to display both points perfectly centered
      const bounds = L.latLngBounds([[startLat, startLng], [partnerLatitude, partnerLongitude]]);
      map.fitBounds(bounds, { padding: [50, 50] });

      // Run road route connection query
      fetchAndApplyOSRMRoute(startLat, startLng, partnerLatitude, partnerLongitude);
    }

    // Trigger Initial reverse-geocode lookup if in picker mode
    if (mode === 'picker') {
      handleReverseGeocode(startLat, startLng);
    }

    // Fix map layout on next frame tick with incremental delays for animation frames
    const layoutTimers: any[] = [];
    [100, 300, 600, 1200].forEach((delay) => {
      const timer = setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
          
          if (mode === 'track' && partnerLatitude && partnerLongitude) {
            const bounds = L.latLngBounds([[startLat, startLng], [partnerLatitude, partnerLongitude]]);
            mapRef.current.fitBounds(bounds, { padding: [50, 50] });
          } else if (restaurantLatitude && restaurantLongitude && deliveryRangeKm && mode === 'picker') {
            if (rangeCircleRef.current) {
              mapRef.current.fitBounds(rangeCircleRef.current.getBounds(), { padding: [30, 30] });
            } else {
              mapRef.current.setView([startLat, startLng], 14);
            }
          } else {
            mapRef.current.setView([startLat, startLng], mode === 'picker' ? 16 : 14);
          }
        }
      }, delay);
      layoutTimers.push(timer);
    });

    return () => {
      layoutTimers.forEach(clearTimeout);
      try {
        if (mapRef.current) {
          mapRef.current.off();
          mapRef.current.remove();
        }
      } catch (err) {
        console.warn('Leaflet map cleanup warning:', err);
      } finally {
        mapRef.current = null;
        customerMarkerRef.current = null;
        partnerMarkerRef.current = null;
        polylineRef.current = null;
        restaurantMarkerRef.current = null;
        rangeCircleRef.current = null;
      }
    };
  }, []);

  // Handle container resizing securely (e.g. inside animating modals, responsive tabs)
  useEffect(() => {
    if (!containerRef.current) return;

    const handleResize = () => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    };

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(handleResize);
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Sync coords if parent triggers an external address query lookup or bounds change
  useEffect(() => {
    if (!mapRef.current || !customerMarkerRef.current) return;

    const latVal = latitude;
    const lngVal = longitude;

    const currentMarker = customerMarkerRef.current.getLatLng();
    // Use epsilon-tolerance check to avoid updating maps repeatedly on microscopic float updates
    if (Math.abs(currentMarker.lat - latVal) > 0.00001 || Math.abs(currentMarker.lng - lngVal) > 0.00001) {
      customerMarkerRef.current.setLatLng([latVal, lngVal]);
      mapRef.current.setView([latVal, lngVal], 15);
    }
  }, [latitude, longitude]);

  const prevIsLockedRef = useRef(isLocked);

  // Sync dragging behavior and fit view only once upon unlocking transitions
  useEffect(() => {
    if (!mapRef.current || !customerMarkerRef.current) return;

    if (mode === 'picker') {
      if (isLocked) {
        customerMarkerRef.current.dragging?.disable();
      } else {
        customerMarkerRef.current.dragging?.enable();
        // Dynamically fit view bounds of the range circle only when switching from Me (locked GPS) to Friend (unlocked pin)
        if (prevIsLockedRef.current !== isLocked && isLocked === false) {
          if (rangeCircleRef.current) {
            mapRef.current.fitBounds(rangeCircleRef.current.getBounds(), { padding: [35, 35] });
          }
        }
      }
    }
    prevIsLockedRef.current = isLocked;
  }, [isLocked, mode]);

  // Sync Restaurant Location and Delivery boundaries dynamically if changed in parent forms
  useEffect(() => {
    if (!mapRef.current) return;

    if (restaurantLatitude && restaurantLongitude) {
      if (restaurantMarkerRef.current) {
        restaurantMarkerRef.current.setLatLng([restaurantLatitude, restaurantLongitude]);
      } else {
        const restMarker = L.marker([restaurantLatitude, restaurantLongitude], {
          icon: restaurantIcon
        }).addTo(mapRef.current);
        restMarker.bindPopup('<b>Restaurant Location</b>');
        restaurantMarkerRef.current = restMarker;
      }

      if (deliveryRangeKm) {
        if (rangeCircleRef.current) {
          rangeCircleRef.current.setLatLng([restaurantLatitude, restaurantLongitude]);
          rangeCircleRef.current.setRadius(deliveryRangeKm * 1000);
        } else {
          rangeCircleRef.current = L.circle([restaurantLatitude, restaurantLongitude], {
            radius: deliveryRangeKm * 1000,
            color: '#ea580c',
            fillColor: '#ea580c',
            fillOpacity: 0.1,
            weight: 1.5,
            dashArray: '5, 5'
          }).addTo(mapRef.current);
        }
      } else {
        if (rangeCircleRef.current) {
          rangeCircleRef.current.remove();
          rangeCircleRef.current = null;
        }
      }
    } else {
      if (restaurantMarkerRef.current) {
        restaurantMarkerRef.current.remove();
        restaurantMarkerRef.current = null;
      }
      if (rangeCircleRef.current) {
        rangeCircleRef.current.remove();
        rangeCircleRef.current = null;
      }
    }
  }, [restaurantLatitude, restaurantLongitude, deliveryRangeKm]);

  // Sync Live Partner telemetry if values are stream updated from database
  useEffect(() => {
    if (!mapRef.current) return;

    if (partnerLatitude && partnerLongitude) {
      // Update partner marker coordinate
      if (partnerMarkerRef.current) {
        partnerMarkerRef.current.setLatLng([partnerLatitude, partnerLongitude]);
      } else {
        partnerMarkerRef.current = L.marker([partnerLatitude, partnerLongitude], {
          icon: partnerIcon
        }).addTo(mapRef.current);
      }

      // Update dotted tracking route polyline
      if (polylineRef.current) {
        fetchAndApplyOSRMRoute(latitude, longitude, partnerLatitude, partnerLongitude);
      } else {
        polylineRef.current = L.polyline([[latitude, longitude], [partnerLatitude, partnerLongitude]], {
          color: '#ea580c',
          weight: 4,
          dashArray: '6, 6',
          opacity: 0.8
        }).addTo(mapRef.current);
        fetchAndApplyOSRMRoute(latitude, longitude, partnerLatitude, partnerLongitude);
      }

      // Automatically adjust visual window bounds so customer can always see both pins live
      const bounds = L.latLngBounds([[latitude, longitude], [partnerLatitude, partnerLongitude]]);
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    } else {
      // Clear partner marker & routes
      if (partnerMarkerRef.current) {
        partnerMarkerRef.current.remove();
        partnerMarkerRef.current = null;
      }
      if (polylineRef.current) {
        polylineRef.current.remove();
        polylineRef.current = null;
      }
    }
  }, [partnerLatitude, partnerLongitude, latitude, longitude]);

  return (
    <div className="flex flex-col w-full relative" style={{ height }}>
      {/* Dynamic Instruction Banner for Customer Picker Mode */}
      {mode === 'picker' && (
        <div className="mb-4 z-20 relative">
          {isLocked ? (
            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-800 text-left shadow-sm">
              <div className="bg-emerald-600 text-white p-2 rounded-xl flex items-center justify-center shrink-0">
                <Check className="w-4 h-4" />
              </div>
              <div className="text-xs">
                <p className="font-extrabold uppercase tracking-wider text-emerald-950">Precise GPS Location Locked 🔒</p>
                <p className="font-semibold text-emerald-700/95 mt-0.5">
                  Your coordinates have been automatically fetched and locked to protect delivery accuracy.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-orange-50 border border-orange-100/70 rounded-2xl flex items-center gap-3 text-orange-900 text-left shadow-sm">
              <div className="bg-orange-600 text-white p-2 rounded-xl flex items-center justify-center shrink-0 animate-pulse">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="text-xs">
                <p className="font-extrabold uppercase tracking-wider text-orange-950">Manual Pin Placement Mode 📍</p>
                <p className="font-semibold text-orange-850 mt-0.5">
                  Click anywhere on the map or drag the orange marker to place the delivery pin precisely for your delivery address. Use standard zoom/pan commands to find your way.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actual Map Canvas DOM Ref */}
      <div
        ref={containerRef}
        className="w-full bg-[#FAF9F5] rounded-[2rem] border border-gray-200 shadow-inner z-10 overflow-hidden flex-1"
      />

      {/* Lat/Lng Coordinate Visual Overlay */}
      <div className="mt-2.5 flex items-center justify-between text-[11px] font-mono font-bold text-gray-500 uppercase px-1">
        <div className="flex gap-4">
          <span>LAT: <span className="text-gray-900">{latitude?.toFixed(6)}</span></span>
          <span>LNG: <span className="text-gray-900">{longitude?.toFixed(6)}</span></span>
        </div>
        {mode === 'picker' && !isLocked && (
          <span className="text-orange-600 animate-pulse text-[10px] hidden sm:inline">
            📍 Drag map pin or click map to move
          </span>
        )}
      </div>

      {/* Validation details status indicator overlay */}
      {distanceToRest !== null && deliveryRangeKm && mode === 'picker' && (
        <div className={`mt-3 p-4 rounded-3xl border flex items-start gap-3 ${
          distanceToRest <= deliveryRangeKm 
            ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
            : 'bg-red-50 border-red-100 text-red-800'
        }`}>
          {distanceToRest <= deliveryRangeKm ? (
            <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-650 text-red-600 shrink-0 mt-0.5" />
          )}
          <div className="text-xs text-left">
            <p className="font-extrabold uppercase tracking-wider">
              {distanceToRest <= deliveryRangeKm ? 'Within Delivery Range ✓' : 'Outside Delivery Range ❌'}
            </p>
            <p className="font-semibold text-gray-600 leading-normal mt-0.5">
              Distance to restaurant: <span className="font-bold text-gray-900 font-mono">{distanceToRest.toFixed(2)} km</span>
              {distanceToRest <= deliveryRangeKm 
                ? ` (We validate and deliver up to ${deliveryRangeKm} km radius from database settings)`
                : ` (Restaurant maximum limit set at ${deliveryRangeKm} km. Ordering will be restricted for this distance.)`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

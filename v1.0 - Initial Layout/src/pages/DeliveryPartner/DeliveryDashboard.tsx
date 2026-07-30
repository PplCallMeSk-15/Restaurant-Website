import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { db } from '../../firebase/config';
import { collection, onSnapshot, updateDoc, doc, addDoc, query, where, orderBy, getDocs, serverTimestamp } from 'firebase/firestore';
import { Order, DeliveryPartner } from '../../types';
import { 
  ShoppingBag, Phone, MapPin, Navigation, Eye, CheckCircle2, 
  Map, User, LogOut, Loader2, ArrowRight, ClipboardList, TrendingUp,
  AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';
import DeliveryMap from '../../components/DeliveryMap';
import { getAppSettings } from '../../services/settingsService';

export default function DeliveryDashboard() {
  const [partner, setPartner] = useState<DeliveryPartner | null>(null);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'assigned' | 'history' | 'profile'>('assigned');
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any>(null);
  const [transitionConfirm, setTransitionConfirm] = useState<{ status: string; label: string; description: string } | null>(null);

  const navigate = useNavigate();
  const simTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load App Settings
  useEffect(() => {
    const fetchSettings = async () => {
      const data = await getAppSettings();
      setSettings(data);
    };
    fetchSettings();
  }, []);

  // Authenticate session
  useEffect(() => {
    const sessionStr = localStorage.getItem('delivery_partner_session');
    if (!sessionStr) {
      toast.error('Session expired, please log back in');
      navigate('/delivery-partner/login');
      return;
    }
    const driver = JSON.parse(sessionStr);
    setPartner(driver);
  }, [navigate]);

  // Read orders real-time when authenticated
  useEffect(() => {
    if (!partner) return;

    // Listen to assigned/active orders
    const qActive = query(
      collection(db, 'orders'),
      where('deliveryPartnerId', '==', partner.id)
    );

    const unsubscribe = onSnapshot(qActive, (snapshot) => {
      const ordersList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Order[];
      
      // Separate active vs historical
      const active = ordersList.filter(o => !['delivered', 'cancelled'].includes(o.status));
      const hist = ordersList.filter(o => ['delivered', 'cancelled'].includes(o.status));

      setActiveOrders(active);
      setHistoryOrders(hist);
      setLoading(false);

      // Auto-set first active order if none is chosen
      if (active.length > 0 && (!selectedOrder || !active.find(o => o.id === selectedOrder.id))) {
        setSelectedOrder(active[0]);
      } else if (active.length === 0) {
        setSelectedOrder(null);
      } else {
        // Sync selectedOrder with newest database fields
        const updatedSelected = active.find(o => o.id === selectedOrder.id);
        if (updatedSelected) {
          setSelectedOrder(updatedSelected);
        }
      }
    }, (err) => {
      console.error("Error subscribing to driver assignments:", err);
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (simTimerRef.current) clearInterval(simTimerRef.current);
    };
  }, [partner, selectedOrder?.id]);

  // Periodic Telemetry Updates when status is 'On The Way' using actual driver GPS coordinates
  useEffect(() => {
    if (selectedOrder && selectedOrder.status === 'On The Way') {
      if (!simTimerRef.current) {
        // Run first GPS coordinates sync immediately on status state transition
        syncDriverLocation(true);

        // Periodically sync the driver's ACTUAL physical GPS coordinates every 10 seconds
        simTimerRef.current = setInterval(async () => {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              async (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;

                if (!isNaN(lat) && !isNaN(lng)) {
                  try {
                    // Sync coordinates to current order reference
                    await updateDoc(doc(db, 'orders', selectedOrder.id), {
                      partnerLatitude: lat,
                      partnerLongitude: lng,
                      updatedAt: serverTimestamp()
                    });

                    // Add raw log point in tracking collection
                    await addDoc(collection(db, 'delivery_tracking'), {
                      orderId: selectedOrder.id,
                      partnerId: partner!.id,
                      deliveryPartnerId: partner!.id,
                      latitude: lat,
                      longitude: lng,
                      timestamp: serverTimestamp(),
                      updatedAt: serverTimestamp()
                    });

                    console.log(`Live telemetry updated: ${lat}, ${lng}`);
                  } catch (err) {
                    console.error("Error updating live telemetry:", err);
                  }
                }
              },
              (err) => {
                console.warn("Could not retrieve precise device GPS telemetry periodically:", err.message);
              },
              { enableHighAccuracy: true, timeout: 8000 }
            );
          }
        }, 10000); 
      }
    } else {
      if (simTimerRef.current) {
        clearInterval(simTimerRef.current);
        simTimerRef.current = null;
      }
    }

    return () => {
      if (simTimerRef.current) {
        clearInterval(simTimerRef.current);
        simTimerRef.current = null;
      }
    };
  }, [selectedOrder?.status, selectedOrder?.id, partner, settings]);

  // Method to acquire accurate GPS coordinate from driver and upload immediately
  const syncDriverLocation = async (silent = false): Promise<{ lat: number; lng: number } | null> => {
    if (!selectedOrder || !partner) return null;
    
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        if (!silent) toast.error('Geolocation is not supported by your browser');
        resolve(null);
        return;
      }

      const toastId = !silent ? toast.loading('Acquiring precise driver GPS coordinates...') : '';
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;

          try {
            await updateDoc(doc(db, 'orders', selectedOrder.id), {
              partnerLatitude: lat,
              partnerLongitude: lng,
              updatedAt: serverTimestamp()
            });

            await addDoc(collection(db, 'delivery_tracking'), {
              orderId: selectedOrder.id,
              partnerId: partner.id,
              deliveryPartnerId: partner.id,
              latitude: lat,
              longitude: lng,
              timestamp: serverTimestamp(),
              updatedAt: serverTimestamp()
            });

            if (!silent) {
              toast.dismiss(toastId);
              toast.success('Driver GPS coordinates synced with customer instantly!');
            }
            resolve({ lat, lng });
          } catch (err) {
            console.error('Error saving driver location:', err);
            if (!silent) {
              toast.dismiss(toastId);
              toast.error('Failed to update live coordinates in database');
            }
            resolve(null);
          }
        },
        (error) => {
          if (!silent) {
            toast.dismiss(toastId);
            toast.error('Failed to resolve precise GPS location. Please allow browser location access.');
          }
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  };

  // Update Status Action Handlers
  const handleStatusTransition = async (newStatus: string) => {
    if (!selectedOrder) return;
    try {
      let fieldsToUpdate: any = { 
        status: newStatus,
        updatedAt: serverTimestamp()
      };

      // Set baseline coordinates when starting the transit
      if (newStatus === 'On The Way') {
        // Attempt to get accurate browser coordinates first
        let detectedCoords: { lat: number; lng: number } | null = null;
        if (navigator.geolocation) {
          detectedCoords = await new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
              () => resolve(null),
              { enableHighAccuracy: true, timeout: 5000 }
            );
          });
        }

        if (detectedCoords) {
          fieldsToUpdate.partnerLatitude = detectedCoords.lat;
          fieldsToUpdate.partnerLongitude = detectedCoords.lng;
          toast.success('Detected your real starting GPS location!');
        } else {
          fieldsToUpdate.partnerLatitude = settings?.restaurantLatitude || 12.9716;
          fieldsToUpdate.partnerLongitude = settings?.restaurantLongitude || 77.5946;
          toast.success('Starting transit simulation from restaurant base coordinate.');
        }
      }

      await updateDoc(doc(db, 'orders', selectedOrder.id), fieldsToUpdate);

      // Log status changes
      await addDoc(collection(db, 'delivery_status_logs'), {
        orderId: selectedOrder.id,
        status: newStatus,
        updatedBy: 'partner',
        updatedAt: serverTimestamp()
      });

      // Update assignment
      const assignRef = collection(db, 'delivery_assignments');
      const q = query(assignRef, where('orderId', '==', selectedOrder.id), where('partnerId', '==', partner!.id));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        await updateDoc(doc(db, 'delivery_assignments', qSnap.docs[0].id), {
          status: newStatus.toLowerCase().replace(/\s+/g, '_'),
          updatedAt: serverTimestamp()
        });
      }

      toast.success(`Milestone updated to: ${newStatus}`);
    } catch (err) {
      toast.error('Failed to change order status');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('delivery_partner_session');
    toast.success('Logged out from shift panel');
    navigate('/delivery-partner/login');
  };

  const handleOpenNavigation = async (type: 'google' | 'apple' | 'geo') => {
    if (!selectedOrder || !selectedOrder.latitude || !selectedOrder.longitude) {
      toast.error('Coordinates not specified for customer address');
      return;
    }

    // Try to acquire and record accurate driver coordinates first
    const coords = await syncDriverLocation(true);
    const { latitude: destLat, longitude: destLng } = selectedOrder;
    const startLat = coords?.lat || selectedOrder.partnerLatitude || settings?.restaurantLatitude;
    const startLng = coords?.lng || selectedOrder.partnerLongitude || settings?.restaurantLongitude;

    let url = '';
    if (type === 'google') {
      if (startLat && startLng) {
        url = `https://www.google.com/maps/dir/?api=1&origin=${startLat},${startLng}&destination=${destLat},${destLng}&travelmode=driving`;
      } else {
        url = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`;
      }
    } else if (type === 'apple') {
      if (startLat && startLng) {
        url = `maps://?saddr=${startLat},${startLng}&daddr=${destLat},${destLng}&dirflg=d`;
      } else {
        url = `maps://?daddr=${destLat},${destLng}&dirflg=d`;
      }
    } else if (type === 'geo') {
      url = `geo:${destLat},${destLng}?q=${destLat},${destLng}`;
    }

    window.open(url, '_blank');
    toast.success(`Route loaded! Live GPS coordinates synced.`);
  };

  if (loading || !partner) {
    return <div className="pt-32 text-center text-gray-500">Connecting Fleet Dashboard...</div>;
  }

  // Calculate earnings mock logic based on delivery length
  const totalEarnings = historyOrders.length * 60; // Standard ₹60 flat rate per delivery

  return (
    <div className="min-h-screen bg-[#FBFBFA] pt-20 pb-20 font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Driver Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 pb-6 border-b border-gray-150 gap-4">
          <div className="text-left">
            <h1 className="text-3xl font-extrabold text-gray-900 leading-tight">Driver Hub</h1>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">
              Active Driver: <span className="text-orange-600">{partner.fullName}</span> {"\u2022"} Vehicle: {partner.vehicleType} ({partner.vehicleNumber})
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('assigned')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase transition-all ${
                activeTab === 'assigned' ? 'bg-orange-600 text-white shadow-md' : 'bg-white text-gray-400 hover:text-orange-600'
              }`}
            >
              Assigned ({activeOrders.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase transition-all ${
                activeTab === 'history' ? 'bg-orange-600 text-white shadow-md' : 'bg-white text-gray-400 hover:text-orange-600'
              }`}
            >
              History ({historyOrders.length})
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase transition-all ${
                activeTab === 'profile' ? 'bg-orange-600 text-white shadow-md' : 'bg-white text-gray-400 hover:text-orange-600'
              }`}
            >
              Earnings & Profile
            </button>
            <button
              onClick={handleLogout}
              className="p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm"
              title="Logout session"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Dashboard Panels */}
        {activeTab === 'assigned' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Hand: Assigned Order Selection List */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-gray-400" /> Active Roster Tasks
              </h3>
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                {activeOrders.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setSelectedOrder(o)}
                    className={`w-full text-left p-5 rounded-[2rem] border transition-all ${
                      selectedOrder?.id === o.id 
                        ? 'bg-white border-orange-500 ring-2 ring-orange-500/10 shadow-lg' 
                        : 'bg-white hover:bg-gray-50/50 border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-mono text-[10px] font-extrabold text-orange-600 uppercase tracking-tighter bg-orange-50 px-2 py-1 rounded-md">
                        #{o.id.slice(-6).toUpperCase()}
                      </span>
                      <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md font-bold uppercase">
                        {o.status === 'Assigned To Delivery Partner' ? 'Assigned' : o.status}
                      </span>
                    </div>

                    <h4 className="font-bold text-sm text-gray-900 leading-tight mb-2">{o.customerName}</h4>
                    <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed mb-3">â˜‘ï¸ {o.address}</p>
                    
                    <div className="flex justify-between items-center text-[10px] text-gray-400 pt-3 border-t border-gray-50 font-bold uppercase">
                      <span>{o.items.length} items</span>
                      <span className="text-gray-900 text-sm">₹{o.total.toFixed(2)}</span>
                    </div>
                  </button>
                ))}
                {activeOrders.length === 0 && (
                  <div className="p-10 text-center bg-white rounded-[2rem] border border-gray-100/60 text-gray-400 text-xs font-bold uppercase tracking-widest mt-4">
                    Relax! No tasks in pool.
                  </div>
                )}
              </div>
            </div>

            {/* Right Hand / Details and Maps Display */}
            <div className="lg:col-span-2 space-y-6">
              {selectedOrder ? (
                <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm p-8 space-y-8">
                  {/* Order detail segments */}
                  <div className="flex flex-col md:flex-row justify-between items-start border-b border-gray-50 pb-6 gap-4">
                    <div className="text-left">
                      <span className="font-mono text-xs text-gray-400 bg-gray-50 px-3 py-1.5 rounded-lg border">Order Reference: #{selectedOrder.id}</span>
                      <h3 className="text-2xl font-extrabold text-gray-900 mt-3 flex items-center gap-2">
                        {selectedOrder.customerName}
                      </h3>
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1.5 mt-2">
                        <Phone className="w-3.5 h-3.5 text-gray-400" /> {selectedOrder.customerPhone}
                      </p>
                    </div>

                    {/* Milestone State Actions */}
                    <div className="flex flex-wrap gap-2">
                      {selectedOrder.status === 'Assigned To Delivery Partner' && (
                        <button
                          onClick={() => setTransitionConfirm({
                            status: 'Picked Up',
                            label: 'Accept & Pick Up Order',
                            description: 'Are you sure you want to Accept and Pick Up this order from the restaurant? This action will set your shift status to busy, locking this order to your active route.'
                          })}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs px-5 py-3 rounded-xl shadow-md transition-colors cursor-pointer"
                        >
                          Accept & Pick Up Order
                        </button>
                      )}
                      
                      {selectedOrder.status === 'Picked Up' && (
                        <button
                          onClick={() => setTransitionConfirm({
                            status: 'On The Way',
                            label: 'Start Delivery Routines',
                            description: 'Are you sure you want to Start Delivery Routines? This action will activate real-time device GPS tracking and notify the customer that you are on your way with their hot food.'
                          })}
                          className="bg-sky-600 hover:bg-sky-700 text-white font-black text-xs px-5 py-3 rounded-xl shadow-md transition-colors cursor-pointer"
                        >
                          Start Delivery Routines
                        </button>
                      )}

                      {selectedOrder.status === 'On The Way' && (
                        <button
                          onClick={() => setTransitionConfirm({
                            status: 'delivered',
                            label: 'Confirm Final Handover',
                            description: 'Are you sure you have completed the handover? Please verify you are at the correct delivery pin and the customer has received their items before confirming.'
                          })}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-5 py-3 rounded-xl shadow-md transition-colors cursor-pointer"
                        >
                          Confirm Final Handover
                        </button>
                      )}

                      {['Picked Up', 'On The Way'].includes(selectedOrder.status) && (
                        <button
                          onClick={async () => {
                            const coords = await syncDriverLocation(false);
                            if (coords) {
                              const url = `https://www.google.com/maps/dir/?api=1&origin=${coords.lat},${coords.lng}&destination=${selectedOrder.latitude},${selectedOrder.longitude}&travelmode=driving`;
                              window.open(url, '_blank');
                            } else {
                              handleOpenNavigation('google');
                            }
                          }}
                          className="bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs px-5 py-3 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer border border-orange-500 animate-pulse uppercase tracking-wider font-sans shrink-0"
                        >
                          <Navigation className="w-3.5 h-3.5 fill-current rotate-45" />
                          Find Route & Sync Live GPS 📍
                        </button>
                      )}

                      <div className="flex flex-wrap gap-1 bg-gray-50 p-1.5 rounded-xl border border-gray-150">
                        <span className="text-[9px] font-black uppercase text-gray-400 self-center px-1">Nav:</span>
                        <button
                          onClick={() => handleOpenNavigation('google')}
                          className="bg-white hover:bg-orange-50 text-gray-850 hover:text-orange-650 border border-gray-150 font-bold text-[10px] px-2.5 py-2 rounded-lg flex items-center gap-1 shadow-xs cursor-pointer"
                          title="Google Maps app alignment"
                        >
                          <Navigation className="w-3 h-3 text-orange-600 fill-current rotate-45" /> Google
                        </button>
                        <button
                          onClick={() => handleOpenNavigation('apple')}
                          className="bg-white hover:bg-orange-50 text-gray-850 hover:text-orange-650 border border-gray-150 font-bold text-[10px] px-2.5 py-2 rounded-lg flex items-center gap-1 shadow-xs cursor-pointer"
                          title="Apple Maps application routing"
                        >
                           Apple
                        </button>
                        <button
                          onClick={() => handleOpenNavigation('geo')}
                          className="bg-white hover:bg-orange-50 text-gray-850 hover:text-orange-650 border border-gray-150 font-bold text-[10px] px-2.5 py-2 rounded-lg flex items-center gap-1 shadow-xs cursor-pointer"
                          title="System Default mapping navigator"
                        >
                          📱 Default
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Address specifics */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-gray-50/50 rounded-3xl border border-gray-100">
                    <div className="text-left">
                      <h4 className="text-[10px] text-gray-400 uppercase tracking-widest font-black mb-1">Customer Address âœ“</h4>
                      <p className="text-sm font-bold text-gray-800 leading-relaxed">{selectedOrder.address}</p>
                      {selectedOrder.landmark && (
                        <div className="text-xs text-gray-500 mt-2">
                          <span className="font-extrabold text-gray-700">Landmark:</span> {selectedOrder.landmark}
                        </div>
                      )}
                    </div>
                    <div className="text-left">
                      <h4 className="text-[10px] text-gray-400 uppercase tracking-widest font-black mb-1">Kitchen Directions âœ“</h4>
                      <p className="text-sm font-bold text-gray-850 leading-relaxed">Spice Garden Main Station (central delivery desk)</p>
                      {selectedOrder.notes && (
                        <div className="text-xs text-red-600 mt-2 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 font-medium italic">
                          Important Note: "{selectedOrder.notes}"
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Interactive map visualization */}
                  <div className="space-y-2">
                    <h4 className="text-left text-[11px] text-gray-450 uppercase font-black tracking-widest flex items-center gap-1.5">
                      <Map className="w-4 h-4" /> Live Transit Routing Route
                    </h4>
                    <DeliveryMap
                      mode="track"
                      latitude={selectedOrder.latitude}
                      longitude={selectedOrder.longitude}
                      partnerLatitude={selectedOrder.partnerLatitude}
                      partnerLongitude={selectedOrder.partnerLongitude}
                      height="350px"
                    />
                  </div>

                  {/* Items list summary */}
                  <div className="space-y-3 pt-6 border-t border-gray-50">
                    <h4 className="text-left text-[11px] text-gray-450 uppercase font-black tracking-widest leading-none">Items Manifest</h4>
                    <div className="divide-y divide-gray-50 max-h-40 overflow-y-auto pr-2">
                      {selectedOrder.items.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between py-3 text-sm font-bold text-gray-800 font-sans">
                          <span>{item.name} <span className="text-gray-400 text-xs font-semibold">x{item.quantity}</span></span>
                          <span className="font-mono text-gray-500">₹{item.price.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-[2.5rem] border border-gray-100 p-16 text-center text-gray-400 space-y-4">
                  <ShoppingBag className="w-12 h-12 mx-auto text-gray-200 animate-bounce" />
                  <p className="text-sm font-bold uppercase tracking-widest leading-normal">
                    Select an Active assigned delivery task to display maps and start routes.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Historical tasks logging review panel */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm">
            <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" /> Completed Delivery History
            </h3>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#FAF9F5] text-[10px] text-gray-450 uppercase font-black tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Order ID</th>
                    <th className="px-6 py-4">Customer Name</th>
                    <th className="px-6 py-4">Address</th>
                    <th className="px-6 py-4">Total Price</th>
                    <th className="px-6 py-4">Fulfillment Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {historyOrders.map((o) => (
                    <tr key={o.id} className="text-xs hover:bg-gray-50/20 text-gray-600 font-sans">
                      <td className="px-6 py-5 font-mono">#{o.id.slice(-6).toUpperCase()}</td>
                      <td className="px-6 py-5 font-bold text-gray-900">{o.customerName}</td>
                      <td className="px-6 py-5 truncate max-w-xs">{o.address}</td>
                      <td className="px-6 py-5 font-bold text-gray-900">₹{o.total.toFixed(2)}</td>
                      <td className="px-6 py-5">
                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${
                          o.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-105 text-red-800'
                        }`}>
                          {o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {historyOrders.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-gray-400 font-bold uppercase tracking-widest">
                        No previous delivery tasks completed on this account.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab Profile & Earnings */}
        {activeTab === 'profile' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 text-left relative">
              <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" /> Driver Earnings (Future Ready)
              </h3>
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-3xl p-6 text-center space-y-2 mb-6">
                <span className="text-[10px] text-emerald-700 font-black uppercase tracking-widest">Calculated Payout Rate</span>
                <h4 className="text-4xl font-extrabold text-emerald-900">₹{totalEarnings.toLocaleString()}</h4>
                <p className="text-[10px] text-gray-400 font-medium">₹60.00 flat convenience incentive earned per successful delivery</p>
              </div>
              <div className="space-y-4 text-xs text-gray-600 font-sans">
                <div className="flex justify-between border-b pb-2"><span>Finished Shipments:</span> <span className="font-bold text-gray-900">{historyOrders.filter(o => o.status === 'delivered').length}</span></div>
                <div className="flex justify-between border-b pb-2"><span>Vehicle Fuel Usage Incentive:</span> <span className="font-bold text-gray-900 font-mono">₹{(historyOrders.filter(o => o.status === 'delivered').length * 15).toLocaleString()}</span></div>
                <p className="text-[10px] text-gray-400 leading-normal italic mt-4 font-medium">Earnings payout calculates on midnight shifts every Saturday and processes directly to registered driver account coordinates.</p>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 text-left">
              <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                <User className="w-5 h-5 text-gray-400" /> Roster Profile
              </h3>
              <div className="space-y-4 font-sans text-xs text-gray-600">
                <div className="flex justify-between border-b pb-2"><span>Full Name:</span> <span className="font-bold text-gray-900">{partner.fullName}</span></div>
                <div className="flex justify-between border-b pb-2"><span>Mobile Number:</span> <span className="font-bold text-gray-900">{partner.phone}</span></div>
                <div className="flex justify-between border-b pb-2"><span>Contact Email Address:</span> <span className="font-bold text-gray-900">{partner.email}</span></div>
                <div className="flex justify-between border-b pb-2"><span>Vehicle Tier:</span> <span className="font-bold text-gray-900">{partner.vehicleType}</span></div>
                <div className="flex justify-between border-b pb-2"><span>License Plate Index:</span> <span className="font-bold text-gray-900 font-mono">{partner.vehicleNumber}</span></div>
              </div>
            </div>
          </div>
        )}

        {/* Custom Confirmation Modal to Prevent False Taps */}
        {transitionConfirm && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 select-none">
            <div className="bg-white rounded-[2rem] border border-gray-100 max-w-md w-full overflow-hidden shadow-2xl p-7 space-y-6 text-left transform duration-200 scale-100 animate-in fade-in-50">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-2xl shrink-0 ${
                  transitionConfirm.status === 'Picked Up' ? 'bg-indigo-50 text-indigo-600' :
                  transitionConfirm.status === 'On The Way' ? 'bg-sky-50 text-sky-600' : 
                  'bg-emerald-50 text-emerald-600'
                }`}>
                  <AlertTriangle className="w-6 h-6 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-extrabold text-gray-900 tracking-tight">Confirm Status Progression</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                    Milestone: {transitionConfirm.label}
                  </p>
                </div>
              </div>

              <p className="text-xs text-gray-600 leading-relaxed font-sans font-medium">
                {transitionConfirm.description}
              </p>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTransitionConfirm(null)}
                  className="flex-1 py-3 bg-gray-55 hover:bg-gray-100 text-gray-800 text-xs font-black rounded-xl transition-all uppercase tracking-wider cursor-pointer text-center select-none border border-gray-200"
                >
                  Dismiss / Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const status = transitionConfirm.status;
                    setTransitionConfirm(null);
                    await handleStatusTransition(status);
                  }}
                  className={`flex-1 py-3 text-white text-xs font-black rounded-xl transition-all uppercase tracking-wider cursor-pointer text-center select-none shadow-md ${
                    transitionConfirm.status === 'Picked Up' ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100' :
                    transitionConfirm.status === 'On The Way' ? 'bg-sky-600 hover:bg-sky-700 shadow-sky-100' : 
                    'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'
                  }`}
                >
                  Confirm Action ➔
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useCartStore } from '../store/useCartStore';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { collection, addDoc, serverTimestamp, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { MapPin, Phone, Mail, CreditCard, ChevronRight, CheckCircle2, Utensils, ShoppingBag, Flag, Navigation, Locate, Star, X, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import DeliveryMap from '../components/DeliveryMap';
import { getAppSettings, isOrderingOpen, convert24to12, subscribeToSettings } from '../services/settingsService';
import { getDistanceKm } from '../utils/coordinateUtils';
import { validatePhoneNumber, sanitizePhoneInput } from '../utils/validation';
import { ChefLoader } from '../components/ChefLoader';
import { submitFeedback } from '../services/feedbackService';
import { clientTriggerEmail } from '../services/clientEmailTrigger';
import { buildOrderItemsTable } from '../services/emailTemplates';

const Checkout = () => {
  const { items, getTotal, clearCart } = useCartStore();
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(() => {
    return sessionStorage.getItem('lastCheckedOutOrderId');
  });

  // If there are real items in the cart, this is a new checkout flow. 
  // Discard any session-persisted orderId to show the brand new checkout form.
  useEffect(() => {
    if (items.length > 0) {
      sessionStorage.removeItem('lastCheckedOutOrderId');
      setOrderId(null);
    }
  }, [items.length]);

  // If cart is empty, and user didn't just place an order (no orderId), redirect them to /menu.
  // This prevents seeing a blank checkout screen with 0rs price on page reload.
  useEffect(() => {
    if (!authLoading && user && items.length === 0 && !orderId) {
      navigate('/menu');
    }
  }, [items.length, orderId, authLoading, user, navigate]);

  useEffect(() => {
    if (!authLoading && !user) {
      toast.error('Please create an account or login to proceed to checkout!');
      navigate('/signup', { state: { redirectTo: '/checkout' } });
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (orderId) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [orderId]);

  const orderType = 'delivery';
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [landmark, setLandmark] = useState('');
  const [notes, setNotes] = useState('');
  const [settings, setSettings] = useState<any>(null);
  const [isLocationBlocked, setIsLocationBlocked] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [orderOpen, setOrderOpen] = useState(true);

  const [showRatingModal, setShowRatingModal] = useState(false);
  const [hasShownRating, setHasShownRating] = useState(false);
  const [ratingVal, setRatingVal] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  // Subscribe to order status for rating trigger when delivery completed
  useEffect(() => {
    if (!orderId) return;

    const unsubscribe = onSnapshot(doc(db, 'orders', orderId), (docSnap) => {
      if (docSnap.exists()) {
        const orderData = docSnap.data();
        if (orderData.status === 'delivered') {
          if (!orderData.ratedByCustomer && !ratingSubmitted && !hasShownRating) {
            setShowRatingModal(true);
            setHasShownRating(true);
          }
        }
      }
    }, (err) => {
      console.error("Error listening to order status in checkout success page:", err);
    });

    return () => unsubscribe();
  }, [orderId, ratingSubmitted, hasShownRating]);

  // Navigate back to orders or home once feedback is submitted or skipped
  useEffect(() => {
    if (ratingSubmitted) {
      sessionStorage.removeItem('lastCheckedOutOrderId');
      const timer = setTimeout(() => {
        navigate('/orders');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [ratingSubmitted, navigate]);

  const acquireGPSLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }

    setGpsLoading(true);
    setIsLocationBlocked(false);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setCoordinates({ lat, lng });
        setIsLocationBlocked(false);
        setGpsLoading(false);
        toast.success('Successfully resolved precise GPS coordinates!');
      },
      (error) => {
        setGpsLoading(false);
        if (error.code === error.PERMISSION_DENIED) {
          setIsLocationBlocked(true);
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const refreshGPSLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }

    setGpsLoading(true);
    setIsLocationBlocked(false);
    toast.loading('Detecting precise coordinates...', { id: 'gps-checkout' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setCoordinates({ lat, lng });
        setIsLocationBlocked(false);
        setGpsLoading(false);
        toast.success('Successfully resolved precise GPS coordinates!', { id: 'gps-checkout' });
      },
      (error) => {
        setGpsLoading(false);
        if (error.code === error.PERMISSION_DENIED) {
          setIsLocationBlocked(true);
        }
        toast.error('Could not retrieve current coordinates. Verify location permissions.', { id: 'gps-checkout' });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  useEffect(() => {
    if (orderType === 'delivery' && !coordinates) {
      acquireGPSLocation();
    }
  }, [orderType]);

  useEffect(() => {
    const unsubscribeSettings = subscribeToSettings((data) => {
      setSettings(data);
      if (data) {
        const open = isOrderingOpen(data);
        setOrderOpen(open);
      }
    });
    return () => unsubscribeSettings();
  }, []);

  useEffect(() => {
    if (!settings) return;

    // Periodically update the ordering open state so it updates in real-time
    const checkInterval = setInterval(() => {
      setOrderOpen(isOrderingOpen(settings));
    }, 5000);

    return () => clearInterval(checkInterval);
  }, [settings]);

  useEffect(() => {
    // Under sandbox / iframe environments, trigger a reliable delayed geolocation fetch on page load
    const timer = setTimeout(() => {
      if (orderType === 'delivery') {
        acquireGPSLocation();
      }
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  const [formData, setFormData] = useState({
    customerName: profile?.displayName || '',
    customerEmail: user?.email || '',
    customerPhone: '',
    address: '',
    paymentMethod: 'cash',
  });

  // Reactive pre-population of permanent customer profile metadata
  useEffect(() => {
    if (profile) {
      setFormData({
        customerName: profile.fullName || profile.displayName || '',
        customerEmail: profile.email || user?.email || '',
        customerPhone: profile.phone || '',
        address: profile.address || '',
        paymentMethod: 'cash',
      });
      setLandmark(profile.landmark || '');
      if (profile.latitude && profile.longitude) {
        setCoordinates({ lat: profile.latitude, lng: profile.longitude });
      } else {
        acquireGPSLocation();
      }
    }
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      toast.error('Your cart is empty! Cannot place an empty order.');
      return;
    }
    if (!orderOpen) {
      toast.error('Ordering is currently closed by the administration or outside allowable hours.');
      return;
    }
    if (!user) {
      toast.error('Please login to place an order');
      return;
    }

    if (!formData.customerName || !formData.customerPhone) {
      toast.error('Please enter name and phone number');
      return;
    }

    if (!validatePhoneNumber(formData.customerPhone)) {
      toast.error('Invalid contact number! Please enter a standard 10-digit Indian mobile number (without country prefix, spaces or symbols).');
      return;
    }

    if (orderType === 'delivery') {
      if (isLocationBlocked || !coordinates) {
        toast.error('Before placing a delivery order, you must allow browser GPS location access and automatically load your coordinates.');
        return;
      }
      if (!formData.address) {
        toast.error('Please specify a delivery address');
        return;
      }

      // Geofencing delivery range validation
      if (settings?.restaurantLatitude && settings?.restaurantLongitude && settings?.deliveryRangeKm) {
        const distance = getDistanceKm(
          coordinates.lat,
          coordinates.lng,
          settings.restaurantLatitude,
          settings.restaurantLongitude
        );
        if (distance > settings.deliveryRangeKm) {
          toast.error(`Order restricted. Your location is too far from our kitchen (${distance.toFixed(2)} km away, limit is ${settings.deliveryRangeKm} km).`);
          return;
        }
      }
    }

    setLoading(true);
    try {
      const orderData = {
        userId: user.uid,
        items: items.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity })),
        total: getTotal() * 1.08,
        status: orderType === 'delivery' ? 'Ready For Delivery' : 'pending', // Auto progress ready for assigning if delivery
        createdAt: serverTimestamp(),
        orderType,
        landmark: orderType === 'delivery' ? landmark : '',
        notes: notes || '',
        latitude: orderType === 'delivery' ? (coordinates?.lat || null) : null,
        longitude: orderType === 'delivery' ? (coordinates?.lng || null) : null,
        ...formData,
        address: orderType === 'delivery' ? formData.address : 'Spice Garden Headquarters (Dine-in/Pickup)',
      };

      const docRef = await addDoc(collection(db, 'orders'), orderData);
      
      // Log order received status
      await addDoc(collection(db, 'delivery_status_logs'), {
        orderId: docRef.id,
        status: 'Order Received',
        updatedBy: 'customer',
        updatedAt: serverTimestamp()
      });

      if (orderType === 'delivery') {
        await addDoc(collection(db, 'delivery_status_logs'), {
          orderId: docRef.id,
          status: 'Ready For Delivery',
          updatedBy: 'admin',
          updatedAt: serverTimestamp()
        });
      }

      setOrderId(docRef.id);
      sessionStorage.setItem('lastCheckedOutOrderId', docRef.id);
      clearCart();
      toast.success('Order placed successfully!');

      // Trigger Order Created email notification directly from client
      clientTriggerEmail(
        orderData.customerEmail,
        orderData.customerName,
        'Order Received Successfully',
        `Thank you for your order. We have successfully received your order and our kitchen has started processing it.\n\nEstimated Preparation Time: 30-40 minutes.`,
        'ORDER_CREATED',
        docRef.id,
        'orderId',
        {
          orderId: docRef.id,
          orderItems: buildOrderItemsTable(orderData.items || []),
          deliveryAddress: orderData.address
        }
      ).catch(err => console.warn('[Client Email Trigger] Order created email failed:', err));
      
      // WhatsApp integration removed/disabled by user request
      
    } catch (error: any) {
      toast.error(error?.message || 'Failed to place order due to database error.');
      handleFirestoreError(error, OperationType.WRITE, 'orders');
    } finally {
      setLoading(false);
    }
  };

  if (orderId) {
    return (
      <div className="min-h-screen pt-32 pb-20 flex items-center justify-center px-4 bg-gray-50">
        <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md w-full bg-white p-10 rounded-[3rem] shadow-xl text-center border border-gray-100"
        >
          <div className="w-24 h-24 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
            <CheckCircle2 className="w-12 h-12" />
          </div>
          <h2 className="text-3xl font-bold mb-4">Order Confirmed!</h2>
          <p className="text-gray-500 mb-8 leading-relaxed text-sm">
            Thank you for your order, <span className="text-gray-900 font-bold">{formData.customerName}</span>. Your {orderType === 'delivery' ? 'delivery driver' : 'meal'} is preparing now.
          </p>
          <p className="text-sm text-gray-400 mb-8 bg-gray-50 py-3 rounded-xl border border-gray-100">Order ID: <span className="font-mono text-gray-900">{orderId}</span></p>
          <div className="space-y-4">
             {orderType === 'delivery' ? (
               <button 
                  onClick={() => {
                    sessionStorage.removeItem('lastCheckedOutOrderId');
                    navigate(`/orders/${orderId}/track`);
                  }}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white py-4 rounded-2xl font-bold transition-all shadow-lg shadow-orange-100"
                >
                  Track Live Delivery Now
                </button>
             ) : (
               <button 
                  onClick={() => {
                    sessionStorage.removeItem('lastCheckedOutOrderId');
                    navigate('/orders');
                  }}
                  className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold hover:bg-orange-600 transition-all shadow-lg"
                >
                  Track My Order
                </button>
             )}
              <button 
                onClick={() => {
                  sessionStorage.removeItem('lastCheckedOutOrderId');
                  navigate('/');
                }}
                className="text-orange-600 font-bold hover:underline block mx-auto text-sm"
              >
                Return to Home
              </button>
          </div>
        </motion.div>

        {/* Dynamic / Automatic Rating Modal on Delivery Completed */}
        <AnimatePresence>
          {showRatingModal && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                className="bg-white rounded-[2.5rem] border border-gray-100 max-w-md w-full overflow-hidden shadow-2xl p-8 space-y-6 text-center transform"
              >
                <div className="flex justify-between items-center pb-2">
                  <span className="text-[10px] text-orange-600 font-black uppercase tracking-widest bg-orange-50 px-3 py-1 rounded-full">
                    Order Completed! 🎉
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowRatingModal(false);
                      setRatingSubmitted(true);
                    }}
                    className="p-2 hover:bg-gray-100 text-gray-400 hover:text-gray-900 rounded-full transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-2 text-left">
                  <h3 className="text-2xl font-extrabold text-gray-900 tracking-tight leading-none">Rate Your Experience</h3>
                  <p className="text-xs text-gray-500 font-semibold leading-relaxed">
                    How was your meal and the delivery partner's speed? Your feedback helps Spice Garden maintain excellence.
                  </p>
                </div>

                {/* Star Picker */}
                <div className="flex items-center justify-center gap-2 py-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRatingVal(star)}
                      className="p-1 cursor-pointer transition-transform duration-200 hover:scale-110"
                    >
                      <Star
                        className={`w-10 h-10 transition-colors ${
                          ratingVal >= star 
                            ? 'text-amber-500 fill-amber-500' 
                            : 'text-gray-200 hover:text-amber-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>

                {/* Review Message Textarea */}
                <div className="space-y-1 bg-gray-50 p-4 rounded-2xl border border-gray-100 text-left">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block text-left">
                    Write a brief review (Optional)
                  </label>
                  <textarea
                    value={ratingComment}
                    onChange={(e) => setRatingComment(e.target.value)}
                    placeholder="Describe the delivery, food temperature, or service quality..."
                    rows={3}
                    className="w-full bg-transparent border-none text-xs font-semibold text-gray-800 placeholder-gray-400 focus:ring-0 focus:outline-none resize-none pt-1"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (orderId) {
                        try {
                          await updateDoc(doc(db, 'orders', orderId), { ratedByCustomer: true });
                        } catch (err) {
                          console.warn("Could not mark order as rated during skip:", err);
                        }
                      }
                      setShowRatingModal(false);
                      setRatingSubmitted(true);
                    }}
                    className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-150 text-gray-800 text-xs font-black rounded-2xl transition-all uppercase tracking-wider cursor-pointer text-center select-none"
                  >
                    Skip Choice
                  </button>
                  <button
                    type="button"
                    disabled={submittingRating}
                    onClick={async () => {
                      if (!user) {
                        toast.error("Please login to submit feedback!");
                        return;
                      }
                      setSubmittingRating(true);
                      try {
                        await submitFeedback({
                          userId: user.uid,
                          orderId: orderId,
                          rating: ratingVal,
                          comment: ratingComment
                        });
                        if (orderId) {
                          try {
                            await updateDoc(doc(db, 'orders', orderId), { ratedByCustomer: true });
                          } catch (err) {
                            console.warn("Could not mark order as rated during submit:", err);
                          }
                        }
                        toast.success("Thank you! Your rating helps us grow! 🌿", {
                          style: { background: '#10b981', color: '#fff' }
                        });
                        setShowRatingModal(false);
                        setRatingSubmitted(true);
                      } catch (error) {
                        toast.error("Failed to submit review");
                      } finally {
                        setSubmittingRating(false);
                      }
                    }}
                    className="flex-1 py-3.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-black rounded-2xl transition-all uppercase tracking-wider cursor-pointer text-center select-none shadow-md shadow-orange-100 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  >
                    {submittingRating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Submit ➔"
                    )}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (loading) {
    return <ChefLoader message="Sending your order request to the kitchen... Spices are being selected! 🌶️👨‍🍳" />;
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-32 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-12">
          {/* Checkout Form */}
          <div className="lg:w-2/3">
             <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-8 md:p-12 rounded-[3.5rem] shadow-xl border border-gray-100"
             >
                <h2 className="text-3xl font-bold mb-10 flex items-center justify-between">
                    <span className="flex items-center"><MapPin className="w-8 h-8 mr-3 text-orange-600" /> Checkout Details</span>
                    <span className="text-xs bg-orange-100 text-orange-600 px-3 py-1 rounded-full uppercase font-bold">Delivery</span>
                </h2>
                <form onSubmit={handleSubmit} className="space-y-8">
                    {!orderOpen && (
                      <div className="p-6 bg-red-50 border border-red-100 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4 text-left">
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center shrink-0">
                            <Utensils className="w-6 h-6 text-red-600 animate-bounce" />
                          </div>
                          <div>
                            <h3 className="font-extrabold text-red-950 uppercase tracking-wider text-xs">Food Ordering Closed</h3>
                            <p className="text-red-850 text-xs mt-0.5 font-semibold leading-relaxed">
                              {settings?.menuEnabled === false 
                                ? 'Online food ordering has been temporarily disabled by the Administrator.' 
                                : `Ordering is currently closed. Kitchen hours are: ${convert24to12(settings?.orderStartTime || '09:00')} to ${convert24to12(settings?.orderEndTime || '22:00')}.`}
                            </p>
                          </div>
                        </div>
                        <div className="px-5 py-2 bg-red-650/10 text-red-600 border border-red-200/50 text-xs font-black uppercase tracking-widest rounded-xl shrink-0">
                          Closed
                        </div>
                      </div>
                    )}


                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2 text-left">
                            <label className="text-sm font-bold text-gray-700 ml-1 uppercase">Full Name</label>
                            <input
                            type="text"
                            required
                             className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-medium"
                             value={formData.customerName}
                             onChange={(e) => setFormData({...formData, customerName: e.target.value})}
                            />
                        </div>
                        <div className="space-y-2 text-left">
                            <label className="text-sm font-bold text-gray-700 ml-1 uppercase">Phone Number</label>
                            <input
                            type="tel"
                            required
                            maxLength={10}
                             className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-medium"
                             value={formData.customerPhone}
                             onChange={(e) => setFormData({...formData, customerPhone: sanitizePhoneInput(e.target.value)})}
                            />
                        </div>
                    </div>
                    
                    {orderType === 'delivery' && (
                        <>
                            <div className="space-y-2 text-left">
                                <label className="text-sm font-bold text-gray-700 ml-1 uppercase">Full Delivery Address</label>
                                <textarea
                                    required={orderType === 'delivery'}
                                    rows={3}
                                    className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-medium text-sm"
                                    placeholder="Street Name, Building Number, Block, Landmark"
                                    value={formData.address}
                                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                                />
                            </div>

                            <div className="space-y-2 text-left">
                                <label className="text-sm font-bold text-gray-700 ml-1 uppercase">Landmark (Optional)</label>
                                <input
                                    type="text"
                                    className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-medium text-sm"
                                    placeholder="e.g. Opposite Metro Pillar 125"
                                    value={landmark}
                                    onChange={(e) => setLandmark(e.target.value)}
                                />
                            </div>

                            {/* Map coordinates picker */}
                            <div className="space-y-3">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                    <div className="flex flex-col gap-1.5 text-left">
                                        <label className="text-xs font-black text-gray-700 ml-1 uppercase tracking-wider block">Pin Exact Delivery coordinates on Map</label>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {coordinates && (
                                                <span className="text-[10px] bg-orange-50 border border-orange-100 text-orange-700 px-2.5 py-1 rounded-lg font-mono font-extrabold uppercase tracking-wide">
                                                    GPS: {coordinates.lat.toFixed(5)}, {coordinates.lng.toFixed(5)}
                                                </span>
                                             )}
                                             <button
                                                 type="button"
                                                 onClick={refreshGPSLocation}
                                                 className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-100 text-[10px] font-extrabold rounded-lg transition-all flex items-center gap-1.5 shadow-sm cursor-pointer hover:scale-[1.02]"
                                             >
                                                 <Locate className="w-3.5 h-3.5 text-orange-600 animate-pulse" /> Refresh GPS Location
                                             </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Loading Indicator */}
                                {gpsLoading && (
                                    <div className="p-4 bg-orange-50 border border-orange-100 rounded-2xl flex items-center gap-3 text-orange-950 text-left">
                                        <div className="w-4 h-4 border-2 border-orange-600 border-t-transparent rounded-full animate-spin shrink-0" />
                                        <div className="text-xs font-black uppercase tracking-wider text-orange-900">
                                            Syncing with device GPS... Please wait!
                                        </div>
                                    </div>
                                )}

                                {/* If location is blocked, show a friendly persistent panel instead of general toast popup error */}
                                {isLocationBlocked && (
                                    <div className="p-4 bg-amber-50 border border-amber-200/50 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-900 text-left shadow-sm">
                                        <div className="flex items-start gap-2.5">
                                            <div className="bg-amber-600 text-white p-2 rounded-xl flex items-center justify-center shrink-0">
                                                <Navigation className="w-4 h-4 animate-bounce" />
                                            </div>
                                            <div className="text-xs flex-1">
                                                <p className="font-extrabold uppercase tracking-wider text-amber-950">GPS Access Blocked 📍</p>
                                                <p className="font-semibold text-amber-800/95 mt-0.5 leading-relaxed">
                                                    We can't find your location automatically because GPS access is blocked. Please unblock / allow location permission in your browser address bar/site settings, then click retry.
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsLocationBlocked(false);
                                                acquireGPSLocation();
                                            }}
                                            className="px-4.5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl transition-all uppercase tracking-wider shrink-0 cursor-pointer shadow-md shadow-amber-100 border border-amber-500 hover:scale-[1.02]"
                                        >
                                            Retry Selection 🎯
                                        </button>
                                    </div>
                                )}

                                <DeliveryMap
                                    mode="picker"
                                    latitude={coordinates?.lat || settings?.restaurantLatitude}
                                    longitude={coordinates?.lng || settings?.restaurantLongitude}
                                    restaurantLatitude={settings?.restaurantLatitude}
                                    restaurantLongitude={settings?.restaurantLongitude}
                                    deliveryRangeKm={settings?.deliveryRangeKm}
                                    isLocked={true}
                                    onLocationSelect={(lat, lng) => {
                                        setCoordinates({ lat, lng });
                                    }}
                                    height="320px"
                                />
                            </div>
                        </>
                    )}

                    <div className="space-y-2 text-left">
                        <label className="text-sm font-bold text-gray-700 ml-1 uppercase">Order Notes / Delivery Instructions (Optional)</label>
                        <input
                            type="text"
                            className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-medium text-sm"
                            placeholder="e.g. Leave with guard, ring doorbell twice"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>

                    <div className="pt-6">
                        <h3 className="text-2xl font-bold mb-6 flex items-center">
                            <CreditCard className="w-7 h-7 mr-3 text-orange-600" /> Payment Method
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <button
                                type="button"
                                onClick={() => setFormData({...formData, paymentMethod: 'cash'})}
                                className={`p-6 rounded-[2rem] border-2 text-left transition-all flex items-center gap-4 ${
                                    formData.paymentMethod === 'cash' 
                                    ? 'border-orange-600 bg-orange-50/30 ring-4 ring-orange-600/5' 
                                    : 'border-gray-100 hover:border-gray-200'
                                }`}
                            >
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${formData.paymentMethod === 'cash' ? 'border-orange-600 bg-orange-600' : 'border-gray-300'}`}>
                                    {formData.paymentMethod === 'cash' && <div className="w-2 h-2 bg-white rounded-full" />}
                                </div>
                                <span className="font-bold text-gray-800">Cash on Delivery</span>
                            </button>
                             <button
                                type="button"
                                onClick={() => toast.error('Online Payment currently unavailable. Please use Cash.')}
                                className="p-6 rounded-[2rem] border-2 border-gray-100 text-left transition-all flex items-center gap-4 opacity-50 cursor-not-allowed"
                            >
                                <div className="w-6 h-6 rounded-full border-2 border-gray-300" />
                                <span className="font-bold text-gray-800">Online Payment</span>
                            </button>
                        </div>
                    </div>

                    <div className="pt-8 block md:hidden">
                        <button
                            type="submit"
                            disabled={loading || !orderOpen}
                            className={`w-full py-5 rounded-[2.5rem] font-bold text-xl flex items-center justify-center transition-all ${
                                loading || !orderOpen
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                                : 'bg-orange-600 text-white hover:bg-orange-700 shadow-xl shadow-orange-100'
                            }`}
                        >
                            {!orderOpen ? 'Ordering Closed' : loading ? 'Processing...' : `Place Order - ₹${(getTotal() * 1.08).toFixed(2)}`}
                        </button>
                    </div>
                </form>
             </motion.div>
          </div>

          {/* Side Summary */}
           <div className="lg:w-1/3">
            <div className="bg-white p-10 rounded-[3rem] shadow-xl shadow-gray-200/50 border border-gray-100 sticky top-28">
              <h2 className="text-2xl font-bold mb-8">Summary</h2>
              <div className="max-h-60 overflow-y-auto mb-8 pr-2 custom-scrollbar">
                 {items.map(item => (
                    <div key={item.id} className="flex justify-between items-center mb-4">
                       <span className="text-gray-600"><span className="font-bold text-gray-900">{item.quantity}x</span> {item.name}</span>
                       <span className="font-bold text-gray-900">₹{(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                 ))}
              </div>
              <hr className="mb-6 border-gray-100" />
              <div className="space-y-4 mb-8">
                <div className="flex justify-between text-gray-500 font-medium">
                  <span>Subtotal</span>
                  <span>₹{getTotal().toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-500 font-medium">
                  <span>Delivery</span>
                  <span className="text-green-600">FREE</span>
                </div>
                <div className="flex justify-between text-gray-500 font-medium">
                  <span>Tax (8%)</span>
                  <span>₹{(getTotal() * 0.08).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-2xl font-bold text-gray-900 pt-4">
                  <span>Total</span>
                  <span>₹{(getTotal() * 1.08).toFixed(2)}</span>
                </div>
              </div>

              <button
                type="submit"
                onClick={handleSubmit}
                disabled={loading || !orderOpen}
                className={`hidden md:flex w-full bg-orange-600 text-white py-5 rounded-[2.5rem] font-bold text-xl items-center justify-center transition-all ${
                  loading || !orderOpen
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                  : 'bg-orange-600 text-white hover:bg-orange-700 shadow-xl shadow-orange-100'
                }`}
              >
                 {!orderOpen ? 'Ordering Closed' : loading ? 'Processing...' : `Place My Order`}
              </button>

              <p className="mt-6 text-center text-xs text-gray-400">
                By clicking "Place My Order", you agree to our Terms of Service & Privacy Policy.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;

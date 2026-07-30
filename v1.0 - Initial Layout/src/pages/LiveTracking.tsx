import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { doc, onSnapshot, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { Order, DeliveryStatusLog } from '../types';
import { 
  ChevronLeft, MapPin, Phone, Clock, ShieldCheck, 
  CheckCircle, ArrowRight, Navigation, Loader2, Play,
  Star as StarIcon, X as XIcon, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import DeliveryMap from '../components/DeliveryMap';
import { useAuth } from '../context/AuthContext';
import { submitFeedback } from '../services/feedbackService';
import { motion, AnimatePresence } from 'motion/react';
import { getDistanceKm } from '../utils/coordinateUtils';

export default function LiveTracking() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [logs, setLogs] = useState<DeliveryStatusLog[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { user } = useAuth();
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [hasShownRating, setHasShownRating] = useState(false);
  const [ratingVal, setRatingVal] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [hasShownNearDoorstep, setHasShownNearDoorstep] = useState(false);
  
  const navigate = useNavigate();

  // Subscribe to the order document real-time
  useEffect(() => {
    if (!orderId) return;

    const unsubscribe = onSnapshot(doc(db, 'orders', orderId), (docSnap) => {
      if (docSnap.exists()) {
        const orderData = { id: docSnap.id, ...docSnap.data() } as Order;
        setOrder(orderData);
        setLoading(false);
      } else {
        toast.error('Could not retrieve tracking details for this order reference');
        navigate('/orders');
      }
    }, (err) => {
      console.error("Error listening to customer order live tracker:", err);
      setLoading(false);
    });

    // Subscribe to related status logs in real-time
    const qLogs = query(collection(db, 'delivery_status_logs'), where('orderId', '==', orderId));
    const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
      const logsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as DeliveryStatusLog);
      setLogs(logsList.sort((a, b) => (a.updatedAt?.toMillis() || 0) - (b.updatedAt?.toMillis() || 0)));
    }, (err) => {
      console.error("Error reading order status history logs:", err);
    });

    return () => {
      unsubscribe();
      unsubscribeLogs();
    };
  }, [orderId, navigate]);

  useEffect(() => {
    if (order && order.status === 'On The Way' && order.partnerLatitude && order.partnerLongitude && order.latitude && order.longitude) {
      const distance = getDistanceKm(order.latitude, order.longitude, order.partnerLatitude, order.partnerLongitude);
      // 0.3 km is 300 meters, which is very close/near doorstep!
      if (distance < 0.3) {
        if (!hasShownNearDoorstep) {
          toast.success("Driver is near your doorstep! 🚀", {
            duration: 8000,
            style: {
              background: '#ea580c',
              color: '#fff',
              fontWeight: 'bold'
            }
          });
          setHasShownNearDoorstep(true);
        }
      } else if (distance >= 0.4) {
        // Reset state if they re-route / move away
        setHasShownNearDoorstep(false);
      }
    }
  }, [order?.partnerLatitude, order?.partnerLongitude, order?.status, order?.latitude, order?.longitude, hasShownNearDoorstep]);

  useEffect(() => {
    if (order && order.status === 'delivered' && !ratingSubmitted && !hasShownRating) {
      if (order.ratedByCustomer) {
        // Already rated earlier, redirect immediately to prevent loop
        navigate('/orders');
      } else {
        setShowRatingModal(true);
        setHasShownRating(true);
      }
    }
  }, [order?.status, order?.ratedByCustomer, ratingSubmitted, hasShownRating, navigate]);

  // Redirect to orders history once rating has been completed
  useEffect(() => {
    if (order && order.status === 'delivered' && (ratingSubmitted || order.ratedByCustomer)) {
      const timer = setTimeout(() => {
        navigate('/orders');
      }, 1500); // 1.5s delay so they can read the toast message
      return () => clearTimeout(timer);
    }
  }, [order?.status, order?.ratedByCustomer, ratingSubmitted, navigate]);

  if (loading) {
    return <div className="pt-32 text-center text-gray-500">Connecting Satellite Tracking Link...</div>;
  }

  if (!order) {
    return <div className="pt-32 text-center text-gray-500">Order tracking reference not found.</div>;
  }

  // Calculate ETA dynamically based on status matching
  const getETAExplanation = () => {
    switch (order.status) {
      case 'pending':
      case 'Order Received':
        return '25 - 35 mins';
      case 'confirmed':
      case 'Accepted':
        return '20 - 30 mins';
      case 'preparing':
        return '15 - 25 mins';
      case 'Ready For Delivery':
        return '10 - 15 mins';
      case 'Assigned To Delivery Partner':
      case 'Picked Up':
      case 'On The Way':
        return '5 - 10 mins';
      case 'delivered':
        return 'Successfully Delivered! ðŸŽ‰';
      case 'cancelled':
        return 'Order Cancelled';
      default:
        return 'Calculating...';
    }
  };

  // Tracking Milestones Steps mapping
  const milestones = [
    { label: 'Order Received', status: ['pending', 'Order Received'] },
    { label: 'Accepted', status: ['confirmed', 'Accepted'] },
    { label: 'Preparing', status: ['preparing'] },
    { label: 'Ready For Delivery', status: ['Ready For Delivery'] },
    { label: 'Out For Delivery', status: ['Assigned To Delivery Partner', 'Picked Up', 'On The Way'] },
    { label: 'Delivered', status: ['delivered'] }
  ];

  const getMilestoneIndex = () => {
    for (let i = milestones.length - 1; i >= 0; i--) {
      if (milestones[i].status.includes(order.status)) {
        return i;
      }
    }
    // Fallbacks
    if (order.status === 'delivered') return 5;
    if (['preparing', 'confirmed'].includes(order.status)) return 2;
    return 0;
  };

  const currentStep = getMilestoneIndex();

  return (
    <div className="min-h-screen bg-[#FBFBFA] pt-20 pb-20 font-sans text-left">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Top bar with back-navigate */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/orders" className="p-3 bg-white border border-gray-100 hover:text-orange-600 transition-colors rounded-2xl shadow-sm">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Live Delivery Tracker</h1>
              <p className="text-[10px] text-gray-400 font-mono">Reference: #{order.id.toUpperCase()}</p>
            </div>
          </div>
          <span className="text-xs bg-emerald-100 text-emerald-800 font-black px-4 py-2 rounded-full uppercase flex items-center gap-1.5 shadow-sm">
            <ShieldCheck className="w-4 h-4 fill-current text-emerald-605" /> Safe Tracking
          </span>
        </div>

        {/* Dynamic tracking panel wrapper */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Progress timelines and specs */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Live Doorstep Banner Alert */}
            {order.status === 'On The Way' && order.partnerLatitude && order.partnerLongitude && order.latitude && order.longitude && 
              getDistanceKm(order.latitude, order.longitude, order.partnerLatitude, order.partnerLongitude) < 0.3 && (
                <div className="bg-orange-50 border border-orange-200 p-5 rounded-[2rem] flex items-start gap-4 text-orange-950 animate-pulse shadow-sm text-left">
                  <div className="text-2xl mt-1 shrink-0">🚀</div>
                  <div className="space-y-1">
                    <h4 className="font-extrabold text-sm text-orange-900 leading-none">Driver is near your doorstep!</h4>
                    <p className="text-xs text-orange-700 leading-relaxed font-semibold">
                      Your delivery partner is arriving momentarily. Please stay available to pick up your fresh order.
                    </p>
                  </div>
                </div>
              )
            }

            {/* ETA container widget */}
            <div className="bg-white p-6 rounded-[2rem] border border-gray-150 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-orange-50 text-orange-600 rounded-2xl">
                  <Clock className="w-6 h-6 animate-pulse" />
                </div>
                <div className="text-left">
                  <h4 className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Estimated Arrival</h4>
                  <p className="text-lg font-extrabold text-orange-600 leading-none mt-1">{getETAExplanation()}</p>
                </div>
              </div>
              <span className="text-xs text-gray-400 font-bold bg-[#FAF9F5] border px-3 py-1 rounded-xl uppercase">On Time</span>
            </div>

            {/* Step-by-step progress tracking bars */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm text-left">
              <h3 className="text-base font-bold text-gray-900 mb-6 uppercase tracking-wider">Delivery Milestones Progress</h3>
              
              <div className="relative pl-6 space-y-6 border-l-2 border-gray-100 ml-3">
                {milestones.map((m, idx) => {
                  const isDone = idx <= currentStep;
                  const isActive = idx === currentStep;

                  return (
                    <div key={idx} className="relative">
                      {/* Left Side Status indicator node */}
                      <span className={`absolute -left-[31px] top-0 w-4 h-4 rounded-full border-4 flex items-center justify-center transition-all ${
                        isDone 
                          ? 'bg-orange-600 border-white ring-4 ring-orange-50' 
                          : 'bg-white border-gray-200'
                      }`}>
                        {isActive && <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />}
                      </span>

                      <div className="text-left select-none">
                        <h4 className={`text-sm font-bold leading-none ${isDone ? 'text-gray-900 font-extrabold' : 'text-gray-300'}`}>
                          {m.label}
                        </h4>
                        {isActive && (
                          <span className="inline-block bg-orange-50 text-orange-600 font-black text-[9px] tracking-tight uppercase px-2 py-0.5 rounded mt-1.5 animate-pulse">
                            Active State â— 
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Delivery Partner detail card (if assigned) */}
            {order.deliveryPartnerName ? (
              <div className="bg-white p-6 rounded-[2.5rem] border border-gray-150 shadow-sm text-left flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-50 border border-indigo-150 rounded-2xl flex items-center justify-center text-indigo-750 font-black uppercase shadow-inner">
                    {order.deliveryPartnerName.slice(0, 2)}
                  </div>
                  <div className="text-left">
                    <span className="text-[9px] text-indigo-650 font-black uppercase tracking-wider block">Assigned Logistics Partner</span>
                    <h4 className="text-base font-black text-gray-900 leading-tight mt-0.5">{order.deliveryPartnerName}</h4>
                    <p className="text-[11px] text-gray-500 font-bold uppercase tracking-tight">Active Delivery Messenger</p>
                  </div>
                </div>

                <a 
                  href={`tel:${order.deliveryPartnerPhone}`}
                  className="p-3 bg-gray-900 hover:bg-orange-600 text-white rounded-xl transition-all shadow-md group border cursor-pointer"
                  title="Contact driver"
                >
                  <Phone className="w-5 h-5 group-hover:scale-110 transition-transform" />
                </a>
              </div>
            ) : (
              <div className="bg-indigo-50/50 p-6 rounded-[2.5rem] border border-indigo-100 text-left space-y-2">
                <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                <h4 className="text-xs font-bold text-indigo-900 leading-none">Connecting Delivery Associate</h4>
                <p className="text-[10px] text-indigo-700 font-sans leading-relaxed">Once the kitchen completes hot-meal preparation, our system automatically assigns the closest active delivery vehicle. Live partner mobile coordinates will enable here instantly.</p>
              </div>
            )}
          </div>

          {/* Satellite live routing coordinates maps display */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm flex-grow flex flex-col">
              <h3 className="text-left text-sm font-bold text-gray-800 mb-4 uppercase tracking-wider flex items-center gap-1.5 leading-none">
                <Navigation className="w-4 h-4 text-orange-600 fill-current" /> Live Transit Map Telementry
              </h3>
              
              <div className="flex-grow rounded-[2rem] overflow-hidden border">
                <DeliveryMap
                  mode="track"
                  latitude={order.latitude}
                  longitude={order.longitude}
                  partnerLatitude={order.partnerLatitude}
                  partnerLongitude={order.partnerLongitude}
                  height="450px"
                />
              </div>

              {/* Destination/landmark reference overview footer */}
              <div className="flex gap-4 p-4 mt-4 bg-[#FAF9F5] rounded-3xl text-xs leading-relaxed text-gray-600">
                <MapPin className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                <div className="text-left">
                  <span className="text-[9px] uppercase font-black text-gray-400 tracking-wider">Delivery Destination address</span>
                  <div className="font-bold text-gray-900 mt-0.5">{order.address}</div>
                  {order.landmark && (
                    <div className="text-[11px] font-sans text-gray-500 mt-1">Landmark reference: <span className="text-gray-900 font-semibold">{order.landmark}</span></div>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Rating / Review Modal on Handover */}
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
                <span className="text-[10px] text-orange-655 font-black uppercase tracking-widest bg-orange-50 text-orange-600 px-3 py-1 rounded-full">
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
                  <XIcon className="w-5 h-5" />
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
                    <StarIcon
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
              <div className="space-y-1 bg-gray-55 p-4 rounded-2xl border border-gray-100 text-left">
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
                  className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-150 text-gray-850 text-xs font-black rounded-2xl transition-all uppercase tracking-wider cursor-pointer text-center select-none"
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
                  className="flex-1 py-3.5 bg-orange-600 hover:hover:bg-orange-700 text-white text-xs font-black rounded-2xl transition-all uppercase tracking-wider cursor-pointer text-center select-none shadow-md shadow-orange-100 disabled:opacity-50 inline-flex items-center justify-center gap-2"
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

import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc } from 'firebase/firestore';
import { Order, Reservation } from '../types';
import { ShoppingBag, Calendar, Clock, ChevronRight, CheckCircle2, XCircle, AlertCircle, Info, MapPin, Users, Ticket, Trash2, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatTo12Hour, parseTime } from '../utils/timeUtils';
import { useLocation, Link } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext';
import { subscribeToSettings, getCurrentSystemTime, AppSettings } from '../services/settingsService';
import toast from 'react-hot-toast';
import { submitFeedback } from '../services/feedbackService';
import { Star, Navigation } from 'lucide-react';
import { useVirtualTime } from '../hooks/useVirtualTime';
import { ChefLoader } from '../components/ChefLoader';

const OrderHistory = () => {
  const { user } = useAuth();
  const { activeUserOrdersCount, activeUserReservationsCount, userReservationBadgeColor } = useNotifications();
  const location = useLocation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'orders' | 'reservations'>((location.state as any)?.tab || 'orders');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [selectedRes, setSelectedRes] = useState<Reservation | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [currentReviewItem, setCurrentReviewItem] = useState<{orderId?: string, resId?: string} | null>(null);

  const virtualNow = useVirtualTime();
  const [selectedOrderToCancel, setSelectedOrderToCancel] = useState<Order | null>(null);
  const [showOrderCancelConfirm, setShowOrderCancelConfirm] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState(false);

  const handleCancelOrder = async (orderId: string) => {
    setCancellingOrder(true);
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, { status: 'cancelled' });
      toast.success('Your food order has been successfully cancelled.');
      setShowOrderCancelConfirm(false);
      setSelectedOrderToCancel(null);
    } catch (error) {
      toast.error('Could not cancel order. Please try again or contact support.');
      console.error(error);
    } finally {
      setCancellingOrder(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!user || !currentReviewItem) return;
    setSubmittingReview(true);
    try {
      await submitFeedback({
        userId: user.uid,
        orderId: currentReviewItem.orderId,
        reservationId: currentReviewItem.resId,
        rating: reviewRating,
        comment: reviewComment
      });
      toast.success('Thank you for your feedback!');
      setShowReviewModal(false);
      setReviewComment('');
      setReviewRating(5);
    } catch (error) {
      toast.error('Failed to submit feedback');
    } finally {
      setSubmittingReview(false);
    }
  };

  useEffect(() => {
    const unsub = subscribeToSettings(setSettings);
    return () => unsub();
  }, []);

  useEffect(() => {
    if ((location.state as any)?.tab) {
      setActiveTab((location.state as any).tab);
    }
  }, [location.state]);

  useEffect(() => {
    if (selectedRes) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedRes]);

  useEffect(() => {
    if (activeTab === 'reservations' && reservations.length > 0) {
      const unseenConfirmed = reservations.filter(res => res.status === 'confirmed' && !res.seenByGuest);
      unseenConfirmed.forEach(async (res) => {
        try {
          await updateDoc(doc(db, 'reservations', res.id), { seenByGuest: true });
        } catch (error) {
          console.error('Error marking reservation as seen:', error);
        }
      });
    }
  }, [activeTab, reservations]);

  useEffect(() => {
    if (!user) return;

    const ordersQuery = query(
      collection(db, 'orders'),
      where('userId', '==', user.uid)
    );
    const resevQuery = query(
      collection(db, 'reservations'),
      where('userId', '==', user.uid)
    );

    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Order[];
      setOrders(ordersData.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)));
      setLoading(false);
    });

    const unsubscribeReservations = onSnapshot(resevQuery, (snapshot) => {
      const resevData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Reservation[];
      setReservations(resevData.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)));
    });

    return () => {
      unsubscribeOrders();
      unsubscribeReservations();
    };
  }, [user]);

  const getTimeLeft = (res: Reservation) => {
    if (!settings) return null;
    const now = getCurrentSystemTime(settings);
    const [year, month, day] = res.date.split('-').map(Number);
    const resDate = new Date(year, month - 1, day);
    const resTime = parseTime(res.time, resDate);
    
    const diffMs = resTime.getTime() - now.getTime();
    if (diffMs < 0) return 'Passed/Started';
    
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    
    if (hours > 0) return `${hours}h ${mins}m left`;
    return `${mins}m left`;
  };

  const handleCancelReservation = async (id: string) => {
    try {
      const resRef = doc(db, 'reservations', id);
      await updateDoc(resRef, { status: 'cancelled' });
      toast.success('Reservation cancelled successfully');
      setSelectedRes(null);
      setShowCancelConfirm(false);
    } catch (error) {
      toast.error('Failed to cancel reservation');
      console.error(error);
    }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const styles = {
      pending: 'bg-yellow-50 text-yellow-600 border-yellow-100',
      confirmed: 'bg-purple-50 text-purple-600 border-purple-100',
      preparing: 'bg-orange-50 text-orange-600 border-orange-100',
      delivered: 'bg-green-50 text-green-600 border-green-100',
      cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
      rejected: 'bg-red-50 text-red-600 border-red-100',
      seated: 'bg-blue-50 text-blue-600 border-blue-100',
      completed: 'bg-gray-100 text-gray-500 border-gray-200',
    };
    const icon = {
      pending: <Clock className="w-3.5 h-3.5 mr-1" />,
      confirmed: <CheckCircle2 className="w-3.5 h-3.5 mr-1" />,
      preparing: <Clock className="w-3.5 h-3.5 mr-1" />,
      delivered: <CheckCircle2 className="w-3.5 h-3.5 mr-1" />,
      cancelled: <XCircle className="w-3.5 h-3.5 mr-1" />,
      rejected: <XCircle className="w-3.5 h-3.5 mr-1" />,
      seated: <Users className="w-3.5 h-3.5 mr-1" />,
      completed: <CheckCircle2 className="w-3.5 h-3.5 mr-1" />,
    };

    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter border ${styles[status as keyof typeof styles] || styles.pending}`}>
        {icon[status as keyof typeof icon] || icon.pending}
        <span className="capitalize">{status}</span>
      </span>
    );
  };

  if (loading) {
    return <ChefLoader message="Fetching your order history..." />;
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">My History</h1>

        <div className="flex space-x-2 mb-8 bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100">
           <button
             onClick={() => setActiveTab('orders')}
             className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all relative ${
               activeTab === 'orders' ? 'bg-orange-600 text-white shadow-lg shadow-orange-100' : 'text-gray-500 hover:bg-gray-50'
             }`}
           >
              <ShoppingBag className="w-5 h-5" /> 
              <span>Orders</span>
              {activeUserOrdersCount > 0 && activeTab !== 'orders' && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-600 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-lg">
                  {activeUserOrdersCount}
                </span>
              )}
           </button>
           <button
             onClick={() => setActiveTab('reservations')}
             className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all relative ${
               activeTab === 'reservations' ? 'bg-orange-600 text-white shadow-lg shadow-orange-100' : 'text-gray-500 hover:bg-gray-50'
             }`}
           >
              <Calendar className="w-5 h-5" /> 
              <span>Bookings</span>
              {activeUserReservationsCount > 0 && activeTab !== 'reservations' && (
                <span className={`absolute -top-1 -right-1 w-5 h-5 ${
                  userReservationBadgeColor === 'red' ? 'bg-red-600' : 
                  userReservationBadgeColor === 'green' ? 'bg-green-600' : 'bg-orange-600'
                } text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-lg`}>
                  {activeUserReservationsCount}
                </span>
              )}
           </button>
        </div>

        <div className="space-y-6">
          <AnimatePresence mode="popLayout">
          {activeTab === 'orders' ? (
            orders.length > 0 ? (
              orders.map(order => {
                const orderTime = order.createdAt?.toMillis ? order.createdAt.toMillis() : (order.createdAt?.seconds ? order.createdAt.seconds * 1000 : 0);
                const elapsedMs = virtualNow.getTime() - orderTime;
                const cancelTimeLimitMs = 3 * 60 * 1000;
                const isWithinCancelWindow = orderTime > 0 && elapsedMs >= 0 && elapsedMs < cancelTimeLimitMs;
                const timeLeftSeconds = Math.max(0, Math.ceil((cancelTimeLimitMs - elapsedMs) / 1000));
                const isCancellableStatus = !['delivered', 'cancelled', 'On The Way', 'Picked Up'].includes(order.status);

                return (
                  <motion.div 
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      key={order.id} 
                      className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-gray-100 hover:shadow-md transition-shadow relative overflow-hidden"
                  >
                   {['pending', 'confirmed', 'preparing'].includes(order.status) && (
                     <div className="absolute top-0 left-0 w-1.5 h-full bg-orange-500" />
                   )}
                   <div className="flex flex-wrap justify-between items-start mb-6 gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                         <span className="font-mono text-xs text-gray-400">#{order.id?.slice(-6).toUpperCase() || 'N/A'}</span>
                         <StatusBadge status={order.status} />
                         {['pending', 'confirmed', 'preparing'].includes(order.status) && (
                           <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-[10px] font-black uppercase rounded-md animate-pulse">Active</span>
                         )}
                      </div>
                      <p className="text-sm text-gray-500">{order.createdAt?.toDate().toLocaleDateString([], { dateStyle: 'long' })}</p>
                    </div>
                    <div className="text-right">
                       <p className="text-2xl font-bold text-gray-900">₹{order.total.toFixed(2)}</p>
                       <p className="text-xs text-gray-400">{order.items.length} items</p>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 rounded-2xl p-4 mb-4">
                     {order.items.map(item => (
                       <div key={item.id} className="flex justify-between text-sm py-1">
                          <span className="text-gray-600 font-medium">{item.quantity}x {item.name}</span>
                          <span className="text-gray-400">₹{(item.price * item.quantity).toFixed(2)}</span>
                       </div>
                     ))}
                  </div>

                  <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-gray-50">
                     <div className="flex items-center text-xs text-gray-405 justify-between flex-wrap gap-2">
                        <div className="flex items-center text-left">
                           <AlertCircle className="w-4 h-4 mr-1 text-orange-400 shrink-0" />
                           <span>Type: <strong className="text-gray-700 uppercase font-bold">{order.orderType || 'delivery'}</strong> â€¢ Address: {order.address}</span>
                        </div>
                        {order.status === 'delivered' && (
                           <button 
                             onClick={() => {
                               setCurrentReviewItem({ orderId: order.id });
                               setShowReviewModal(true);
                             }}
                             className="bg-orange-50 text-orange-600 px-4 py-2 rounded-xl font-bold hover:bg-orange-100 transition-all flex items-center gap-2 cursor-pointer"
                           >
                             <Star className="w-3.5 h-3.5 fill-current" /> Rate
                           </button>
                        )}
                     </div>

                     {/* Live Tracking Link Trigger (only if delivery and not delivered or cancelled) */}
                     {(order.orderType === 'delivery' || !order.orderType) && !['delivered', 'cancelled'].includes(order.status) && (
                        <div className="flex justify-end pt-2">
                           <Link 
                              to={`/orders/${order.id}/track`}
                              className="inline-flex items-center gap-2 px-5 py-3 bg-orange-600 hover:bg-orange-700 text-white font-extrabold rounded-2xl text-xs transition-all shadow-md shadow-orange-105 uppercase cursor-pointer"
                           >
                              <Navigation className="w-4 h-4 fill-current rotate-45" /> Track Live Delivery
                           </Link>
                        </div>
                     )}

                     {/* Cancellation countdown and button */}
                     {isCancellableStatus && isWithinCancelWindow && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-red-100 bg-red-100/10 p-4 rounded-2xl border border-dashed border-red-200">
                           <div className="flex items-center gap-2 text-xs text-gray-655 font-bold">
                              <Clock className="w-4 h-4 text-red-500 animate-pulse" />
                              <span>
                                 Cancellation Window Active:{' '}
                                 <strong className="text-red-500 font-mono text-sm bg-red-100/55 px-2 py-0.5 rounded-md text-nowrap">
                                    {Math.floor(timeLeftSeconds / 60)}:{String(timeLeftSeconds % 60).padStart(2, '0')}
                                 </strong>
                              </span>
                           </div>
                           <button
                              onClick={() => {
                                 setSelectedOrderToCancel(order);
                                 setShowOrderCancelConfirm(true);
                              }}
                              className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-red-200 shrink-0"
                           >
                              <XCircle className="w-4 h-4" /> Cancel Order
                           </button>
                        </div>
                     )}
                  </div>
                </motion.div>
             );
           })
            ) : (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-20 bg-white rounded-[3rem] border-2 border-dashed border-gray-200"
                >
                    <ShoppingBag className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                    <p className="text-gray-400 font-bold">No orders found.</p>
                </motion.div>
            )
          ) : (
            reservations.length > 0 ? (
              reservations.map(res => (
                <motion.div 
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={res.id} 
                    className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col md:flex-row items-center gap-6 relative overflow-hidden"
                >
                   {['pending', 'confirmed'].includes(res.status) && (
                     <div className="absolute top-0 left-0 md:top-0 md:left-0 md:w-1.5 md:h-full w-full h-1.5 bg-orange-500" />
                   )}
                   <div className="w-16 h-16 bg-orange-50 rounded-2xl flex flex-col items-center justify-center text-orange-600 shrink-0 mt-4 md:mt-0">
                      <span className="text-[10px] font-black uppercase tracking-widest">{new Date(res.date).toLocaleDateString([], { month: 'short' })}</span>
                      <span className="text-3xl font-black leading-none">{res.date.split('-')[2]}</span>
                   </div>
                   <div className="flex-grow text-center md:text-left">
                      <div className="flex flex-col md:flex-row justify-between items-center md:items-start mb-2 gap-2">
                        <div className="flex items-center gap-3">
                           <h3 className="text-xl font-black text-gray-900 tracking-tight">Table for {res.guests}</h3>
                           {['pending', 'confirmed'].includes(res.status) && (
                             <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-[9px] font-black uppercase rounded-md animate-pulse">Upcoming</span>
                           )}
                        </div>
                        <StatusBadge status={res.status} />
                      </div>
                      <div className="flex flex-wrap items-center justify-center md:justify-start text-gray-500 text-xs font-medium gap-x-4 gap-y-1">
                         <span className="flex items-center"><Calendar className="w-3.5 h-3.5 mr-1.5 text-gray-400" /> {new Date(res.date).toLocaleDateString([], { dateStyle: 'medium' })}</span>
                         <span className="flex items-center"><Clock className="w-3.5 h-3.5 mr-1.5 text-gray-400" /> {res.time.includes('M') ? res.time : formatTo12Hour(res.time)}</span>
                         {['confirmed', 'seated'].includes(res.status) && res.assignedTables && (
                           <span className="flex items-center text-orange-600 font-bold"><MapPin className="w-3.5 h-3.5 mr-1.5" /> Table {res.assignedTables.join(', ')}</span>
                         )}
                      </div>
                   </div>
                   <button 
                      onClick={() => setSelectedRes(res)}
                      className="w-full md:w-auto px-6 py-3 rounded-2xl bg-gray-900 text-white text-xs font-bold hover:bg-orange-600 transition-all flex items-center justify-center gap-2"
                   >
                      View Details <ChevronRight className="w-4 h-4" />
                   </button>
                </motion.div>
              ))
            ) : (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-20 bg-white rounded-[3rem] border-2 border-dashed border-gray-200"
                >
                    <Calendar className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                    <p className="text-gray-400 font-bold">No bookings found.</p>
                </motion.div>
            )
          )}
          </AnimatePresence>
        </div>
      </div>

      {/* Reservation Details Modal */}
      <AnimatePresence>
        {selectedRes && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
              onClick={() => setSelectedRes(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg max-h-[90vh] bg-white rounded-[2.5rem] md:rounded-[3rem] shadow-2xl overflow-hidden border border-gray-100 flex flex-col"
            >
              <div className="overflow-y-auto p-6 md:p-10 custom-scrollbar">
                <div className="flex justify-between items-start mb-8">
                   <div>
                      <button 
                        onClick={() => setSelectedRes(null)}
                        className="flex items-center gap-2 text-gray-400 hover:text-gray-900 font-bold text-xs mb-4 transition-colors"
                      >
                         <ArrowLeft className="w-4 h-4" /> Back to List
                      </button>
                      <h2 className="text-3xl font-black text-gray-900 tracking-tight">Booking Details</h2>
                   </div>
                   <StatusBadge status={selectedRes.status} />
                </div>

                <div className="space-y-6">
                   {/* Countdown / Time Info */}
                   {['pending', 'confirmed'].includes(selectedRes.status) && (
                     <div className="bg-orange-50 p-6 rounded-[2rem] border border-orange-100 flex items-center justify-between">
                        <div>
                           <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1">Status Timeline</p>
                           <p className="text-xl font-black text-orange-900">{getTimeLeft(selectedRes)}</p>
                        </div>
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-orange-600 shadow-sm">
                           <Clock className="w-6 h-6" />
                        </div>
                     </div>
                   )}

                   <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gray-50 p-5 rounded-3xl border border-gray-100">
                         <Calendar className="w-5 h-5 text-gray-400 mb-2" />
                         <p className="text-[10px] font-bold text-gray-400 uppercase">Reserved Date</p>
                         <p className="font-black text-gray-900">{new Date(selectedRes.date).toLocaleDateString([], { dateStyle: 'long' })}</p>
                      </div>
                      <div className="bg-gray-50 p-5 rounded-3xl border border-gray-100">
                         <Clock className="w-5 h-5 text-gray-400 mb-2" />
                         <p className="text-[10px] font-bold text-gray-400 uppercase">Reserved Time</p>
                         <p className="font-black text-gray-900">{selectedRes.time.includes('M') ? selectedRes.time : formatTo12Hour(selectedRes.time)}</p>
                      </div>
                   </div>

                   <div className="bg-gray-50 p-6 rounded-[2rem] border border-gray-100 flex items-center gap-6">
                      <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-gray-900 shadow-sm shrink-0">
                         <Users className="w-7 h-7" />
                      </div>
                      <div>
                         <p className="text-[10px] font-bold text-gray-400 uppercase">Party Size</p>
                         <p className="text-2xl font-black text-gray-900">{selectedRes.guests} Guests</p>
                      </div>
                   </div>

                   {selectedRes.assignedTables && selectedRes.assignedTables.length > 0 && (
                     <div className="bg-blue-50 p-6 rounded-[2rem] border border-blue-100 flex items-center gap-6">
                        <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm shrink-0">
                           <MapPin className="w-7 h-7" />
                        </div>
                        <div>
                           <p className="text-[10px] font-bold text-blue-400 uppercase">Assigned Tables</p>
                           <p className="text-2xl font-black text-blue-900">{selectedRes.assignedTables.join(', ')}</p>
                        </div>
                     </div>
                   )}

                   <div className="flex flex-col gap-3 mt-4">
                      {selectedRes.status === 'completed' && (
                        <button 
                          onClick={() => {
                            setCurrentReviewItem({ resId: selectedRes.id });
                            setShowReviewModal(true);
                            setSelectedRes(null);
                          }}
                          className="w-full py-4 rounded-2xl bg-orange-600 text-white font-bold hover:bg-orange-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-100"
                        >
                          <Star className="w-4 h-4 fill-current" /> Rate Your Experience
                        </button>
                      )}

                      {['pending', 'confirmed'].includes(selectedRes.status) && (
                        <div className="mt-4">
                           {!showCancelConfirm ? (
                             <button 
                                onClick={() => setShowCancelConfirm(true)}
                                className="w-full py-4 rounded-2xl bg-red-50 text-red-600 font-bold hover:bg-red-100 transition-all flex items-center justify-center gap-2"
                             >
                                <Trash2 className="w-4 h-4" /> Cancel Reservation
                             </button>
                           ) : (
                             <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                                <p className="text-sm font-bold text-red-900 mb-3 text-center">Are you sure you want to cancel?</p>
                                <div className="flex gap-2">
                                   <button 
                                      onClick={() => setShowCancelConfirm(false)}
                                      className="flex-1 py-3 bg-white text-gray-600 rounded-xl font-bold border border-gray-200 hover:bg-gray-50 transition-all"
                                   >
                                      No, Keep it
                                   </button>
                                   <button 
                                      onClick={() => handleCancelReservation(selectedRes.id)}
                                      className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all"
                                   >
                                      Yes, Cancel
                                   </button>
                                </div>
                             </div>
                           )}
                        </div>
                      )}
                   </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Review Modal */}
      <AnimatePresence>
        {showReviewModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
              onClick={() => !submittingReview && setShowReviewModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] p-8 md:p-10 shadow-2xl overflow-hidden"
            >
               <h2 className="text-3xl font-black text-gray-900 tracking-tight mb-2">Rate Experience</h2>
               <p className="text-gray-500 mb-8">How was your meal at Spice Garden?</p>

               <div className="flex justify-center gap-2 mb-8">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setReviewRating(star)}
                      className={`p-2 transition-all transform hover:scale-110 ${reviewRating >= star ? 'text-orange-500' : 'text-gray-200'}`}
                    >
                       <Star className={`w-10 h-10 ${reviewRating >= star ? 'fill-current' : ''}`} />
                    </button>
                  ))}
               </div>

               <textarea
                 value={reviewComment}
                 onChange={(e) => setReviewComment(e.target.value)}
                 placeholder="Tell us what you liked (or what we could improve)..."
                 className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-medium mb-8 min-h-[120px] text-sm"
               />

               <div className="flex gap-4">
                  <button
                    disabled={submittingReview}
                    onClick={() => setShowReviewModal(false)}
                    className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={submittingReview}
                    onClick={handleSubmitReview}
                    className="flex-1 py-4 bg-orange-600 text-white rounded-2xl font-bold hover:bg-orange-700 transition-all shadow-lg shadow-orange-100 disabled:opacity-50"
                  >
                    {submittingReview ? 'Submitting...' : 'Submit Feedback'}
                  </button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Order Cancellation Confirmation Modal */}
      <AnimatePresence>
        {showOrderCancelConfirm && selectedOrderToCancel && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
              onClick={() => !cancellingOrder && setShowOrderCancelConfirm(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] p-8 md:p-10 shadow-2xl overflow-hidden border border-gray-100"
            >
               <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-red-650 mb-6 mx-auto">
                  <AlertCircle className="w-8 h-8 text-red-600" />
               </div>
               
               <h2 className="text-2xl font-black text-gray-900 tracking-tight mb-2 text-center">Cancel Your Order?</h2>
               <p className="text-gray-550 mb-6 text-center text-sm leading-relaxed">
                 Are you sure you want to cancel food order <strong className="font-mono text-gray-950">#{selectedOrderToCancel.id?.slice(-6).toUpperCase()}</strong>? 
                 Within the 3-minute grace period, cancellations are fully automated. Your food will not be prepared and a refund will be processed immediately.
               </p>

               <div className="flex gap-4">
                  <button
                    disabled={cancellingOrder}
                    onClick={() => setShowOrderCancelConfirm(false)}
                    className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all cursor-pointer"
                  >
                    Keep Order
                  </button>
                  <button
                    disabled={cancellingOrder}
                    onClick={() => handleCancelOrder(selectedOrderToCancel.id)}
                    className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {cancellingOrder ? 'Cancelling...' : 'Cancel Order'}
                  </button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OrderHistory;

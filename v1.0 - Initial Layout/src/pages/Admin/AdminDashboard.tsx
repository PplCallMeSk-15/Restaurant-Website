import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { db } from '../../firebase/config';
import { 
  collection, 
  updateDoc, 
  doc, 
  query, 
  orderBy, 
  limit, 
  onSnapshot,
  getDocs,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { Order, Reservation, MenuItem, Feedback, Table } from '../../types';
import { 
  BarChart3, Users, Utensils, ShoppingBag, 
  Settings, Bell, Search, Filter,
  Clock, CheckCircle2, TrendingUp,
  RefreshCcw, AlertTriangle, X, Download,
  Star, MessageSquare, Mail
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { resetDatabase } from '../../services/adminService';
import { exportDatabaseToJson } from '../../services/exportService';
import { subscribeToSatisfactionRate } from '../../services/feedbackService';
import { getAppSettings, AppSettings } from '../../services/settingsService';
import { useVirtualTime } from '../../hooks/useVirtualTime';
import { useBookingSync } from '../../hooks/useBookingSync';

import { useNotifications } from '../../context/NotificationContext';

const AdminDashboard = () => {
  const { isAdmin, loading: authLoading } = useAuth();
  const { pendingOrdersCount, pendingReservationsCount } = useNotifications();
  const totalAdminNotifications = pendingOrdersCount + pendingReservationsCount;
  const navigate = useNavigate();
  const virtualNow = useVirtualTime();
  useBookingSync();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [stats, setStats] = useState({
    orders: 0,
    revenue: 0,
    reservations: 0,
    menuItems: 0,
    satisfaction: 0,
    fulfillmentSpeed: 0,
    tableUtilization: 0
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [allFeedback, setAllFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState<{ orderId: string, status: string, currentStatus: string } | null>(null);

  const handleReset = async () => {
    setResetting(true);
    try {
      await resetDatabase();
      toast.success('System reset successfully!');
      window.location.reload();
    } catch (error) {
      toast.error('Failed to reset system');
      setResetting(false);
      setShowResetConfirm(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate('/');
    }
  }, [isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (!isAdmin) return;

    // Backfill any missing emails into registered_emails silently
    const backfillRegisteredEmails = async () => {
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        for (const userDoc of usersSnap.docs) {
          const uData = userDoc.data();
          if (uData.email) {
            const emailClean = uData.email.toLowerCase().trim();
            const regRef = doc(db, 'registered_emails', emailClean);
            await setDoc(regRef, {
              exists: true,
              uid: userDoc.id,
              createdAt: uData.createdAt || serverTimestamp()
            }, { merge: true });
          }
        }
      } catch (err) {
        console.warn('Silent registered emails backfill failed:', err);
      }
    };
    backfillRegisteredEmails();

    // Listen to satisfaction rate
    const unsubSatisfaction = subscribeToSatisfactionRate((rate) => {
      setStats(prev => ({ ...prev, satisfaction: rate }));
    });

    // Listen to orders
    const ordersQuery = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Order);
      const revenue = orders.filter(o => o.status === 'delivered').reduce((acc, curr) => acc + (curr.total || 0), 0);
      
      // Calculate Fulfillment Speed:delivered vs total
      const deliveredCount = orders.filter(o => o.status === 'delivered').length;
      const speed = orders.length > 0 ? Math.round((deliveredCount / orders.length) * 100) : 0;

      setStats(prev => ({
        ...prev,
        orders: snapshot.size,
        revenue,
        fulfillmentSpeed: speed
      }));

      // Set recent orders (limit to 5)
      setRecentOrders(orders.slice(0, 5));
      setLoading(false);
    }, (error) => {
      console.error('Error fetching admin orders:', error);
    });

    // Listen to reservations
    const resQuery = query(collection(db, 'reservations'));
    const unsubscribeReservations = onSnapshot(resQuery, (snapshot) => {
      setStats(prev => ({
        ...prev,
        reservations: snapshot.size
      }));
    }, (error) => {
      console.error('Error fetching admin reservations:', error);
    });

    // Listen to physical tables for exact live utilization
    const tablesQuery = query(collection(db, 'tables'));
    const unsubscribeTables = onSnapshot(tablesQuery, (snapshot) => {
      const tables = snapshot.docs.map(doc => doc.data() as Table);
      const occupiedOrBookedCount = tables.filter(t => t.status === 'occupied' || t.status === 'booked').length;
      const utilization = tables.length > 0 ? Math.round((occupiedOrBookedCount / tables.length) * 100) : 0;
      setStats(prev => ({
        ...prev,
        tableUtilization: utilization
      }));
    }, (error) => {
      console.error('Error fetching admin tables for utilization:', error);
    });

    // Listen to menu items
    const menuQuery = query(collection(db, 'menu_items'));
    const unsubscribeMenu = onSnapshot(menuQuery, (snapshot) => {
      setStats(prev => ({
        ...prev,
        menuItems: snapshot.size
      }));
    }, (error) => {
      console.error('Error fetching admin menu items:', error);
    });

    getAppSettings().then(setSettings);

    // Listen to all feedback to link with orders/reservations
    const feedbackQuery = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'));
    const unsubscribeFeedback = onSnapshot(feedbackQuery, (snapshot) => {
      setAllFeedback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Feedback));
    });

    return () => {
      unsubscribeOrders();
      unsubscribeReservations();
      unsubscribeTables();
      unsubscribeMenu();
      unsubSatisfaction();
      unsubscribeFeedback();
    };
  }, [isAdmin]);

  const updateOrderStatus = async (orderId: string, status: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status });
      toast.success(`Order marked as ${status}`);
    } catch (error) {
      toast.error('Failed to update status');
    } finally {
      setStatusConfirm(null);
    }
  };

  const initiateStatusUpdate = (orderId: string, newStatus: string, currentStatus: string) => {
    if (newStatus === 'delivered' || newStatus === 'cancelled') {
      setStatusConfirm({ orderId, status: newStatus, currentStatus });
    } else {
      updateOrderStatus(orderId, newStatus);
    }
  };

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'delivered': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'cancelled': return 'bg-red-50 text-red-600 border-red-100';
      case 'preparing': return 'bg-blue-50 text-blue-600 border-blue-100';
      case 'confirmed': return 'bg-purple-50 text-purple-600 border-purple-100';
      default: return 'bg-gray-50 text-gray-400 border-gray-100';
    }
  };

  if (loading || authLoading) return <div className="pt-32 text-center text-gray-500">Loading Dashboard...</div>;

  return (
    <div className="min-h-screen bg-[#FBFBFA] pt-20 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Admin Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-8">
           <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Internal Dashboard</h1>
              <div className="flex flex-wrap items-center gap-3">
                 <p className="text-gray-500">Welcome back, Admin. Here's what's happening today.</p>
                 {settings?.useManualTime && (
                   <div className="bg-orange-600 text-white px-4 py-1.5 rounded-full flex items-center gap-2 shadow-lg shadow-orange-100 border-2 border-white">
                     <Clock className="w-3.5 h-3.5" />
                     <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                       Virtual: {virtualNow.toLocaleDateString()} {virtualNow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                     </span>
                   </div>
                 )}
              </div>
           </div>
           <div className="flex items-center gap-4">
              <div className="relative">
                <button 
                  onClick={() => setShowNotifications(!showNotifications)}
                  className={`p-3 bg-white border rounded-2xl shadow-sm relative transition-all ${
                    showNotifications ? 'border-orange-600 bg-orange-50' : 'border-gray-100 hover:bg-gray-50'
                  }`}
                >
                    <Bell className={`w-5 h-5 ${showNotifications ? 'text-orange-600' : 'text-gray-400'}`} />
                    {totalAdminNotifications > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-600 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white">
                        {totalAdminNotifications}
                      </span>
                    )}
                </button>

                <AnimatePresence>
                  {showNotifications && (
                    <>
                      <div 
                        className="fixed inset-0 z-[40]" 
                        onClick={() => setShowNotifications(false)} 
                      />
                      <motion.div
                         initial={{ opacity: 0, y: 10, scale: 0.95 }}
                         animate={{ opacity: 1, y: 0, scale: 1 }}
                         exit={{ opacity: 0, y: 10, scale: 0.95 }}
                         className="absolute right-0 mt-3 w-72 bg-white rounded-[2rem] shadow-2xl border border-gray-100 z-[50] overflow-hidden"
                      >
                         <div className="p-5 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                           <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Notifications</h4>
                           {totalAdminNotifications > 0 && (
                             <span className="bg-orange-100 text-orange-600 text-[10px] font-black px-2 py-0.5 rounded-full">
                               {totalAdminNotifications} NEW
                             </span>
                           )}
                         </div>
                         
                         <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
                           {pendingOrdersCount > 0 && (
                             <button 
                               onClick={() => {
                                 navigate('/admin/orders');
                                 setShowNotifications(false);
                               }}
                               className="w-full p-5 flex items-center justify-between hover:bg-orange-50/50 transition-colors text-left group"
                             >
                               <div className="flex items-center gap-4">
                                 <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center text-orange-600 group-hover:scale-110 transition-transform shadow-lg shadow-orange-100">
                                   <ShoppingBag className="w-6 h-6" />
                                 </div>
                                 <div className="space-y-0.5">
                                   <p className="text-sm font-black text-gray-900">Order Management</p>
                                   <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">Requires Attention</p>
                                 </div>
                               </div>
                               <span className="bg-orange-600 text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-lg shadow-orange-100">
                                 {pendingOrdersCount}
                               </span>
                             </button>
                           )}

                           {pendingReservationsCount > 0 && (
                             <button 
                               onClick={() => {
                                 navigate('/admin/reservations');
                                 setShowNotifications(false);
                               }}
                               className="w-full p-5 flex items-center justify-between hover:bg-blue-50/50 transition-colors text-left group"
                             >
                               <div className="flex items-center gap-4">
                                 <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform shadow-lg shadow-blue-100">
                                   <Users className="w-6 h-6" />
                                 </div>
                                 <div className="space-y-0.5">
                                   <p className="text-sm font-black text-gray-900">Booking Log</p>
                                   <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">New Guests Waiting</p>
                                 </div>
                               </div>
                               <span className="bg-blue-600 text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-lg shadow-blue-100">
                                 {pendingReservationsCount}
                               </span>
                             </button>
                           )}

                           {totalAdminNotifications === 0 && (
                             <div className="p-10 text-center space-y-3">
                               <div className="w-16 h-16 bg-gray-50 rounded-3xl flex items-center justify-center mx-auto">
                                 <Bell className="w-8 h-8 text-gray-200" />
                               </div>
                               <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">Inbox Empty</p>
                             </div>
                           )}
                         </div>
                         
                         {totalAdminNotifications > 0 && (
                           <div className="p-3 bg-gray-50 border-t border-gray-100">
                             <button 
                               onClick={() => setShowNotifications(false)}
                               className="w-full py-2.5 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-900 transition-colors"
                             >
                               Dismiss
                             </button>
                           </div>
                         )}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
              <Link to="/admin/menu" className="bg-gray-900 text-white px-6 py-3.5 rounded-2xl font-bold flex items-center shadow-lg hover:bg-orange-600 transition-all text-sm">
                  <Utensils className="w-5 h-5 mr-2" /> Menu
              </Link>
              <Link to="/admin/tables" className="bg-white border border-gray-100 text-gray-900 px-6 py-3.5 rounded-2xl font-bold flex items-center shadow-sm hover:border-orange-600 transition-all text-sm">
                  <BarChart3 className="w-5 h-5 mr-2 text-orange-600" /> Tables
              </Link>
              <Link to="/admin/settings" className="bg-white border border-gray-100 text-gray-900 px-6 py-3.5 rounded-2xl font-bold flex items-center shadow-sm hover:border-orange-600 transition-all text-sm">
                  <Settings className="w-5 h-5 mr-2 text-orange-600" /> Settings
              </Link>
              <button 
                onClick={async () => {
                  toast.promise(exportDatabaseToJson(), {
                    loading: 'Preparing backup...',
                    success: 'Database exported successfully!',
                    error: 'Failed to export database'
                  });
                }}
                className="bg-white border border-gray-100 text-gray-900 px-6 py-3.5 rounded-2xl font-bold flex items-center shadow-sm hover:border-orange-600 transition-all text-sm"
              >
                  <Download className="w-5 h-5 mr-2 text-orange-600" /> Export Data
              </button>
              <button 
                onClick={() => setShowResetConfirm(true)}
                className="p-3.5 bg-red-50 text-red-600 rounded-2xl border border-red-100 hover:bg-red-600 hover:text-white transition-all shadow-sm group"
                title="Reset System Database"
              >
                  <RefreshCcw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
              </button>
           </div>
        </div>

        {/* Status Confirmation Modal */}
        <AnimatePresence>
          {statusConfirm && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white rounded-[2rem] w-full max-w-sm overflow-hidden shadow-2xl"
              >
                <div className={`p-8 flex flex-col items-center text-center ${statusConfirm.status === 'delivered' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                   <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${statusConfirm.status === 'delivered' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                      {statusConfirm.status === 'delivered' ? <CheckCircle2 className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
                   </div>
                   <h3 className="text-xl font-black text-gray-900 tracking-tight">
                     Confirm {statusConfirm.status === 'delivered' ? 'Delivery' : 'Cancellation'}?
                   </h3>
                </div>
                <div className="p-8 space-y-6">
                   <p className="text-gray-500 text-center text-sm leading-relaxed">
                     Are you sure you want to mark this order as <span className={`font-black uppercase ${statusConfirm.status === 'delivered' ? 'text-emerald-600' : 'text-red-600'}`}>{statusConfirm.status}</span>?
                     {statusConfirm.status === 'delivered' && (
                       <span className="block mt-2 font-bold text-gray-900">This action will lock the order and cannot be undone.</span>
                     )}
                   </p>
                   <div className="flex gap-3">
                      <button 
                        onClick={() => setStatusConfirm(null)}
                        className="flex-1 py-3.5 rounded-xl font-bold bg-gray-50 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                         Cancel
                      </button>
                      <button 
                        onClick={() => updateOrderStatus(statusConfirm.orderId, statusConfirm.status)}
                        className={`flex-1 py-3.5 rounded-xl font-bold text-white shadow-lg transition-all active:scale-95 ${
                          statusConfirm.status === 'delivered' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100' : 'bg-red-600 hover:bg-red-700 shadow-red-100'
                        }`}
                      >
                         Confirm
                      </button>
                   </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Reset Confirmation Overlay */}
        <AnimatePresence>
          {showResetConfirm && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-white rounded-[3rem] w-full max-w-md overflow-hidden shadow-2xl"
              >
                <div className="bg-red-50 p-8 flex flex-col items-center text-center">
                   <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
                      <AlertTriangle className="w-10 h-10 text-red-600" />
                   </div>
                   <h2 className="text-3xl font-black text-gray-900 tracking-tight mb-2">Hard Reset?</h2>
                   <p className="text-red-600 text-sm font-bold uppercase tracking-widest px-4">This action is irreversible</p>
                </div>
                
                <div className="p-10 space-y-6">
                   <p className="text-gray-500 text-center leading-relaxed">
                      You are about to erase all <span className="font-bold text-gray-900">Reservations, Orders, Tables,</span> and <span className="font-bold text-gray-900">User accounts.</span> Your admin account will be preserved.
                   </p>
                   
                   <div className="space-y-3">
                      <button 
                        onClick={handleReset}
                        disabled={resetting}
                        className={`w-full py-5 rounded-3xl font-black text-lg flex items-center justify-center transition-all ${
                          resetting ? 'bg-gray-100 text-gray-400 cursor-wait' : 'bg-red-600 text-white hover:bg-red-700 shadow-xl shadow-red-100 active:scale-95'
                        }`}
                      >
                         {resetting ? (
                           <RefreshCcw className="w-6 h-6 animate-spin" />
                         ) : 'Erase All Data'}
                      </button>
                      <button 
                        onClick={() => setShowResetConfirm(false)}
                        disabled={resetting}
                        className="w-full py-4 text-gray-400 font-bold hover:text-gray-900 transition-colors"
                      >
                         Nevermind, keep data
                      </button>
                   </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
           <Link to="/admin/orders" className="block">
             <StatCard 
               icon={<ShoppingBag />} 
               label="Orders" 
               value={stats.orders} 
               color="orange" 
               trend="0%" 
               badge={pendingOrdersCount}
             />
           </Link>
           <div className="block"><StatCard icon={<TrendingUp />} label="Revenue" value={`₹${stats.revenue.toLocaleString()}`} color="green" trend="0%" /></div>
           <Link to="/admin/reservations" className="block">
             <StatCard 
               icon={<Users />} 
               label="Guests" 
               value={stats.reservations} 
               color="blue" 
               trend="0%" 
               badge={pendingReservationsCount}
             />
           </Link>
           <Link to="/admin/tables" className="block"><StatCard icon={<BarChart3 />} label="Tables" value="Manage" color="purple" trend="0%" /></Link>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           {/* Recent Orders */}
           <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
                 <div className="p-8 border-b border-gray-50 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-gray-800">Live Orders</h3>
                    <Link to="/admin/orders" className="text-orange-600 font-bold text-sm hover:underline">View All</Link>
                 </div>
                 <div className="overflow-x-auto">
                    <table className="w-full text-left">
                       <thead className="bg-gray-50/50 text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                          <tr>
                             <th className="px-8 py-4">Order ID</th>
                             <th className="px-8 py-4">Customer</th>
                             <th className="px-8 py-4">Status</th>
                             <th className="px-8 py-4 text-right">Total</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-gray-50">
                          <AnimatePresence mode="popLayout">
                             {recentOrders.map(order => {
                                const feedback = allFeedback.find(f => f.orderId === order.id);
                                return (
                                 <motion.tr 
                                    layout
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    key={order.id} 
                                    className="group hover:bg-gray-50/30 transition-colors"
                                 >
                                    <td className="px-8 py-6 font-mono text-xs text-gray-400">#{order.id?.slice(-6).toUpperCase() || 'N/A'}</td>
                                    <td className="px-8 py-6">
                                       <div className="flex items-center gap-2">
                                          <p className="font-bold text-gray-900 text-sm">{order.customerName}</p>
                                          {order.status === 'pending' && (
                                            <span className="w-2 h-2 bg-orange-600 rounded-full animate-pulse" />
                                          )}
                                       </div>
                                       <div className="flex flex-col gap-1 mt-1">
                                          <p className="text-xs text-gray-400">{order.items.length} items</p>
                                          {feedback && (
                                            <div className="bg-orange-50/50 p-2 rounded-xl mt-1 border border-orange-100/50 max-w-xs">
                                               <div className="flex gap-0.5 mb-1">
                                                  {[1, 2, 3, 4, 5].map((s) => (
                                                     <Star 
                                                        key={s} 
                                                        className={`w-2.5 h-2.5 ${feedback.rating >= s ? 'text-orange-500 fill-current' : 'text-gray-200'}`} 
                                                     />
                                                  ))}
                                               </div>
                                               <p className="text-[10px] text-gray-600 italic leading-tight">"{feedback.comment}"</p>
                                            </div>
                                          )}
                                       </div>
                                    </td>
                                    <td className="px-8 py-6">
                                       <select 
                                          value={order.status}
                                          disabled={['delivered', 'cancelled'].includes(order.status)}
                                          onChange={(e) => initiateStatusUpdate(order.id, e.target.value, order.status)}
                                          className={`text-[10px] font-black px-3 py-1.5 rounded-lg border focus:outline-none transition-all uppercase tracking-tighter ${getStatusStyles(order.status)} ${['delivered', 'cancelled'].includes(order.status) ? 'cursor-not-allowed opacity-100' : 'cursor-pointer hover:shadow-sm'}`}
                                       >
                                          {['pending', 'confirmed', 'preparing', 'delivered', 'cancelled'].map(s => (
                                             <option key={s} value={s} className="font-bold text-gray-900 bg-white">{s.toUpperCase()}</option>
                                          ))}
                                       </select>
                                    </td>
                                    <td className="px-8 py-6 text-right font-bold text-gray-900">₹{order.total.toFixed(2)}</td>
                                 </motion.tr>
                                );
                             })}
                          </AnimatePresence>
                          {recentOrders.length === 0 && (
                             <tr>
                                <td colSpan={4} className="px-8 py-12 text-center text-gray-400 text-xs font-bold uppercase tracking-widest">
                                   No recent orders
                                </td>
                             </tr>
                          )}
                       </tbody>
                    </table>
                 </div>
              </div>
           </div>

           {/* Quick Actions / Notifications */}
           <div className="space-y-6">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
                 <h3 className="text-lg font-bold text-gray-900 mb-6">Service Health</h3>
                 <div className="space-y-6">
                    <HealthBar label="Fulfillment Speed" value={stats.fulfillmentSpeed} color="green" />
                    <HealthBar label="Customer Satisfaction" value={stats.satisfaction} color="orange" />
                    <HealthBar label="Table Utilization" value={stats.tableUtilization} color="blue" />
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ icon, label, value, color, trend, badge }: any) => {
  const colors: any = {
    orange: 'bg-orange-50 text-orange-600',
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 group hover:border-orange-200 transition-all relative">
       {badge > 0 && (
         <span className="absolute -top-2 -right-2 bg-orange-600 text-white text-[10px] font-black px-2 py-1 rounded-full shadow-lg animate-bounce">
           {badge} NEW
         </span>
       )}
       <div className="flex justify-between items-start mb-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${colors[color]}`}>
             {React.cloneElement(icon, { className: 'w-6 h-6' })}
          </div>
          <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg">{trend}</span>
       </div>
       <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">{label}</p>
       <h4 className="text-2xl font-bold text-gray-900">{value}</h4>
    </div>
  );
};

const HealthBar = ({ label, value, color }: any) => {
   const colors: any = {
      green: 'bg-green-500',
      orange: 'bg-orange-500',
      blue: 'bg-blue-500'
   };
   return (
      <div className="space-y-2">
         <div className="flex justify-between text-xs font-bold uppercase tracking-tight text-gray-500">
            <span>{label}</span>
            <span>{value}%</span>
         </div>
         <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <motion.div 
               initial={{ width: 0 }}
               animate={{ width: `${value}%` }}
               transition={{ duration: 1, ease: 'easeOut' }}
               className={`h-full ${colors[color]}`} 
            />
         </div>
      </div>
   );
};

export default AdminDashboard;

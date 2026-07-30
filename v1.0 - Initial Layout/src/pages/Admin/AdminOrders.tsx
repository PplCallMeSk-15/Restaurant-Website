import React, { useEffect, useState } from 'react';
import { db } from '../../firebase/config';
import { collection, onSnapshot, updateDoc, doc, query, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { Order } from '../../types';
import { ShoppingBag, ChevronLeft, Clock, CheckCircle2, XCircle, Search, Loader2, AlertTriangle, MapPin, Eye, Navigation } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';

import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { triggerOrderEmailForStatus } from '../../services/clientEmailTrigger';
import DeliveryMap from '../../components/DeliveryMap';

const AdminOrders = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [statusConfirm, setStatusConfirm] = useState<{ orderId: string, status: string, currentStatus: string } | null>(null);
  const [selectedOrderForTracking, setSelectedOrderForTracking] = useState<Order | null>(null);

  // Lock body scroll when tracking modal is open
  useEffect(() => {
    if (selectedOrderForTracking) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [selectedOrderForTracking]);

  const navigate = useNavigate();

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Order[];
      setOrders(ordersData);
      setLoading(false);
    }, (error) => {
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'orders');
    });

    return () => unsubscribe();
  }, []);

  const updateStatus = async (orderId: string, status: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { 
        status,
        updatedAt: serverTimestamp()
      });
      // Save logs of status changes so track milestones are accurate
      await addDoc(collection(db, 'delivery_status_logs'), {
        orderId,
        status,
        updatedBy: 'admin',
        updatedAt: serverTimestamp()
      });
      toast.success(`Order marked as ${status}`);

      // Trigger client-side status update email notification
      triggerOrderEmailForStatus(orderId, status).catch(err => 
        console.warn('[Client Email Trigger] Failed to send order status email:', err)
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    } finally {
      setStatusConfirm(null);
    }
  };

  const initiateStatusUpdate = (orderId: string, newStatus: string, currentStatus: string) => {
    if (newStatus === 'delivered' || newStatus === 'cancelled') {
      setStatusConfirm({ orderId, status: newStatus, currentStatus });
    } else {
      updateStatus(orderId, newStatus);
    }
  };

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'delivered': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'cancelled': return 'bg-red-50 text-red-600 border-red-100';
      case 'preparing': return 'bg-blue-50 text-blue-600 border-blue-100';
      case 'confirmed': return 'bg-purple-50 text-purple-600 border-purple-100';
      case 'Ready For Delivery': return 'bg-orange-50 text-orange-600 border-orange-100';
      case 'Assigned To Delivery Partner': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
      case 'Picked Up': return 'bg-cyan-50 text-cyan-600 border-cyan-100';
      case 'On The Way': return 'bg-sky-50 text-sky-600 border-sky-100';
      default: return 'bg-gray-50 text-gray-400 border-gray-100';
    }
  };

  const filteredOrders = orders.filter(o => filter === 'all' || o.status === filter);

  if (loading) return <div className="pt-32 text-center text-gray-500">Loading Orders...</div>;

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-12">
            <div className="flex items-center gap-4">
                <button onClick={() => navigate('/admin')} className="p-3 bg-white rounded-2xl shadow-sm hover:text-orange-600 transition-colors">
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <h1 className="text-4xl font-bold text-gray-900">Orders Management</h1>
            </div>
            
            <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100">
          {['all', 'pending', 'preparing', 'delivered'].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all ${
                filter === s ? 'bg-orange-600 text-white shadow-md' : 'text-gray-400 hover:text-orange-600'
              }`}
            >
              {s}
            </button>
          ))}
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
                    onClick={() => updateStatus(statusConfirm.orderId, statusConfirm.status)}
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

      <div className="grid grid-cols-1 gap-6">
        <AnimatePresence mode="popLayout">
          {filteredOrders.map(order => (
            <motion.div 
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              key={order.id} 
              className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col md:flex-row gap-8 items-start md:items-center relative overflow-hidden"
            >
              {order.status === 'pending' && (
                <div className="absolute top-0 left-0 w-1.5 h-full bg-orange-500" />
              )}
              <div className="flex-grow">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-xs text-gray-400">#{order.id?.slice(-6).toUpperCase() || 'N/A'}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">{order.customerName}</span>
                    {order.status === 'pending' && (
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-[10px] font-black uppercase rounded-md animate-pulse">New</span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-400 mb-4">{order.createdAt?.toDate().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short', hour12: true })}</p>
                <div className="flex flex-wrap gap-2">
                  {order.items.map(i => (
                    <span key={i.id} className="text-xs font-medium bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                      {i.quantity}x {i.name}
                    </span>
                  ))}
                </div>

                {order.orderType === 'delivery' && (
                  <div className="mt-4 border-t border-gray-100 pt-4 space-y-2 text-left">
                    <div className="flex items-start gap-2 text-xs text-gray-600">
                      <MapPin className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-gray-900">{order.address}</div>
                        {order.landmark && (
                          <div className="text-[11px] text-gray-500 font-medium">Landmark: <span className="font-semibold text-gray-800">{order.landmark}</span></div>
                        )}
                        {order.latitude && order.longitude ? (
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="font-mono text-[10px] text-gray-400">
                              GPS: {order.latitude.toFixed(5)}, {order.longitude.toFixed(5)}
                            </span>
                            <button
                              onClick={() => setSelectedOrderForTracking(order)}
                              className="inline-flex items-center gap-1 text-[10px] text-orange-600 hover:text-orange-700 font-bold uppercase tracking-wider transition-all cursor-pointer"
                            >
                              <Eye className="w-3 h-3" /> Show Coordinates Map
                            </button>
                          </div>
                        ) : (
                          <div className="font-mono text-[10px] text-gray-400 mt-1">GPS Coordinates: Not specified</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="text-right shrink-0">
                <p className="text-2xl font-bold text-gray-900 mb-2">₹{order.total.toFixed(2)}</p>
                <div className="flex items-center gap-2">
                  <select 
                    value={order.status}
                    disabled={['delivered', 'cancelled'].includes(order.status)}
                    onChange={(e) => initiateStatusUpdate(order.id, e.target.value, order.status)}
                    className={`text-[10px] font-black px-4 py-2 rounded-xl border focus:outline-none transition-all uppercase tracking-tight ${getStatusStyles(order.status)} ${['delivered', 'cancelled'].includes(order.status) ? 'cursor-not-allowed opacity-100' : 'cursor-pointer hover:shadow-sm'}`}
                  >
                    {order.orderType === 'delivery' ? (
                      ['pending', 'confirmed', 'preparing', 'Ready For Delivery', 'Assigned To Delivery Partner', 'Picked Up', 'On The Way', 'delivered', 'cancelled'].map(s => (
                        <option key={s} value={s} className="font-bold text-gray-900 bg-white">{s.toUpperCase()}</option>
                      ))
                    ) : (
                      ['pending', 'confirmed', 'preparing', 'delivered', 'cancelled'].map(s => (
                        <option key={s} value={s} className="font-bold text-gray-900 bg-white">{s.toUpperCase()}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {filteredOrders.length === 0 && (
             <div className="text-center py-20 bg-white rounded-[3rem] border border-dashed border-gray-200">
                <ShoppingBag className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">No orders found</p>
             </div>
           )}
        </div>
      </div>

      {/* Customer Location Tracking Modal */}
      <AnimatePresence>
        {selectedOrderForTracking && (
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-xs z-[110] flex items-center justify-center p-4"
            onWheel={(e) => e.stopPropagation()}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-8 bg-gray-50 border-b border-gray-100 flex justify-between items-center shrink-0 text-left">
                <div className="text-left">
                  <h3 className="text-xl font-bold text-gray-950 flex items-center gap-2">
                    <Navigation className="w-5 h-5 text-orange-600 animate-pulse fill-current" /> Customer Coordinate Map
                  </h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">
                    Order Reference: #{selectedOrderForTracking.id?.slice(-6).toUpperCase() || 'N/A'} • Customer: {selectedOrderForTracking.customerName}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedOrderForTracking(null)}
                  className="p-1 hover:bg-gray-200 rounded-full transition-colors text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <XCircle className="w-5.5 h-5.5" />
                </button>
              </div>

              <div className="p-6 bg-white space-y-4">
                <div className="h-[400px] border border-gray-150 rounded-[2rem] overflow-hidden">
                  <DeliveryMap
                    mode="track"
                    latitude={selectedOrderForTracking.latitude}
                    longitude={selectedOrderForTracking.longitude}
                    partnerLatitude={selectedOrderForTracking.partnerLatitude}
                    partnerLongitude={selectedOrderForTracking.partnerLongitude}
                    height="100%"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-5 rounded-2xl border border-gray-100 text-xs text-left">
                  <div className="text-left space-y-1">
                    <div className="text-[9px] uppercase font-black text-gray-400">Target Address Destination</div>
                    <div className="font-bold text-gray-950 leading-snug">{selectedOrderForTracking.address}</div>
                    {selectedOrderForTracking.landmark && (
                      <div className="text-gray-500 mt-1">Landmark: <span className="font-bold text-gray-950">{selectedOrderForTracking.landmark}</span></div>
                    )}
                  </div>
                  <div className="text-left space-y-1 border-t md:border-t-0 md:border-l border-gray-200 pt-3 md:pt-0 md:pl-5">
                    <div className="text-[9px] uppercase font-black text-gray-400">Coordinates & Status</div>
                    <div>Latitude: <span className="font-bold text-gray-950">{selectedOrderForTracking.latitude?.toFixed(6)}</span></div>
                    <div>Longitude: <span className="font-bold text-gray-950">{selectedOrderForTracking.longitude?.toFixed(6)}</span></div>
                    <div className="mt-1">Current Order Status: <span className="font-bold text-orange-600 uppercase tracking-wider text-[10px]">{selectedOrderForTracking.status}</span></div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminOrders;

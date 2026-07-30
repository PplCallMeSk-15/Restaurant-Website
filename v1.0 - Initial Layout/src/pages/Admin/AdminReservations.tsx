import React, { useEffect, useState } from 'react';
import { db } from '../../firebase/config';
import { collection, updateDoc, doc, query, orderBy, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { Reservation, Feedback } from '../../types';
import { Calendar, ChevronLeft, CheckCircle2, XCircle, Users, Clock, Filter, Loader2, Search, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { formatTo12Hour, parseTime } from '../../utils/timeUtils';

import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';

import { subscribeToSettings, getCurrentSystemTime, AppSettings } from '../../services/settingsService';

const AdminReservations = () => {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'confirmed' | 'cancelled' | 'rejected' | 'completed' | 'seated' | 'no-show'>('all');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    return subscribeToSettings(setSettings);
  }, []);

  useEffect(() => {
    let q = query(collection(db, 'reservations'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Reservation[];
      setReservations(data);
      setLoading(false);
    }, (error) => {
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'reservations');
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const feedbackQuery = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(feedbackQuery, (snapshot) => {
      setFeedback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Feedback));
    });
    return () => unsubscribe();
  }, []);

  const updateStatus = async (id: string, status: any) => {
    try {
      const { updateReservationStatus } = await import('../../services/adminService');
      await updateReservationStatus(id, status);
      toast.success(`Reservation status updated to ${status}`);
    } catch (error: any) {
      const message = error.message || 'Update failed';
      try {
        const parsed = JSON.parse(message);
        toast.error(parsed.error || 'Update failed');
      } catch {
        toast.error(message);
      }
    }
  };

  const filteredReservations = reservations.filter(res => {
    const matchesDate = filterDate ? res.date === filterDate : true;
    const matchesStatus = filterStatus === 'all' ? true : res.status === filterStatus;
    return matchesDate && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-purple-50 text-purple-700 border-purple-100';
      case 'seated': return 'bg-blue-50 text-blue-600 border-blue-100';
      case 'cancelled': return 'bg-gray-100 text-gray-500 border-gray-200';
      case 'rejected': return 'bg-red-50 text-red-600 border-red-100';
      case 'no-show': return 'bg-gray-100 text-gray-500 border-gray-200';
      case 'completed': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      default: return 'bg-yellow-50 text-yellow-600 border-yellow-100';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-32 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-12 h-12 text-orange-600 animate-spin" />
        <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Accessing Database</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-20 font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
            <div className="flex items-center gap-4">
                <button onClick={() => navigate('/admin')} className="p-3 bg-white rounded-2xl shadow-sm hover:text-orange-600 transition-colors">
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <div>
                   <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Booking Log</h1>
                   <p className="text-gray-500 font-medium font-sans">Monitor and manage all table reservations</p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
               <div className="relative group">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-orange-500 transition-colors" />
                  <input 
                     type="date" 
                     className="pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-xl text-sm font-bold text-gray-700 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none shadow-sm transition-all"
                     value={filterDate}
                     onChange={(e) => setFilterDate(e.target.value)}
                  />
               </div>
               <div className="relative">
                  <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <select 
                     className="pl-11 pr-8 py-3 bg-white border border-gray-100 rounded-xl text-sm font-bold text-gray-700 outline-none shadow-sm focus:ring-2 focus:ring-orange-500/20 appearance-none cursor-pointer"
                     value={filterStatus}
                     onChange={(e) => setFilterStatus(e.target.value as any)}
                  >
                     <option value="all">Every Status</option>
                     <option value="pending">Pending</option>
                     <option value="confirmed">Confirmed</option>
                     <option value="seated">Seated (Active)</option>
                     <option value="completed">Completed</option>
                     <option value="cancelled">Guest Cancelled</option>
                     <option value="rejected">Admin Rejected</option>
                     <option value="no-show">No-Show</option>
                  </select>
               </div>
            </div>
        </div>

        <div className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden">
           <div className="overflow-x-auto">
              <table className="w-full text-left">
                 <thead className="bg-gray-50/50 text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                    <tr>
                       <th className="px-8 py-5">Customer info</th>
                       <th className="px-8 py-5">Arrival details</th>
                       <th className="px-8 py-5">Party size</th>
                       <th className="px-8 py-5">Tables</th>
                       <th className="px-8 py-5">Current Status</th>
                       <th className="px-8 py-5 text-right">Actions</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50">
                    <AnimatePresence mode="popLayout">
                       {filteredReservations.map((res) => {
                          const now = getCurrentSystemTime(settings);
                          const resTime = parseTime(res.time, now);
                          const diffMins = (resTime.getTime() - now.getTime()) / (1000 * 60);
                          const isWithinEntryPeriod = Math.abs(diffMins) <= 10;
                          
                          const resFeedback = feedback.find(f => f.reservationId === res.id);
                          
                          return (
                          <motion.tr 
                             layout
                             initial={{ opacity: 0 }}
                             animate={{ opacity: 1 }}
                             exit={{ opacity: 0 }}
                             key={res.id} 
                             className="group hover:bg-gray-50/30 transition-colors"
                          >
                             <td className="px-8 py-6">
                                <div className="flex items-center gap-3">
                                   <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center font-bold text-gray-400 group-hover:bg-orange-100 group-hover:text-orange-600 transition-colors">
                                      {res.name.charAt(0)}
                                   </div>
                                   <div>
                                      <p className="font-bold text-gray-900 text-sm">{res.name}</p>
                                      <p className="text-xs text-gray-400">{res.phone}</p>
                                      {resFeedback && (
                                        <div className="mt-2 bg-orange-50/50 p-2 rounded-xl border border-orange-100/50 max-w-[200px]">
                                           <div className="flex gap-0.5 mb-1 text-orange-500">
                                              {[1, 2, 3, 4, 5].map((s) => (
                                                 <Star 
                                                    key={s} 
                                                    className={`w-2.5 h-2.5 ${resFeedback.rating >= s ? 'fill-current' : 'text-gray-200'}`} 
                                                 />
                                              ))}
                                           </div>
                                           <p className="text-[10px] text-gray-600 italic leading-tight line-clamp-2">
                                              "{resFeedback.comment}"
                                           </p>
                                        </div>
                                      )}
                                   </div>
                                </div>
                             </td>
                             <td className="px-8 py-6">
                                <div className="space-y-1">
                                   <div className="flex items-center text-xs font-bold text-gray-600">
                                      <Calendar className="w-3 h-3 mr-1.5 text-orange-600" /> {new Date(res.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                   </div>
                                   <div className="flex items-center text-[10px] font-bold text-gray-400">
                                      <Clock className="w-3 h-3 mr-1.5" /> {res.time.includes('M') ? res.time : formatTo12Hour(res.time)}
                                   </div>
                                </div>
                             </td>
                             <td className="px-8 py-6">
                                <div className="flex items-center gap-1.5">
                                   <Users className="w-4 h-4 text-gray-300" />
                                   <span className="text-sm font-bold text-gray-900 font-mono">{res.guests}</span>
                                   <span className="text-[10px] font-bold text-gray-400">PPL</span>
                                </div>
                             </td>
                             <td className="px-8 py-6">
                                {res.assignedTables ? (
                                  <div className="flex flex-wrap gap-1">
                                    {res.assignedTables.map(t => (
                                      <span key={t} className="text-[10px] font-black bg-orange-600 text-white px-2 py-0.5 rounded-md shadow-sm">
                                        {t}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-[10px] font-bold text-gray-300 italic">No Table</span>
                                )}
                             </td>
                             <td className="px-8 py-6">
                                <span className={`text-[10px] font-bold px-3 py-1 rounded-full border tracking-tight ${getStatusColor(res.status)}`}>
                                   {res.status.toUpperCase()}
                                </span>
                             </td>
                             <td className="px-8 py-6 text-right space-x-2">
                                <div className="flex justify-end gap-2">
                                   {res.status === 'confirmed' && isWithinEntryPeriod && (
                                     <button 
                                        onClick={() => updateStatus(res.id, 'seated')}
                                        className="px-3 py-2 bg-blue-600 text-white text-[10px] font-bold rounded-xl hover:bg-blue-700 hover:scale-105 transition-all shadow-md shadow-blue-100 flex items-center gap-1.5"
                                        title="Mark as Seated"
                                     >
                                        <Users className="w-3 h-3" /> Seated
                                     </button>
                                   )}
                                   
                                   {res.status === 'seated' && (
                                     <button 
                                        onClick={() => updateStatus(res.id, 'completed')}
                                        className="px-3 py-2 bg-emerald-600 text-white text-[10px] font-bold rounded-xl hover:bg-emerald-700 hover:scale-105 transition-all shadow-md shadow-emerald-100 flex items-center gap-1.5"
                                        title="Complete Service"
                                     >
                                        <CheckCircle2 className="w-3 h-3" /> Complete
                                     </button>
                                   )}

                                   {(res.status === 'pending') && (
                                     <button 
                                        onClick={() => updateStatus(res.id, 'confirmed')}
                                        className="p-2.5 bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-100 hover:scale-105 transition-all shadow-sm"
                                        title="Confirm Booking"
                                     >
                                        <CheckCircle2 className="w-4 h-4" />
                                     </button>
                                   )}

                                   {(res.status === 'pending') && (
                                     <button 
                                        onClick={() => updateStatus(res.id, 'rejected')}
                                        className="p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 hover:scale-105 transition-all shadow-sm"
                                        title="Reject Booking"
                                     >
                                        <XCircle className="w-4 h-4" />
                                     </button>
                                   )}

                                   {res.status === 'confirmed' && isWithinEntryPeriod && (
                                      <button 
                                        onClick={() => updateStatus(res.id, 'no-show')}
                                        className="px-3 py-2 bg-gray-100 text-gray-500 text-[10px] font-bold rounded-xl hover:bg-gray-200 transition-all"
                                        title="Mark as No-show"
                                      >
                                        No-show
                                      </button>
                                   )}
                                </div>
                             </td>
                          </motion.tr>
                          );
                        })}
                    </AnimatePresence>
                    {filteredReservations.length === 0 && (
                       <tr>
                          <td colSpan={6} className="px-8 py-20 text-center text-gray-400 font-bold uppercase tracking-widest text-xs">
                             No reservations found for this filter
                          </td>
                       </tr>
                    )}
                 </tbody>
              </table>
           </div>
        </div>
      </div>
    </div>
  );
};

export default AdminReservations;

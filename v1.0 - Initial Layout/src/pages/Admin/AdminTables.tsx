import React, { useEffect, useState } from 'react';
import { db } from '../../firebase/config';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { Table, Reservation } from '../../types';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  CheckCircle2, 
  XCircle, 
  Users, 
  ChevronLeft, 
  Loader2,
  MoreVertical,
  LayoutGrid,
  List as ListIcon,
  Clock,
  Calendar,
  Info
} from 'lucide-react';
import { 
  addTable, 
  updateTable, 
  deleteTable, 
  toggleTableStatus,
  canMarkTableFree,
  getActiveReservationForTable,
  getUpcomingWarning
} from '../../services/tableService';
import { subscribeToSettings, getCurrentSystemTime, AppSettings } from '../../services/settingsService';
import { parseTime } from '../../utils/timeUtils';
import toast from 'react-hot-toast';
import { useNavigate, useBlocker } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useBookingSync } from '../../hooks/useBookingSync';
import { AlertTriangle } from 'lucide-react';

import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';

const AdminTables = () => {
  const [tables, setTables] = useState<Table[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  useBookingSync();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [editingTable, setEditingTable] = useState<Table | null>(null);

  useEffect(() => {
    return subscribeToSettings(setSettings);
  }, []);
  
  const [formData, setFormData] = useState({
    name: '',
    capacity: '' as number | '',
    status: 'free' as 'free' | 'booked' | 'occupied'
  });

  const navigate = useNavigate();

  useEffect(() => {
    const q = query(collection(db, 'tables'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Table[];
      setTables(data);
      setLoading(false);
    }, (error) => {
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'tables');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!settings) return;
    const now = getCurrentSystemTime(settings);
    const formatDate = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${da}`;
    };
    const todayStr = formatDate(now);
    
    // Only fetch confirmed or seated reservations for today
    const q = query(
      collection(db, 'reservations'), 
      where('date', '==', todayStr),
      where('status', 'in', ['confirmed', 'seated'])
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Reservation[];
      setReservations(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'reservations');
    });
    return () => unsubscribe();
  }, [settings]);

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isModalOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Ensure capacity is a number before submitting
      const finalCapacity = typeof formData.capacity === 'number' ? formData.capacity : parseInt(formData.capacity.toString()) || 2;
      const dataToSubmit = { ...formData, capacity: finalCapacity };

      if (editingTable) {
        await updateTable(editingTable.id, dataToSubmit);
        toast.success('Table updated');
      } else {
        await addTable(dataToSubmit);
        toast.success('Table added');
      }
      closeModal();
    } catch (error: any) {
      let errorMsg = 'Operation failed';
      try {
        const parsed = JSON.parse(error.message);
        errorMsg = parsed.error || errorMsg;
      } catch {
        errorMsg = error.message || errorMsg;
      }
      toast.error(errorMsg);
      console.error('Submit error:', error);
    }
  };

  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handleDelete = async (tableId: string) => {
    const table = tables.find(t => t.id === tableId);
    if (!table) {
      console.error("Table not found in local state:", tableId);
      return;
    }

    // 8. EDGE CASE: Check if table is used in active reservation
    const now = getCurrentSystemTime(settings);
    const resState = getReservationState(table.name, reservations, table.status, now);
    
    // Log state for debugging
    console.log(`Checking reservation state for ${table.name}:`, resState);

    if (resState.state !== 'FREE') {
      toast.error(`Table ${table.name} is assigned to an active reservation and cannot be deleted.`);
      return;
    }

    // Use state instead of window.confirm for better reliability in some iframe environments
    setIsDeleting(tableId);
  };

  const confirmDelete = async (tableId: string) => {
    const table = tables.find(t => t.id === tableId);
    if (!table) return;

    try {
      // 7. DEBUG
      console.log("🔥 PERMANENT DELETE INITIATED:", tableId);
      
      // 1 & 2. USE FIREBASE DELETE FUNCTION via tableService
      // 3. tableId is the Firestore document ID
      await deleteTable(tableId);
      
      // 7. DEBUG
      console.log("✅ TABLE DELETED SUCCESSFULLY FROM FIRESTORE");
      
      // 5. UPDATE UI (Automatic via onSnapshot)
      toast.success(`Table ${table.name} deleted permanently`);
      
      setIsDeleting(null);
      if (isModalOpen) closeModal();
    } catch (error: any) {
      // 6. ERROR HANDLING
      console.error("❌ DELETE OPERATION FAILED:", error);
      let errorMsg = 'Failed to delete table';
      try {
        const parsed = JSON.parse(error.message);
        errorMsg = parsed.error || errorMsg;
      } catch {
        errorMsg = error.message || errorMsg;
      }
      toast.error(errorMsg);
      setIsDeleting(null);
    }
  };

    const getStatusStyles = (status: string) => {
      switch (status) {
        case 'free': return 'bg-green-50 text-green-600 border-green-100';
        case 'booked': return 'bg-orange-50 text-orange-600 border-orange-100';
        case 'occupied': return 'bg-red-50 text-red-600 border-red-100';
        default: return 'bg-gray-50 text-gray-600 border-gray-100';
      }
    };

    const getStatusIconColor = (status: string) => {
      switch (status) {
        case 'free': return 'bg-green-100 text-green-600';
        case 'booked': return 'bg-orange-100 text-orange-600';
        case 'occupied': return 'bg-red-100 text-red-600';
        default: return 'bg-gray-100 text-gray-600';
      }
    };

    const getReservationState = (tableName: string, reservations: Reservation[], status: string, now: Date) => {
      const tableRes = reservations.filter(r => 
        (r.status === 'confirmed' || r.status === 'seated') && r.assignedTables?.includes(tableName)
      );
      
      if (tableRes.length === 0) return { state: 'FREE' };

      const sortedRes = [...tableRes].sort((a, b) => {
        const timeA = parseTime(a.time, now).getTime();
        const timeB = parseTime(b.time, now).getTime();
        return timeA - timeB;
      });

      const res = sortedRes[0];

      // If already seated, or table is occupied for this reservation, ignore all grace period logic
      if (res.status === 'seated' || (status === 'occupied' && res.status === 'confirmed')) {
        return { state: 'SEATED', reservation: res };
      }

      const resTime = parseTime(res.time, now);
      const diffMins = (resTime.getTime() - now.getTime()) / (1000 * 60);

      if (diffMins >= -10 && diffMins <= 10) {
        return { state: 'LOCKED', reservation: res, diffMins };
      }
      
      if (diffMins > 10 && diffMins <= 20) {
        return { state: 'WARNING', reservation: res, diffMins };
      }

      return { state: 'FREE' };
    };

    const handleMarkOccupiedOffline = async (table: Table) => {
      try {
        await updateTable(table.id, { status: 'occupied' });
        toast.success(`Table ${table.name} occupied (Offline)`);
      } catch (error) {
        toast.error('Operation failed');
      }
    };

    const handleSeatReservedGuest = async (table: Table, reservation: Reservation) => {
      try {
        if (table.status === 'occupied') {
          toast.error('Please mark the table as FREE before seating the reserved guest.');
          return;
        }

        const now = getCurrentSystemTime(settings);
        const resTime = parseTime(reservation.time, now);
        const diffMins = (resTime.getTime() - now.getTime()) / (1000 * 60);

        if (diffMins > 10) {
          toast.error('Too early to seat reserved guest');
          return;
        }

        const { updateReservationStatus } = await import('../../services/adminService');
        await updateReservationStatus(reservation.id, 'seated');
        await updateTable(table.id, { status: 'occupied' });
        toast.success(`Guest for table ${table.name} seated`);
      } catch (error: any) {
        const message = error.message || 'Failed to seat guest';
        try {
          const parsed = JSON.parse(message);
          toast.error(parsed.error || 'Failed to seat guest');
        } catch {
          toast.error(message);
        }
      }
    };

    const handleMarkFree = async (table: Table) => {
      try {
        const now = getCurrentSystemTime(settings);

        const activeRes = await getActiveReservationForTable(table.name);
        
        // If there is an active seated reservation, completing it releases the table
        if (activeRes && activeRes.status === 'seated') {
          const { updateReservationStatus } = await import('../../services/adminService');
          await updateReservationStatus(activeRes.id, 'completed');
          toast.success(`Table ${table.name} released`);
          return;
        }

        const check = canMarkTableFree(table, activeRes, now);
        
        if (!check.allowed) {
          toast.error(check.reason || 'Cannot mark as free yet');
          return;
        }

        await updateTable(table.id, { status: 'free' });
        toast.success(`Table ${table.name} is now free`);
      } catch (error: any) {
        const message = error.message || 'Operation failed';
        try {
          const parsed = JSON.parse(message);
          toast.error(parsed.error || 'Operation failed');
        } catch {
          toast.error(message);
        }
      }
    };

  const openModal = (table?: Table) => {
    const data = table ? {
      name: table.name,
      capacity: table.capacity,
      status: table.status
    } : {
      name: '',
      capacity: '' as number | '',
      status: 'free'
    };

    if (table) {
      setEditingTable(table);
    } else {
      setEditingTable(null);
    }
    
    setFormData(data as any);
    setInitialFormData(data);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTable(null);
    setInitialFormData(null);
  };

  const isDirty = isModalOpen && initialFormData && JSON.stringify(formData) !== JSON.stringify(initialFormData);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  if (loading) {
    return (
      <div className="min-h-screen pt-32 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-12 h-12 text-orange-600 animate-spin" />
        <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Syncing Floor Plan</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-20 font-sans">
      <AnimatePresence>
        {isDeleting && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl space-y-6 border border-gray-100"
            >
              <div className="w-20 h-20 bg-red-50 rounded-[2rem] flex items-center justify-center mx-auto shadow-inner">
                <Trash2 className="w-10 h-10 text-red-600" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-black text-gray-900 tracking-tight">Delete Table?</h2>
                <p className="text-gray-500 font-medium leading-relaxed">
                  Are you sure you want to delete <strong>{tables.find(t => t.id === isDeleting)?.name}</strong>? 
                  This will permanently remove it from Firestore and the layout.
                </p>
              </div>
              <div className="flex flex-col gap-3 pt-4">
                <button
                  onClick={() => confirmDelete(isDeleting)}
                  className="w-full py-5 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg active:scale-95"
                >
                  Yes, Delete Forever
                </button>
                <button
                  onClick={() => setIsDeleting(null)}
                  className="w-full py-5 bg-gray-100 text-gray-900 rounded-2xl font-bold hover:bg-gray-200 transition-all active:scale-95"
                >
                  No, Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {blocker.state === 'blocked' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl space-y-6 border border-gray-100"
            >
              <div className="w-20 h-20 bg-orange-50 rounded-[2rem] flex items-center justify-center mx-auto shadow-inner">
                <AlertTriangle className="w-10 h-10 text-orange-600" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-black text-gray-900 tracking-tight">Discard Changes?</h2>
                <p className="text-gray-500 font-medium leading-relaxed">You have unsaved modifications to this table. Leaving now will lose all changes.</p>
              </div>
              <div className="flex flex-col gap-3 pt-4">
                <button
                  onClick={() => blocker.proceed?.()}
                  className="w-full py-5 bg-gray-900 text-white rounded-2xl font-bold hover:bg-red-600 transition-all shadow-lg active:scale-95"
                >
                  Discard & Leave
                </button>
                <button
                  onClick={() => blocker.reset?.()}
                  className="w-full py-5 bg-gray-100 text-gray-900 rounded-2xl font-bold hover:bg-gray-200 transition-all active:scale-95"
                >
                  Keep Editing
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
            <div className="flex items-center gap-4">
                <button onClick={() => navigate('/admin')} className="p-3 bg-white rounded-2xl shadow-sm hover:text-orange-600 transition-colors">
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <div>
                   <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Floor Manager</h1>
                   <p className="text-gray-500 font-medium font-sans">Manage seating capacity and table availability</p>
                </div>
            </div>

            <div className="flex items-center gap-3">
               <div className="bg-white p-1 rounded-xl shadow-sm flex">
                  <button 
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-orange-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                     <LayoutGrid className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-orange-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                     <ListIcon className="w-5 h-5" />
                  </button>
               </div>
               <button 
                  onClick={() => openModal()}
                  className="bg-orange-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-orange-700 transition-all shadow-xl shadow-orange-100 active:scale-95"
               >
                  <Plus className="w-5 h-5" /> Add New Table
               </button>
            </div>
        </div>

        {viewMode === 'grid' ? (
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <AnimatePresence mode="popLayout">
                 {tables.map((table) => {
                    const now = getCurrentSystemTime(settings);
                    const resState = getReservationState(table.name, reservations, table.status, now);
                    const isUpcoming = resState.state === 'WARNING';
                    const isLocked = resState.state === 'LOCKED';
                    const isSeated = resState.state === 'SEATED';
                    
                    return (
                    <motion.div 
                       layout
                       initial={{ opacity: 0, scale: 0.9 }}
                       animate={{ opacity: 1, scale: 1 }}
                       exit={{ opacity: 0, scale: 0.9 }}
                       key={table.id}
                       className={`bg-white p-6 rounded-[2.5rem] shadow-sm border-2 group transition-all flex flex-col justify-between ${
                         isLocked 
                         ? 'border-red-400 shadow-xl shadow-red-100 ring-4 ring-red-50/50' 
                         : isUpcoming
                         ? 'border-orange-400 shadow-xl shadow-orange-100 ring-4 ring-orange-50/50' 
                         : isSeated
                         ? 'border-blue-400 shadow-xl shadow-blue-100/30'
                         : 'border-gray-100 hover:shadow-xl hover:shadow-orange-100/30'
                       }`}
                    >
                       <div className="flex justify-between items-start mb-6">
                          <div className={`w-fit min-w-12 h-12 px-6 rounded-2xl flex items-center justify-center font-black text-lg transition-colors whitespace-nowrap ${getStatusIconColor(table.status)}`}>
                             {table.name}
                          </div>
                          <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                             <button onClick={() => openModal(table)} className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors">
                                <Edit2 className="w-4 h-4" />
                             </button>
                             <button onClick={() => handleDelete(table.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 className="w-4 h-4" />
                             </button>
                          </div>
                       </div>

                       <div className="mb-4">
                          <div className="flex items-center gap-2 mb-2">
                             <Users className="w-4 h-4 text-gray-300" />
                             <span className="text-2xl font-black text-gray-900 pb-0.5">{table.capacity}</span>
                             <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pt-1">Capacity</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <div className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight border ${getStatusStyles(table.status)}`}>
                                {table.status}
                            </div>
                            {isUpcoming && resState.reservation && (
                              <div className="group/tooltip relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tight bg-orange-50 text-orange-600 border border-orange-200">
                                <Calendar className="w-3 h-3" />
                                Reserved: {resState.reservation.time}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-[10px] rounded-xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-50">
                                   Upcoming reservation in {Math.round(resState.diffMins || 0)} mins
                                   <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900" />
                                </div>
                              </div>
                            )}
                            {isLocked && resState.reservation && (
                              <div className="group/tooltip relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tight bg-red-600 text-white border border-red-500 animate-pulse">
                                <Clock className="w-3 h-3" />
                                Locked: {new Date(parseTime(resState.reservation.time, now).getTime() + 10 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-[10px] rounded-xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-50">
                                   Reservation active. Grace period ends at {new Date(parseTime(resState.reservation.time, now).getTime() + 10 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                   <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900" />
                                </div>
                              </div>
                            )}
                            {isSeated && resState.reservation && (
                              <div className="group/tooltip relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tight bg-blue-50 text-blue-600 border border-blue-200">
                                <Users className="w-3 h-3" />
                                Guest seated
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-[10px] rounded-xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-50">
                                   Current guest is already seated. No grace period active.
                                   <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900" />
                                </div>
                              </div>
                            )}
                            {table.status === 'booked' && !isSeated && (
                              <div className="group/tooltip relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tight bg-blue-50 text-blue-600 border border-blue-100">
                                <Clock className="w-3 h-3" />
                                Locked
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-[10px] rounded-xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-50">
                                   Booked - waiting for guest
                                   <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900" />
                                </div>
                              </div>
                            )}
                            {table.status === 'occupied' && (
                              <div className="group/tooltip relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tight bg-red-50 text-red-600 border border-red-100">
                                <Info className="w-3 h-3" />
                                Active
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-[10px] rounded-xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-50">
                                   Ready to free after service
                                   <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900" />
                                </div>
                              </div>
                            )}
                          </div>
                       </div>

                       <div className="space-y-2">
                          <div className="flex flex-col gap-2">
                            {table.status !== 'occupied' && !isLocked ? (
                              <button 
                                  onClick={() => handleMarkOccupiedOffline(table)}
                                  className="w-full py-3.5 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all bg-gray-900 text-white hover:bg-gray-800"
                              >
                                  <Users className="w-4 h-4" /> Mark Occupied (Offline)
                              </button>
                            ) : table.status === 'occupied' ? (
                              <button 
                                  onClick={() => handleMarkFree(table)}
                                  className="w-full py-3.5 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all bg-green-50 text-green-600 hover:bg-green-100 border border-green-100"
                              >
                                  <Users className="w-4 h-4" /> Release Table
                              </button>
                            ) : null}
                            
                            {(isUpcoming || isLocked) && resState.reservation && (
                              <div className="group/btn-tooltip relative">
                                <button 
                                    onClick={() => handleSeatReservedGuest(table, resState.reservation!)}
                                    disabled={table.status === 'occupied'}
                                    className={`w-full py-3.5 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                                      table.status === 'occupied' 
                                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                      : isLocked 
                                      ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-md' 
                                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    }`}
                                >
                                    <CheckCircle2 className="w-4 h-4" /> Seat Reserved Guest
                                </button>
                                {table.status === 'occupied' && (
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-[10px] rounded-xl opacity-0 group-hover/btn-tooltip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-50">
                                     Table currently in use. Release it first.
                                     <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900" />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          
                          {table.status === 'booked' && (
                            <button 
                                onClick={() => handleMarkFree(table)}
                                className="w-full py-2.5 rounded-xl font-bold text-[10px] flex items-center justify-center gap-2 transition-all text-gray-400 hover:text-red-500 hover:bg-red-50 uppercase tracking-widest"
                            >
                                <XCircle className="w-3 h-3" /> Force Free
                            </button>
                          )}
                       </div>
                    </motion.div>
                 )})}
              </AnimatePresence>
           </div>
        ) : (
           <div className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-left">
                 <thead className="bg-gray-50/50 text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                    <tr>
                       <th className="px-8 py-5">Table Name</th>
                       <th className="px-8 py-5">Seating Capacity</th>
                       <th className="px-8 py-5">Current Status</th>
                       <th className="px-8 py-5 text-right">Actions</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50">
                      <AnimatePresence mode="popLayout">
                        {tables.map((table) => {
                           const now = getCurrentSystemTime(settings);
                           const resState = getReservationState(table.name, reservations, table.status, now);
                           const isUpcoming = resState.state === 'WARNING';
                           const isLocked = resState.state === 'LOCKED';
                           const isSeated = resState.state === 'SEATED';
                           
                           return (
                           <motion.tr layout key={table.id} className={`group hover:bg-gray-50/30 transition-colors ${isUpcoming ? 'bg-orange-50/10' : isLocked ? 'bg-red-50/10' : isSeated ? 'bg-blue-50/10' : ''}`}>
                              <td className="px-8 py-6">
                                 <div className="flex items-center gap-3">
                                   <span className={`w-fit min-w-8 h-8 px-4 rounded-lg flex items-center justify-center font-bold transition-all whitespace-nowrap ${isLocked ? 'bg-red-600 text-white ring-4 ring-red-50' : isUpcoming ? 'bg-orange-600 text-white' : isSeated ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                                      {table.name}
                                   </span>
                                   {isUpcoming && resState.reservation && (
                                     <span className="text-[10px] font-black text-orange-600 uppercase tracking-tighter flex items-center gap-1">
                                       <Calendar className="w-3 h-3" /> Reserved {resState.reservation.time}
                                     </span>
                                   )}
                                   {isLocked && resState.reservation && (
                                     <span className="text-[10px] font-black text-red-600 uppercase tracking-tighter flex items-center gap-1 animate-pulse">
                                       <Clock className="w-3 h-3" /> Locked until {new Date(parseTime(resState.reservation.time, now).getTime() + 10 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                     </span>
                                   )}
                                   {isSeated && (
                                     <span className="text-[10px] font-black text-blue-600 uppercase tracking-tighter flex items-center gap-1">
                                       <Users className="w-3 h-3" /> Guest Seated
                                     </span>
                                   )}
                                 </div>
                              </td>
                              <td className="px-8 py-6">
                                 <div className="flex items-center gap-2">
                                    <Users className="w-4 h-4 text-gray-300" />
                                    <span className="text-sm font-bold text-gray-900">{table.capacity} Persons</span>
                                 </div>
                              </td>
                              <td className="px-8 py-6">
                                 <div className="flex flex-wrap gap-2 items-center">
                                   {table.status !== 'occupied' && !isLocked ? (
                                     <button 
                                        onClick={() => handleMarkOccupiedOffline(table)}
                                        className="inline-flex items-center px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-tight border bg-gray-900 text-white hover:bg-gray-800 transition-all shadow-sm"
                                     >
                                        Mark Offline
                                     </button>
                                   ) : table.status === 'occupied' ? (
                                     <button 
                                        onClick={() => handleMarkFree(table)}
                                        className={`inline-flex items-center px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-tight border transition-all hover:scale-105 ${getStatusStyles(table.status)}`}
                                     >
                                        {table.status}
                                     </button>
                                   ) : null}
                                   
                                   {(isUpcoming || isLocked) && resState.reservation && (
                                      <div className="group/btn-tooltip relative">
                                        <button 
                                            onClick={() => handleSeatReservedGuest(table, resState.reservation!)}
                                            disabled={table.status === 'occupied'}
                                            className={`inline-flex items-center px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-tight border transition-all ${
                                              table.status === 'occupied' 
                                              ? 'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed' 
                                              : isLocked 
                                              ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-sm border-orange-500' 
                                              : 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-100'
                                            }`}
                                        >
                                            Seat Guest
                                        </button>
                                        {table.status === 'occupied' && (
                                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-[10px] rounded-xl opacity-0 group-hover/btn-tooltip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-50">
                                             Table currently in use
                                             <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900" />
                                          </div>
                                        )}
                                      </div>
                                   )}
                                   {isSeated && resState.reservation && (
                                     <div className="group/tooltip relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tight bg-blue-50 text-blue-600 border border-blue-200">
                                       <Users className="w-3 h-3" />
                                       Guest seated
                                       <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-[10px] rounded-xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-50">
                                          Current guest is already seated. No grace period active.
                                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900" />
                                       </div>
                                     </div>
                                   )}
                                   {table.status === 'booked' && !isSeated && (
                                     <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-blue-50 text-blue-600 border border-blue-100">
                                       <Clock className="w-2.5 h-2.5" /> Booked
                                     </div>
                                   )}
                                 </div>
                              </td>
                              <td className="px-8 py-6 text-right space-x-2">
                                 <button onClick={() => openModal(table)} className="p-2 text-gray-400 hover:text-orange-600 transition-colors">
                                    <Edit2 className="w-4 h-4" />
                                 </button>
                                 <button onClick={() => handleDelete(table.id)} className="p-2 text-gray-400 hover:text-red-600 transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                 </button>
                              </td>
                           </motion.tr>
                        )})}
                      </AnimatePresence>
                 </tbody>
              </table>
           </div>
        )}

        {/* Modal */}
        <AnimatePresence>
          {isModalOpen && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60] flex items-center justify-center p-4">
               <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="bg-white rounded-[2.5rem] md:rounded-[3rem] w-full max-w-md max-h-[90vh] shadow-2xl overflow-hidden border border-gray-100 flex flex-col"
               >
                  <div className="bg-gray-50 px-8 py-8 border-b border-gray-100 flex justify-between items-center shrink-0">
                     <div>
                        <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                           {editingTable ? 'Update Table' : 'Add New Table'}
                        </h3>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Table Metadata</p>
                     </div>
                     <button onClick={closeModal} className="p-2 bg-white rounded-xl shadow-sm text-gray-400 hover:text-gray-600 transition-colors">
                        <XCircle className="w-6 h-6" />
                     </button>
                  </div>

                  <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-grow">
                     <div>
                        <div className="flex justify-between items-center mb-2 px-1">
                           <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Table Name</label>
                           <span className={`text-[10px] font-bold uppercase tracking-widest ${(formData.name?.length || 0) >= 20 ? 'text-orange-600' : 'text-gray-300'}`}>
                             {formData.name?.length || 0}/20
                           </span>
                        </div>
                        <input 
                           type="text" 
                           required
                           maxLength={20}
                           placeholder="e.g. Premium Garden Table 1"
                           className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold placeholder:text-gray-300 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-600 focus:bg-white outline-none transition-all"
                           value={formData.name || ''}
                           onChange={(e) => setFormData({...formData, name: e.target.value})}
                        />
                     </div>
                     
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Seating Capacity</label>
                        <input 
                           type="number" 
                           required
                           min="1"
                           max="50"
                           placeholder="Enter capacity"
                           className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-orange-500/20 focus:border-orange-600 focus:bg-white outline-none transition-all"
                           value={formData.capacity}
                           onChange={(e) => {
                             const val = e.target.value;
                             setFormData({...formData, capacity: val === '' ? '' : parseInt(val)});
                           }}
                           onWheel={(e) => e.currentTarget.blur()}
                        />
                     </div>

                     <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Initial Status</label>
                        <div className="grid grid-cols-2 gap-3">
                           <button 
                              type="button"
                              onClick={() => setFormData({...formData, status: 'free'})}
                              className={`py-4 rounded-2xl text-xs font-bold transition-all border ${formData.status === 'free' ? 'bg-green-50 text-green-600 border-green-200 shadow-sm' : 'bg-white text-gray-400 border-gray-100'}`}
                           >
                              Free
                           </button>
                           <button 
                              type="button"
                              onClick={() => setFormData({...formData, status: 'occupied'})}
                              className={`py-4 rounded-2xl text-xs font-bold transition-all border ${formData.status === 'occupied' ? 'bg-red-50 text-red-600 border-red-200 shadow-sm' : 'bg-white text-gray-400 border-gray-100'}`}
                           >
                              Occupied
                           </button>
                        </div>
                     </div>

                     <div className="pt-4">
                        <button 
                           type="submit"
                           className="w-full py-5 bg-orange-600 text-white rounded-3xl font-bold text-lg hover:bg-orange-700 shadow-xl shadow-orange-100 active:scale-95 transition-all"
                        >
                           {editingTable ? 'Update Registry' : 'Confirm Registration'}
                        </button>
                        
                        {editingTable && (
                          <button 
                            type="button"
                            onClick={() => handleDelete(editingTable.id)}
                            className="w-full mt-3 py-4 text-red-500 font-bold text-sm hover:bg-red-50 rounded-2xl transition-all flex items-center justify-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" /> Delete Table
                          </button>
                        )}
                     </div>
                  </form>
               </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AdminTables;

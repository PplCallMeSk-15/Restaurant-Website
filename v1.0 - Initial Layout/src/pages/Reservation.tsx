import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Calendar, Clock, Users, ChevronRight, CheckCircle2, Mail, Utensils } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { subscribeToSettings } from '../services/settingsService';
import { sendEmail } from '../services/emailService';
import { clientTriggerEmail } from '../services/clientEmailTrigger';

import { assignTables } from '../services/tableService';
import { ChefLoader } from '../components/ChefLoader';

import { useVirtualTime } from '../hooks/useVirtualTime';
import { formatTo12Hour, parseTime } from '../utils/timeUtils';
import { validatePhoneNumber, sanitizePhoneInput } from '../utils/validation';

const Reservation = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const virtualNow = useVirtualTime();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [success, setSuccess] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [assignedTables, setAssignedTables] = useState<string[]>([]);
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [maxPartySize, setMaxPartySize] = useState(10);
  
  const [formData, setFormData] = useState({
    name: profile?.displayName || '',
    email: user?.email || '',
    phone: '',
    date: '',
    time: '',
    guests: 2,
  });

  useEffect(() => {
    if (profile) {
      setFormData(prev => ({
        ...prev,
        name: prev.name || profile.fullName || profile.displayName || '',
        email: prev.email || profile.email || user?.email || '',
        phone: prev.phone || profile.phone || '',
      }));
    }
  }, [profile, user]);

  useEffect(() => {
    const unsubscribe = subscribeToSettings((settings) => {
      // Logic moved to a separate function or handled inside setTimeSlots
      setSettings(settings);
      setMaxPartySize(settings.maxPartySize);
    });
    return () => unsubscribe();
  }, []);

  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    if (!settings || !formData.date) return;
    
    const dateObj = new Date(formData.date);
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    
    const daySlots = settings.daySlots?.[dayName] || settings.timeSlots || [];
    setTimeSlots(daySlots);
  }, [formData.date, settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Please login to book a table');
      navigate('/login');
      return;
    }

    if (!formData.name || !formData.phone) {
      toast.error('Please enter name and phone number for contact verification');
      return;
    }

    if (!validatePhoneNumber(formData.phone)) {
      toast.error('Invalid phone number! Please supply a standard 10-digit Indian mobile number (without any prefix or whitespace).');
      return;
    }

    if (!formData.time) {
      toast.error('Please select a time slot');
      return;
    }

    setChecking(true);
    setAvailabilityError(null);
    
    try {
      const assigned = await assignTables(formData.date, formData.time, formData.guests);
      
      if (!assigned) {
        setAvailabilityError('Sorry, no table combinations available for this party size at this time.');
        setChecking(false);
        return;
      }

      setAssignedTables(assigned);
      setChecking(false);
      setLoading(true);

      const resDocRef = await addDoc(collection(db, 'reservations'), {
        ...formData,
        userId: user.uid,
        status: 'pending',
        assignedTables: assigned,
        createdAt: serverTimestamp(),
      });

      setSuccess(true);
      toast.success('Reservation request sent!');

      // Trigger Reservation Received email notification directly from client
      clientTriggerEmail(
        formData.email,
        formData.name,
        'Reservation Request Received 🌿',
        `Thank you for choosing us! We have successfully received your table reservation request. Please note that your booking is currently in pending status. Our host team is reviewing your details, and you will receive a confirmation email containing your locked tables once we accept the booking.`,
        'RESERVATION_RECEIVED',
        resDocRef.id,
        'reservationId',
        {
          reservationId: resDocRef.id,
          reservationDate: formData.date,
          reservationTime: formData.time,
          guestCount: formData.guests
        }
      ).catch(err => console.warn('[Client Email Trigger] Reservation received email failed:', err));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'reservations');
    } finally {
      setLoading(false);
      setChecking(false);
    }
  };

  const isSlotPast = (time: string) => {
    const todayStr = virtualNow.getFullYear() + '-' + String(virtualNow.getMonth() + 1).padStart(2, '0') + '-' + String(virtualNow.getDate()).padStart(2, '0');
    if (formData.date !== todayStr) return false;

    const slotDate = parseTime(time, virtualNow);
    return slotDate.getTime() <= virtualNow.getTime();
  };

  if (loading) {
    return <ChefLoader message="Securing your beautiful slot in the reservation book... 📖✨" />;
  }

  return (
    <div className="min-h-screen pt-20 pb-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-16 items-start">
          {/* Info Side */}
          <div className="lg:w-1/2">
             <div className="sticky top-28">
                <span className="text-orange-600 font-bold uppercase tracking-widest text-sm mb-4 block">Table Booking</span>
                <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-8 leading-tight">Book Your <span className="italic underline selection:bg-orange-200">Experience</span></h1>
                <p className="text-lg text-gray-600 mb-12 leading-relaxed max-w-lg">
                   Join us for an unforgettable evening of spices and flavors. We recommend booking at least 24 hours in advance for weekend dinners.
                </p>

                <div className="space-y-8">
                   <div className="flex items-start space-x-6">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-orange-600 shadow-sm shrink-0">
                         <Mail className="w-6 h-6" />
                      </div>
                      <div>
                         <h4 className="font-bold text-gray-900 mb-1">Instant Confirmation</h4>
                         <p className="text-gray-500">We'll notify you via gmail within 15 minutes of booking check.</p>
                      </div>
                   </div>
                   <div className="flex items-start space-x-6">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-orange-600 shadow-sm shrink-0">
                         <Utensils className="w-6 h-6" />
                      </div>
                      <div>
                         <h4 className="font-bold text-gray-900 mb-1">Incredible Dining</h4>
                         <p className="text-gray-500">Enjoy access to our cozy indoor spaces and scenic garden seating.</p>
                      </div>
                   </div>
                </div>
             </div>
          </div>

          {/* Form Side */}
          <div className="lg:w-1/2 w-full">
            {settings?.reservationsEnabled === false ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white p-8 md:p-12 rounded-[3.5rem] shadow-xl border border-gray-100 text-center flex flex-col items-center justify-center min-h-[400px]"
              >
                <div className="w-12 h-12 bg-orange-150 text-orange-600 rounded-2xl flex items-center justify-center mb-6 shadow-inner animate-pulse">
                  <Calendar className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight mb-3">Reservations Temporarily Closed</h3>
                <p className="text-gray-500 font-semibold text-sm leading-relaxed max-w-sm mb-6">
                  We are currently not accepting new online table reservations. We apologize for any inconvenience. Please check back later or contact us directly at <span className="font-bold text-gray-950 font-mono">{settings?.contactNumber || '+91 9876543210'}</span>.
                </p>
                <div className="px-6 py-2.5 bg-orange-100/50 text-orange-900 text-xs font-black uppercase tracking-widest rounded-xl">
                  Closed by Administration
                </div>
              </motion.div>
            ) : (
              <motion.div 
                 initial={{ opacity: 0, x: 20 }}
                 animate={{ opacity: 1, x: 0 }}
                 className="bg-white p-8 md:p-12 rounded-[3.5rem] shadow-xl shadow-gray-200/50 border border-gray-100"
              >
                <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 ml-1 uppercase tracking-tight">Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="John Doe"
                      className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all text-gray-900 font-medium"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 ml-1 uppercase tracking-tight">Phone Number</label>
                    <input
                      type="tel"
                      inputMode="tel"
                      required
                      placeholder="9876543210"
                      className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all text-gray-900 font-medium"
                      maxLength={10}
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: sanitizePhoneInput(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 ml-1 uppercase tracking-tight">Date</label>
                    <div className="relative">
                       <Calendar className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                       <input
                        type="date"
                        required
                        className="w-full pl-14 pr-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all text-gray-900 font-medium"
                        value={formData.date}
                        onChange={(e) => {
                          const newDate = e.target.value;
                          setFormData({ ...formData, date: newDate, time: '' }); // Reset time when date changes
                        }}
                        min={virtualNow.getFullYear() + '-' + String(virtualNow.getMonth() + 1).padStart(2, '0') + '-' + String(virtualNow.getDate()).padStart(2, '0')}
                      />
                    </div>
                  </div>
                   <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 ml-1 uppercase tracking-tight">Guests</label>
                    <div className="relative">
                       <Users className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                       <select
                        required
                        className="w-full pl-14 pr-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all text-gray-900 font-medium appearance-none"
                        value={formData.guests}
                        onChange={(e) => setFormData({ ...formData, guests: parseInt(e.target.value) })}
                      >
                         {Array.from({ length: maxPartySize }, (_, i) => i + 1).map(n => (
                           <option key={n} value={n}>{n} Guests</option>
                         ))}
                       </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                   <div className="flex justify-between items-center ml-1">
                      <label className="text-sm font-bold text-gray-700 uppercase tracking-tight">Preferred Time</label>
                      {checking && <div className="w-4 h-4 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />}
                   </div>
                   <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {timeSlots.map(time => {
                         const past = isSlotPast(time);
                         return (
                           <button
                             key={time}
                             type="button"
                             disabled={past}
                             onClick={() => setFormData({...formData, time})}
                             className={`py-4 px-2 rounded-2xl text-sm font-bold transition-all border flex flex-col items-center justify-center gap-0.5 ${
                                past
                                ? 'bg-red-50 text-red-300 border-red-100 cursor-not-allowed opacity-60'
                                : formData.time === time 
                                ? 'bg-orange-600 text-white border-orange-600 shadow-lg shadow-orange-100'
                                : 'bg-white text-gray-700 border-gray-100 hover:border-orange-200 hover:text-orange-600'
                             }`}
                           >
                               {time}
                               {past && <span className="text-[8px] uppercase tracking-tighter block leading-none">Past Time</span>}
                           </button>
                         );
                      })}
                      {timeSlots.length === 0 && formData.date && (
                        <div className="col-span-full py-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                          <p className="text-gray-400 text-sm font-medium">No available slots for the selected date.</p>
                        </div>
                      )}
                   </div>
                   {availabilityError && (
                     <motion.p 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-red-500 text-xs font-bold mt-2 ml-1"
                     >
                        {availabilityError}
                     </motion.p>
                   )}
                </div>

                <button
                  type="submit"
                  disabled={loading || checking}
                  className={`w-full py-5 rounded-[2rem] font-bold text-xl flex items-center justify-center transition-all mt-4 ${
                    loading || checking
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-orange-600 text-white hover:bg-orange-700 shadow-xl shadow-orange-100 active:scale-95'
                  }`}
                >
                  {loading ? (
                    'Processing booking...'
                  ) : checking ? (
                    'Checking availability...'
                  ) : (
                    <>
                      Confirm Reservation <ChevronRight className="ml-2 w-6 h-6" />
                    </>
                  )}
                </button>
              </form>
            </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Success Modal */}
      <AnimatePresence>
        {success && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setSuccess(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white p-8 md:p-10 rounded-[3rem] shadow-2xl text-center border border-gray-100"
            >
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-3xl font-bold mb-4">Request Received!</h2>
              <div className="bg-orange-50 p-4 rounded-2xl mb-6">
                 <p className="text-xs font-bold text-orange-600 uppercase tracking-widest mb-1">Assigned Tables</p>
                 <p className="text-2xl font-black text-orange-900">{assignedTables.join(', ')}</p>
              </div>
              <p className="text-gray-600 mb-8 leading-relaxed">
                Your table reservation for <span className="font-bold text-gray-900">{formData.date}</span> at <span className="font-bold text-gray-900">{formData.time}</span> is being processed.
              </p>
              <div className="space-y-3">
                 <button 
                    onClick={() => navigate('/orders', { state: { tab: 'reservations' } })}
                    className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold hover:bg-orange-600 transition-all shadow-lg active:scale-95"
                  >
                    View My Bookings
                  </button>
                  <button 
                    onClick={() => {
                      setSuccess(false);
                      navigate('/orders', { state: { tab: 'reservations' } });
                    }}
                    className="w-full bg-gray-100 text-gray-600 py-4 rounded-2xl font-bold hover:bg-gray-200 transition-all active:scale-95"
                  >
                    Got it
                  </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Reservation;

import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Reservation } from '../types';
import { Clock, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parseTime } from '../utils/timeUtils';
import { subscribeToSettings, getCurrentSystemTime, AppSettings } from '../services/settingsService';

const ReservationBanner = () => {
  const { user, profile, isAdmin } = useAuth();
  const { pathname } = useLocation();
  const isProfileIncomplete = user && !isAdmin && (!profile?.address || profile?.phone === '' || profile?.latitude === null);
  const showReminder = isProfileIncomplete && pathname !== '/profile-setup' && pathname !== '/profile';
  const [activeReservation, setActiveReservation] = useState<Reservation | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    return subscribeToSettings((settings) => {
      setAppSettings(settings);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setActiveReservation(null);
      return;
    }

    const q = query(
      collection(db, 'reservations'),
      where('userId', '==', user.uid),
      where('status', '==', 'confirmed')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = getCurrentSystemTime(appSettings);
      const reservations = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Reservation))
        .filter(res => {
          try {
            const [year, month, day] = res.date.split('-').map(Number);
            const baseDate = new Date(year, month - 1, day);
            const resDate = parseTime(res.time, baseDate);
            return resDate.getTime() > now.getTime();
          } catch (e) {
            return false;
          }
        })
        .sort((a, b) => {
          const [yA, mA, dA] = a.date.split('-').map(Number);
          const [yB, mB, dB] = b.date.split('-').map(Number);
          const dateA = parseTime(a.time, new Date(yA, mA - 1, dA)).getTime();
          const dateB = parseTime(b.time, new Date(yB, mB - 1, dB)).getTime();
          return dateA - dateB;
        });

      if (reservations.length > 0) {
        const nextRes = reservations[0];
        setActiveReservation(prev => {
          if (prev?.id !== nextRes.id) {
            setIsVisible(true);
          }
          return nextRes;
        });
      } else {
        setActiveReservation(null);
      }
    });

    return () => unsubscribe();
  }, [user, appSettings]);

  useEffect(() => {
    if (!activeReservation) {
      setTimeLeft('');
      return;
    }

    const calculateTime = () => {
      const now = getCurrentSystemTime(appSettings);
      const [year, month, day] = activeReservation.date.split('-').map(Number);
      const target = parseTime(activeReservation.time, new Date(year, month - 1, day));
      
      const diffMs = target.getTime() - now.getTime();

      if (diffMs <= 0) {
        setTimeLeft('');
        setActiveReservation(null);
        return;
      }

      const totalSecs = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSecs / 3600);
      const mins = Math.floor((totalSecs % 3600) / 60);
      const secs = totalSecs % 60;

      const parts = [];
      if (hours > 0) parts.push(`${hours}h`);
      if (mins > 0 || hours > 0) parts.push(`${mins}m`);
      parts.push(`${secs}s`);

      setTimeLeft(parts.join(' '));
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [activeReservation, appSettings]);

  if (!isVisible || !activeReservation || !timeLeft) return null;

  const isImminent = (() => {
    if (!activeReservation) return false;
    const [year, month, day] = activeReservation.date.split('-').map(Number);
    const target = parseTime(activeReservation.time, new Date(year, month - 1, day));
    const now = getCurrentSystemTime(appSettings);
    return (target.getTime() - now.getTime()) <= 3600000; // 1 hour
  })();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -50, opacity: 0 }}
        className={`fixed ${showReminder ? 'top-[8.25rem] sm:top-[7.75rem]' : 'top-[5.5rem]'} left-1/2 -translate-x-1/2 z-[100] w-full max-w-lg px-4 pointer-events-none transform-gpu transition-all duration-300`}
      >
        <div className={`bg-white border-2 rounded-3xl shadow-2xl p-4 flex items-center justify-between gap-4 pointer-events-auto overflow-hidden relative ${
          isImminent ? 'border-red-500 bg-red-50/10' : 'border-orange-500 bg-orange-50/10'
        }`}>
          <div className="flex items-center gap-3">
             <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${
               isImminent ? 'bg-red-600 text-white' : 'bg-orange-600 text-white'
             }`}>
               <Clock className="w-6 h-6 animate-pulse" />
             </div>
             <div>
                <p className="text-xs font-black text-gray-900 uppercase tracking-tighter">Your Table is Ready!</p>
                <div className="flex items-center gap-2">
                   <p className={`text-lg font-black font-mono tracking-tighter ${isImminent ? 'text-red-600' : 'text-orange-600'}`}>
                     {timeLeft}
                   </p>
                   <span className="text-[10px] font-bold text-gray-400 uppercase">remaining</span>
                </div>
             </div>
          </div>

          <div className="flex items-center gap-2 pl-4 border-l border-gray-100">
             <div className="hidden sm:block text-right">
                <p className="text-[10px] font-black text-gray-400 uppercase leading-none mb-0.5">Reservation</p>
                <p className="text-xs font-bold text-gray-900">{activeReservation.time}</p>
             </div>
             <button 
               onClick={() => setIsVisible(false)}
               className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-400 hover:text-gray-900"
             >
               <X className="w-5 h-5" />
             </button>
          </div>

          {/* Progress bar background */}
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gray-100">
            <motion.div 
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 3600, ease: "linear" }}
              className={`h-full origin-left ${isImminent ? 'bg-red-500' : 'bg-orange-500'}`}
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ReservationBanner;


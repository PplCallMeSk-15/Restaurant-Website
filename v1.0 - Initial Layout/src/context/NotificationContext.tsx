import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { Reservation } from '../types';

interface NotificationContextType {
  pendingOrdersCount: number;
  pendingReservationsCount: number;
  activeUserOrdersCount: number;
  activeUserReservationsCount: number;
  userReservationBadgeColor: 'orange' | 'green' | 'red' | 'none';
}

const NotificationContext = createContext<NotificationContextType>({
  pendingOrdersCount: 0,
  pendingReservationsCount: 0,
  activeUserOrdersCount: 0,
  activeUserReservationsCount: 0,
  userReservationBadgeColor: 'none',
});

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAdmin } = useAuth();
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [pendingReservationsCount, setPendingReservationsCount] = useState(0);
  const [activeUserOrdersCount, setActiveUserOrdersCount] = useState(0);
  const [activeUserReservationsCount, setActiveUserReservationsCount] = useState(0);
  const [userReservationBadgeColor, setUserReservationBadgeColor] = useState<'orange' | 'green' | 'red' | 'none'>('none');

  useEffect(() => {
    if (!isAdmin) {
      setPendingOrdersCount(0);
      setPendingReservationsCount(0);
      return;
    }

    // Admin: Pending Orders
    const ordersQuery = query(collection(db, 'orders'), where('status', 'in', ['pending', 'Ready For Delivery']));
    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      setPendingOrdersCount(snapshot.size);
    });

    // Admin: Pending/New Reservations
    const resQuery = query(collection(db, 'reservations'), where('status', '==', 'pending'));
    const unsubscribeReservations = onSnapshot(resQuery, (snapshot) => {
      setPendingReservationsCount(snapshot.size);
    });

    return () => {
      unsubscribeOrders();
      unsubscribeReservations();
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!user || isAdmin) {
      setActiveUserOrdersCount(0);
      setActiveUserReservationsCount(0);
      setUserReservationBadgeColor('none');
      return;
    }

    // User: Active Orders (Preparing/Confirmed/Pending)
    const activeOrdersQuery = query(
      collection(db, 'orders'),
      where('userId', '==', user.uid),
      where('status', 'in', ['pending', 'confirmed', 'preparing'])
    );

    const unsubscribeUserOrders = onSnapshot(activeOrdersQuery, (snapshot) => {
      setActiveUserOrdersCount(snapshot.size);
    });

    // User: Active Reservations (Pending/Confirmed)
    const activeResQuery = query(
      collection(db, 'reservations'),
      where('userId', '==', user.uid),
      where('status', 'in', ['pending', 'confirmed'])
    );

    const unsubscribeUserReservations = onSnapshot(activeResQuery, (snapshot) => {
      const reservations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Reservation);
      
      const updateBadge = () => {
        const now = new Date();
        let count = 0;
        let priorityColor: 'orange' | 'green' | 'red' | 'none' = 'none';

        reservations.forEach(res => {
          const resDateTime = new Date(`${res.date}T${res.time}`);
          const diffMs = resDateTime.getTime() - now.getTime();
          const diffHours = diffMs / (1000 * 60 * 60);

          const isImminent = res.status === 'confirmed' && diffHours <= 1 && diffHours > 0;
          const isConfirmedUnseen = res.status === 'confirmed' && !res.seenByGuest && !isImminent;
          const isPending = res.status === 'pending';

          if (isImminent) {
            count++;
            priorityColor = 'red';
          } else if (isConfirmedUnseen) {
            count++;
            if (priorityColor !== 'red') priorityColor = 'green';
          } else if (isPending) {
            count++;
            if (priorityColor !== 'red' && priorityColor !== 'green') priorityColor = 'orange';
          }
        });

        setActiveUserReservationsCount(count);
        setUserReservationBadgeColor(priorityColor);
      };

      updateBadge();
      const interval = setInterval(updateBadge, 60000); // Re-check every minute for imminent

      return () => clearInterval(interval);
    });

    return () => {
      unsubscribeUserOrders();
      unsubscribeUserReservations();
    };
  }, [user, isAdmin]);

  return (
    <NotificationContext.Provider value={{ 
      pendingOrdersCount, 
      pendingReservationsCount,
      activeUserOrdersCount,
      activeUserReservationsCount,
      userReservationBadgeColor
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

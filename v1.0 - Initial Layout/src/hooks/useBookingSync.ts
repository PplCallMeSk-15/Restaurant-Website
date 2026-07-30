import { useEffect } from 'react';
import { syncTableStatuses } from '../services/bookingSyncService';
import { useAuth } from '../context/AuthContext';

export const useBookingSync = () => {
  const { isAdmin } = useAuth();

  useEffect(() => {
    if (!isAdmin) return;

    // Run sync immediately on mount
    syncTableStatuses();

    // Run sync every 30 seconds
    const interval = setInterval(() => {
      syncTableStatuses();
    }, 30000);

    return () => clearInterval(interval);
  }, [isAdmin]);
};

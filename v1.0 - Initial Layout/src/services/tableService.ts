import { db } from '../firebase/config';
import { collection, getDocs, query, where, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { Table, Reservation } from '../types';
import { getCurrentSystemTime, getAppSettings } from './settingsService';
import { parseTime } from '../utils/timeUtils';

import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export const getTables = async (): Promise<Table[]> => {
  try {
    const snapshot = await getDocs(collection(db, 'tables'));
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Table));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'tables');
    return [];
  }
};

export const initializeTables = async () => {
  // Logic removed: Admin should add tables manually after a reset.
};

/**
 * Advanced Reservation Rule Logic
 */
export const getUpcomingWarning = (tableName: string, reservations: Reservation[], now: Date): Reservation | null => {
  const upcoming = reservations.filter(r => {
    if (r.status !== 'confirmed' || !r.assignedTables?.includes(tableName)) return false;
    
    const resTime = parseTime(r.time, now);
    const diffMins = (resTime.getTime() - now.getTime()) / (1000 * 60);
    
    // Warning only between 10 and 60 minutes before
    return diffMins > 10 && diffMins <= 60;
  });

  return upcoming.sort((a, b) => {
    const timeA = parseTime(a.time, now).getTime();
    const timeB = parseTime(b.time, now).getTime();
    return timeA - timeB;
  })[0] || null;
};

export const getActiveReservationForTable = async (tableName: string): Promise<Reservation | null> => {
  try {
    const settings = await getAppSettings();
    const now = getCurrentSystemTime(settings);
    
    const formatDate = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${da}`;
    };
    
    const todayStr = formatDate(now);
    
    // Find confirmed or seated reservations for today that include this table
    const q = query(
      collection(db, 'reservations'),
      where('date', '==', todayStr),
      where('status', 'in', ['confirmed', 'seated'])
    );
    
    const snapshot = await getDocs(q);
    const reservations = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Reservation));
    
    // Filter for those assigned to this table
    const relevant = reservations.filter(r => r.assignedTables?.includes(tableName));
    
    if (relevant.length === 0) return null;
  
    // Find the most relevant one (closest to current time)
    return relevant.sort((a, b) => {
      const timeA = parseTime(a.time, now).getTime();
      const timeB = parseTime(b.time, now).getTime();
      return timeA - timeB;
    })[0];
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'reservations');
    return null;
  }
};

export const canMarkTableFree = (table: Table, reservation: Reservation | null, now: Date): { allowed: boolean; reason?: string } => {
  if (!reservation) return { allowed: true };
  
  // Rule: If already seated, or table is occupied for this reservation, ignore all grace period logic
  if (reservation.status === 'seated' || (table.status === 'occupied' && reservation.status === 'confirmed')) {
    return { allowed: true };
  }
  
  if (reservation.status === 'cancelled' || reservation.status === 'rejected' || reservation.status === 'completed') {
    return { allowed: true };
  }

  const resTime = parseTime(reservation.time, now);
  if (!resTime) return { allowed: true };

  const tenMinsBefore = new Date(resTime.getTime() - 10 * 60 * 1000);
  const tenMinsAfter = new Date(resTime.getTime() + 10 * 60 * 1000);
  
  // LOCK WINDOW: 10 mins before to 10 mins after
  // If we are in this window, we block marking the table as free
  if (now >= tenMinsBefore && now < tenMinsAfter) {
    return { 
      allowed: false, 
      reason: `Reservation active. Grace period ends at ${tenMinsAfter.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    };
  }

  // If we are BEFORE the lock window (e.g., 30 mins before), 
  // we allow marking as free (admin handles walk-ins or setup).
  // If we are AFTER the grace period, we allow marking as free (no-show).
  return { allowed: true };
};

export const assignTables = async (date: string, timeSlot: string, guests: number): Promise<string[] | null> => {
  try {
    // 1. Fetch all tables
    const tablesSnapshot = await getDocs(collection(db, 'tables'));
    if (tablesSnapshot.empty) {
      return null;
    }
    
    const allTables = tablesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Table));
  
    // 2. Fetch reservations for same slot
    const resQuery = query(
      collection(db, 'reservations'),
      where('date', '==', date),
      where('time', '==', timeSlot),
      where('status', 'in', ['pending', 'confirmed'])
    );
    const resSnapshot = await getDocs(resQuery);
    
    // 3. Extract assigned tables
    const occupiedTableIds = new Set<string>();
    resSnapshot.docs.forEach(doc => {
      const data = doc.data() as Reservation;
      if (data.assignedTables) {
        data.assignedTables.forEach(id => occupiedTableIds.add(id));
      }
    });
  
    // 4. Filter available tables (Must be marked as FREE in the master table list)
    const availableTables = allTables.filter(t => !occupiedTableIds.has(t.name) && t.status === 'free');
  
    // 5. Strategy: Best single fit
    const sortedTables = availableTables.sort((a, b) => a.capacity - b.capacity);
    
    const singleFit = sortedTables.find(t => t.capacity >= guests);
    if (singleFit) {
      return [singleFit.name];
    }
  
    // 6. Strategy: Combine multiple tables
    let currentCapacity = 0;
    const combinedTables: string[] = [];
    
    // Start with smallest tables to maximize availability of large tables? 
    // Actually, combining tables usually means moving them together.
    for (const table of sortedTables) {
      combinedTables.push(table.name);
      currentCapacity += table.capacity;
      if (currentCapacity >= guests) {
        return combinedTables;
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'tables');
  }

  return null; // No availability
};

export const updateAssignedTablesStatus = async (tableNames: string[], status: 'free' | 'occupied') => {
  try {
    const q = query(collection(db, 'tables'), where('name', 'in', tableNames));
    const snapshot = await getDocs(q);
    
    const promises = snapshot.docs.map(tableDoc => 
      updateDoc(doc(db, 'tables', tableDoc.id), { status })
    );
    
    await Promise.all(promises);
  } catch (error) {
    console.error('Failed to update table statuses:', error);
  }
};

export const addTable = async (data: Omit<Table, 'id' | 'createdAt'>) => {
  try {
    const tablesCol = collection(db, 'tables');
    const newRef = doc(tablesCol);
    await setDoc(newRef, {
      ...data,
      id: newRef.id,
      createdAt: serverTimestamp()
    });
    return newRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'tables');
  }
};

export const updateTable = async (id: string, data: Partial<Table>) => {
  try {
    const tableRef = doc(db, 'tables', id);
    await updateDoc(tableRef, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `tables/${id}`);
  }
};

export const deleteTable = async (id: string) => {
  try {
    console.log('Attempting to delete table with ID:', id);
    if (!id) throw new Error('Table ID is missing');
    const tableRef = doc(db, 'tables', id);
    await deleteDoc(tableRef);
    console.log('Table successfully deleted');
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `tables/${id}`);
  }
};

export const toggleTableStatus = async (id: string, currentStatus: 'free' | 'occupied') => {
  const newStatus = currentStatus === 'free' ? 'occupied' : 'free';
  await updateTable(id, { status: newStatus });
};

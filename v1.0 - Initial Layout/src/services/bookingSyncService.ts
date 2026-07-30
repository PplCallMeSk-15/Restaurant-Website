import { db } from '../firebase/config';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { Reservation, Table } from '../types';
import { getAppSettings } from './settingsService';
import { parseTime } from '../utils/timeUtils';

import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export const syncTableStatuses = async () => {
  console.log('Syncing table statuses based on reservations...');
  
  try {
    const settings = await getAppSettings();
    let now = new Date();

    if (settings.useManualTime && settings.manualTime && settings.manualDate && settings.manualTimeSetAt) {
      const [year, month, day] = settings.manualDate.split('-').map(Number);
      const baseDate = new Date(year, month - 1, day);
      
      const baseVirtualTime = parseTime(settings.manualTime, baseDate).getTime();
      const timeElapsed = Date.now() - settings.manualTimeSetAt;
      now = new Date(baseVirtualTime + timeElapsed);
    }
    
    const formatDate = (d: Date) => {
      const y = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      return `${y}-${month}-${date}`;
    };

    const todayStr = formatDate(now);
    
    // 1. Get all confirmed reservations for today (to lock booths)
    // AND get seated reservations (just for reference if needed)
    let activeReservations: Reservation[] = [];
    try {
      const resQuery = query(
        collection(db, 'reservations'),
        where('date', '==', todayStr),
        where('status', 'in', ['confirmed', 'seated', 'pending'])
      );
      const resSnapshot = await getDocs(resQuery);
      activeReservations = resSnapshot.docs.map(d => ({ ...d.data(), id: d.id } as Reservation));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'reservations');
    }
    
    // 2. Get all tables
    let allTables: Table[] = [];
    try {
      const tablesSnapshot = await getDocs(collection(db, 'tables'));
      allTables = tablesSnapshot.docs.map(d => ({ ...d.data(), id: d.id } as Table));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'tables');
    }
    
    const batch = writeBatch(db);
    let updatesCount = 0;

    // 3. Automated No-Show Cleanup
    for (const res of activeReservations) {
      if (res.status === 'confirmed' || res.status === 'pending') {
        const resTime = parseTime(res.time, now);
        if (resTime) {
          const tenMinsAfter = new Date(resTime.getTime() + 10 * 60 * 1000);
          if (now > tenMinsAfter) {
            // Auto Mark as No-Show
            const resRef = doc(db, 'reservations', res.id);
            batch.update(resRef, { status: 'no-show' });
            updatesCount++;
            
            // Also ensure tables are freed if they were booked
            if (res.assignedTables) {
              for (const tableName of res.assignedTables) {
                const table = allTables.find(t => t.name === tableName);
                if (table && table.status === 'booked') {
                  const tableRef = doc(db, 'tables', table.id);
                  batch.update(tableRef, { status: 'free' });
                }
              }
            }
          }
        }
      }
    }

    // 4. For each table, determine if it needs to be locked (marked as "booked")
    const confirmedReservations = activeReservations.filter(r => r.status === 'confirmed');
    
    for (const table of allTables) {
      // Find confirmed reservations assigned to this table
      const relevantRes = confirmedReservations.filter(r => 
        r.assignedTables?.includes(table.name) || r.assignedTables?.includes(table.id)
      );

      let shouldBeBooked = false;

      for (const res of relevantRes) {
        const resTime = parseTime(res.time, now);
        if (!resTime) continue;

        const tenMinsBefore = new Date(resTime.getTime() - 10 * 60 * 1000);
        
        // Lock window: From 10 mins before until the reservation starts
        if (now >= tenMinsBefore && now < resTime && table.status === 'free') {
          shouldBeBooked = true;
          break;
        }
      }

      // Update if status needs to become "booked"
      if (shouldBeBooked && table.status === 'free') {
        const tableRef = doc(db, 'tables', table.id);
        batch.update(tableRef, { status: 'booked' });
        updatesCount++;
      }
    }

    if (updatesCount > 0) {
      try {
        await batch.commit();
        console.log(`Synced ${updatesCount} table statuses.`);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'tables-batch-update');
      }
    }
  } catch (error) {
    console.error('Error syncing table statuses:', error);
    // If it's already a FirestoreErrorInfo JSON, it was already handled by handleFirestoreError
  }
};

import { db } from '../firebase/config';
import { 
  collection, 
  getDocs, 
  deleteDoc, 
  doc, 
  writeBatch,
  query,
  where,
  updateDoc 
} from 'firebase/firestore';
import { initializeTables } from './tableService';
import { Reservation } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { triggerReservationEmailForStatus } from './clientEmailTrigger';

const ADMIN_EMAILS = ['example@gmail.com', 'admin@gmail.com'];

export const resetDatabase = async () => {
  const collectionsToClear = ['reservations', 'orders', 'tables', 'menu_items', 'feedback'];
  
  try {
    for (const colName of collectionsToClear) {
      let snapshot;
      try {
        const q = query(collection(db, colName));
        snapshot = await getDocs(q);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, colName);
        return; // handleFirestoreError throws, but just in case
      }
      
      const batch = writeBatch(db);
      snapshot.docs.forEach((d) => {
        batch.delete(doc(db, colName, d.id));
      });

      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, colName);
      }
      console.log(`Cleared collection: ${colName}`);
    }

    // Clear users except admins
    let usersSnapshot;
    try {
      const usersCol = collection(db, 'users');
      usersSnapshot = await getDocs(usersCol);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'users');
      return;
    }

    const userBatch = writeBatch(db);
    usersSnapshot.docs.forEach((userDoc) => {
      const userData = userDoc.data();
      if (!ADMIN_EMAILS.includes(userData.email)) {
        userBatch.delete(doc(db, 'users', userDoc.id));
        if (userData.email) {
          userBatch.delete(doc(db, 'registered_emails', userData.email.toLowerCase().trim()));
        }
      }
    });

    try {
      await userBatch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    }
    console.log('Cleared non-admin users');

    return true;
  } catch (error) {
    console.error('Reset failed:', error);
    throw error;
  }
};

export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'rejected' | 'completed' | 'seated' | 'no-show';

export const updateReservationStatus = async (id: string, status: ReservationStatus) => {
  try {
    const reservationRef = doc(db, 'reservations', id);
    const { getDoc } = await import('firebase/firestore');
    const resSnap = await getDoc(reservationRef);
    
    if (!resSnap.exists()) throw new Error('Reservation not found');
    const resData = resSnap.data() as Reservation;

    if (status === 'cancelled' && resData.status === 'confirmed') {
      throw new Error('Confirmed reservations cannot be cancelled. Contact customer directly.');
    }

    if (status === 'seated' && resData.assignedTables && resData.assignedTables.length > 0) {
      // Check if any of the assigned tables are already occupied
      const { getTables } = await import('./tableService');
      const allTables = await getTables();
      const occupiedTables = allTables.filter(t => 
        resData.assignedTables!.includes(t.name) && t.status === 'occupied'
      );

      if (occupiedTables.length > 0) {
        throw new Error(`Please mark table ${occupiedTables.map(t => t.name).join(', ')} as FREE before seating the reserved guest.`);
      }
    }

    await updateDoc(reservationRef, { status });

    // Trigger client-side reservation status email notification
    triggerReservationEmailForStatus(id, status).catch(err =>
      console.warn('[Client Email Trigger] Failed to send reservation status email:', err)
    );
    
    // Logic for table synchronization during status changes
    if (resData.assignedTables && resData.assignedTables.length > 0) {
      const { updateAssignedTablesStatus } = await import('./tableService');
      
      if (status === 'seated') {
        // Seated = table occupied
        await updateAssignedTablesStatus(resData.assignedTables, 'occupied');
      } else if (status === 'completed' || status === 'cancelled' || status === 'rejected' || status === 'no-show') {
        // Finished or cancelled = table free
        await updateAssignedTablesStatus(resData.assignedTables, 'free');
      }
    }

    // Trigger global floor sync
    const { syncTableStatuses } = await import('./bookingSyncService');
    await syncTableStatuses();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `reservations/${id}`);
    throw error;
  }
};

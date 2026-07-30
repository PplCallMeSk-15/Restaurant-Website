import { collection, getDocs, writeBatch, doc, query, where } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

/**
 * Resets the database by clearing all major collections.
 * Preserves admin users if possible.
 */
export const resetDatabase = async () => {
    const adminEmail = auth.currentUser?.email;
    if (!adminEmail) throw new Error("User must be authenticated to reset database");

    const collectionsToClear = [
        'tables',
        'reservations',
        'orders',
        'menu_items',
        'notifications',
        'transactions',
        'timeSlots',
        'feedback'
    ];

    try {
        const batch = writeBatch(db);
        let totalDeleted = 0;

        // 1. Clear standard collections
        for (const colName of collectionsToClear) {
            const colRef = collection(db, colName);
            const snapshot = await getDocs(colRef);
            snapshot.forEach((document) => {
                batch.delete(doc(db, colName, document.id));
                totalDeleted++;
            });
        }

        // Delete the global settings document so it regenerates on next boot with new inbuilt defaults
        batch.delete(doc(db, 'settings', 'general'));
        totalDeleted++;

        // 2. Clear non-admin users
        const usersRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersRef);
        usersSnapshot.forEach((userDoc) => {
            const userData = userDoc.data();
            const userEmailLower = userData.email?.toLowerCase();
            const currentAdminEmailLower = adminEmail.toLowerCase();
            
            // Preserve the current admin and anyone with 'admin' role
            if (userEmailLower !== currentAdminEmailLower && userData.role !== 'admin') {
                batch.delete(doc(db, 'users', userDoc.id));
                if (userEmailLower) {
                    batch.delete(doc(db, 'registered_emails', userEmailLower));
                }
                totalDeleted++;
            }
        });

        if (totalDeleted > 0) {
            await batch.commit();
        }
        
        return totalDeleted;
    } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'bulk-reset');
        throw error;
    }
};

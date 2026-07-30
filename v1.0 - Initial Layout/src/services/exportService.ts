import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import * as XLSX from 'xlsx';

export const exportDatabaseToJson = async () => {
  try {
    const collections = ['users', 'orders', 'reservations', 'tables', 'menu_items', 'feedback', 'settings', 'delivery_partners'];
    const workbook = XLSX.utils.book_new();

    for (const collectionName of collections) {
      const q = collection(db, collectionName);
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => {
        const docData = doc.data();
        // Flatten nested objects for better table visibility
        const flattened: Record<string, any> = { id: doc.id };
        
        Object.entries(docData).forEach(([key, value]) => {
          let processedValue: any = value;
          
          if (value && typeof value === 'object' && !(value instanceof Date)) {
            // Check if it's a Firestore Timestamp
            if (value && typeof (value as any).toDate === 'function') {
              processedValue = (value as any).toDate().toLocaleString();
            } else {
              processedValue = JSON.stringify(value);
            }
          }
          
          if (typeof processedValue === 'string' && processedValue.length > 32760) {
            processedValue = processedValue.slice(0, 32700) + '... [truncated to fit Excel limit]';
          }
          
          flattened[key] = processedValue;
        });
        
        return flattened;
      });

      if (data.length > 0) {
        const worksheet = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(workbook, worksheet, collectionName.charAt(0).toUpperCase() + collectionName.slice(1));
      }
    }

    // Generate Excel file
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    const exportFileDefaultName = `spice_garden_backup_${new Date().toISOString().split('T')[0]}.xlsx`;

    const url = window.URL.createObjectURL(data);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', url);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    window.URL.revokeObjectURL(url);
    
    return true;
  } catch (error) {
    console.error('Export failed:', error);
    throw error;
  }
};

import { db } from '../firebase/config';
import { 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot 
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export interface AppSettings {
  timeSlots: string[];
  daySlots?: { [key: string]: string[] }; // { 'Monday': ['12:00 PM', ...], ... }
  restaurantName: string;
  contactNumber: string;
  address: string;
  maxPartySize: number;
  useManualTime: boolean;
  manualTime: string; // "HH:mm" format
  manualDate?: string; // "YYYY-MM-DD" format
  manualTimeSetAt?: number; // timestamp when override was set
  restaurantLatitude?: number;
  restaurantLongitude?: number;
  deliveryRangeKm?: number;
  menuEnabled?: boolean;
  reservationsEnabled?: boolean;
  orderTimingEnabled?: boolean;
  orderStartTime?: string; // "HH:mm" format
  orderEndTime?: string; // "HH:mm" format
}

const SETTINGS_DOC_ID = 'general';
const COLLECTION_NAME = 'settings';

export const defaultSettings: AppSettings = {
  timeSlots: [
    '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM',
    '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM', '03:00 PM',
    '03:30 PM', '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM',
    '06:30 PM', '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM', '09:00 PM'
  ],
  daySlots: {
    'Monday': [
      '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM',
      '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM', '03:00 PM',
      '03:30 PM', '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM',
      '06:30 PM', '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM', '09:00 PM'
    ],
    'Tuesday': [
      '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM',
      '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM', '03:00 PM',
      '03:30 PM', '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM',
      '06:30 PM', '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM', '09:00 PM'
    ],
    'Wednesday': [
      '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM',
      '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM', '03:00 PM',
      '03:30 PM', '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM',
      '06:30 PM', '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM', '09:00 PM'
    ],
    'Thursday': [
      '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM',
      '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM', '03:00 PM',
      '03:30 PM', '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM',
      '06:30 PM', '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM', '09:00 PM'
    ],
    'Friday': [
      '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM',
      '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM', '03:00 PM',
      '03:30 PM', '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM',
      '06:30 PM', '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM', '09:00 PM'
    ],
    'Saturday': [
      '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM',
      '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM', '03:00 PM',
      '03:30 PM', '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM',
      '06:30 PM', '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM', '09:00 PM'
    ],
    'Sunday': [
      '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM',
      '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM', '03:00 PM',
      '03:30 PM', '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM',
      '06:30 PM', '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM', '09:00 PM'
    ],
  },
  restaurantName: 'The Royal Spice',
  contactNumber: '+91 9876543210',
  address: '123 Spice Garden Landmark, Indiranagar, Bengaluru, Karnataka 560038',
  maxPartySize: 10,
  useManualTime: false,
  manualTime: '12:00',
  manualDate: new Date().toISOString().split('T')[0],
  manualTimeSetAt: Date.now(),
  restaurantLatitude: 12.9716, // Defaults to Bangalore central
  restaurantLongitude: 77.5946,
  deliveryRangeKm: 5,
  menuEnabled: true,
  reservationsEnabled: true,
  orderTimingEnabled: false,
  orderStartTime: '09:00',
  orderEndTime: '22:00',
};

export const getAppSettings = async (): Promise<AppSettings> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, SETTINGS_DOC_ID);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data() as AppSettings;
    } else {
      // Return defaults but don't try to save them here 
      // Initialization should happen in an admin-only context
      return defaultSettings;
    }
  } catch (error) {
    // If it's a permission error, we just return defaults silently for normal users
    // This often happens during first load or when rules are being applied
    return defaultSettings;
  }
};

/**
 * Calculates the current system time, taking into account the manual override if enabled.
 */
export const getCurrentSystemTime = (settings: AppSettings | null): Date => {
  const realNow = new Date();
  if (!settings || !settings.useManualTime || !settings.manualTimeSetAt) {
    return realNow;
  }

  try {
    const [year, month, day] = (settings.manualDate || realNow.toISOString().split('T')[0]).split('-').map(Number);
    const baseDate = new Date(year, month - 1, day);
    
    // Logic to parse the manual time (e.g., "14:30" or "02:30 PM")
    const parseTimeLocal = (timeStr: string, base: Date): Date => {
      const d = new Date(base);
      if (timeStr.includes(' ')) {
        const [time, modifier] = timeStr.split(' ');
        let [hours, minutes] = time.split(':').map(Number);
        if (modifier === 'PM' && hours < 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;
        d.setHours(hours, minutes, 0, 0);
      } else {
        const [hours, minutes] = timeStr.split(':').map(Number);
        d.setHours(hours, minutes, 0, 0);
      }
      return d;
    };

    const baseVirtualTime = parseTimeLocal(settings.manualTime, baseDate).getTime();
    const timeElapsed = Date.now() - settings.manualTimeSetAt;
    return new Date(baseVirtualTime + timeElapsed);
  } catch (e) {
    console.error('Error calculating virtual time:', e);
    return realNow;
  }
};

/**
 * Converts a 24-hour "HH:mm" string to 12-hour format with AM/PM (e.g., "09:00" -> "09:00 AM", "22:30" -> "10:30 PM")
 */
export const convert24to12 = (time24: string | undefined): string => {
  if (!time24) return '12:00 AM';
  const parts = time24.split(':');
  if (parts.length < 2) return time24;
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (isNaN(hours)) return time24;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12
  const hoursStr = hours < 10 ? `0${hours}` : `${hours}`;
  return `${hoursStr}:${minutes} ${ampm}`;
};

/**
 * Converts a 12-hour "hh:mm AM/PM" or similar string to 24-hour "HH:mm" format (e.g., "09:00 AM" -> "09:00", "10:30 PM" -> "22:30")
 */
export const convert12to24 = (time12: string | undefined): string => {
  if (!time12) return '09:00';
  const clean = time12.trim().toUpperCase();
  const ampm = clean.endsWith('PM') ? 'PM' : 'AM';
  const timeOnly = clean.replace(/(AM|PM)/g, '').trim();
  const parts = timeOnly.split(':');
  if (parts.length < 2) return '09:00';
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (isNaN(hours)) return '09:00';
  
  if (ampm === 'PM' && hours < 12) {
    hours += 12;
  }
  if (ampm === 'AM' && hours === 12) {
    hours = 0;
  }
  const hoursStr = hours < 10 ? `0${hours}` : `${hours}`;
  return `${hoursStr}:${minutes}`;
};

export const isOrderingOpen = (settings: AppSettings | null): boolean => {
  if (!settings) return true;
  if (settings.menuEnabled === false) return false;
  if (!settings.orderTimingEnabled) return true;

  try {
    const now = getCurrentSystemTime(settings);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = (settings.orderStartTime || '09:00').split(':').map(Number);
    const [endH, endM] = (settings.orderEndTime || '22:00').split(':').map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
    } else {
      // Over-midnight range
      return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
    }
  } catch (e) {
    console.error('Error checking food ordering hours:', e);
    return true;
  }
};

export const updateAppSettings = async (settings: Partial<AppSettings>) => {
  try {
    const docRef = doc(db, COLLECTION_NAME, SETTINGS_DOC_ID);
    await setDoc(docRef, settings, { merge: true });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${COLLECTION_NAME}/${SETTINGS_DOC_ID}`);
  }
};

export const subscribeToSettings = (callback: (settings: AppSettings) => void) => {
  const docRef = doc(db, COLLECTION_NAME, SETTINGS_DOC_ID);
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data() as AppSettings);
    } else {
      callback(defaultSettings);
    }
  }, (error) => {
    // Silently fallback to defaults for UI components
    callback(defaultSettings);
  });
};


/**
 * Converts a 24-hour time string (e.g., "14:30") to 12-hour format (e.g., "02:30 PM").
 */
export const formatTo12Hour = (time: string): string => {
  if (!time) return '';
  // If it already has AM/PM, it's already 12h format
  if (time.toUpperCase().includes('AM') || time.toUpperCase().includes('PM')) {
    return time;
  }
  
  const [hoursStr, minutesStr] = time.split(':');
  const hours = parseInt(hoursStr);
  const minutes = parseInt(minutesStr);
  
  if (isNaN(hours) || isNaN(minutes)) return time;

  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
};

/**
 * Converts a 12-hour time string (e.g., "02:30 PM") to 24-hour format (e.g., "14:30").
 */
export const formatTo24Hour = (time12: string): string => {
  if (!time12) return '00:00';
  
  // If it's already 24h format (no AM/PM)
  if (!time12.toUpperCase().includes('AM') && !time12.toUpperCase().includes('PM')) {
    return time12;
  }

  const [time, period] = time12.split(' ');
  if (!time) return '00:00';
  
  const [hStr, mStr] = time.split(':');
  let hours = parseInt(hStr);
  let minutes = parseInt(mStr);

  if (isNaN(hours)) hours = 0;
  if (isNaN(minutes)) minutes = 0;

  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/**
 * Parses a time string into a Date object for a specific base date.
 * Supports "HH:MM AM/PM" (12h) and "HH:MM" (24h).
 */
export const parseTime = (timeStr: string, baseDate: Date = new Date()): Date => {
  try {
    const d = new Date(baseDate);
    if (timeStr.includes(' ')) {
      // 12h format: "05:30 PM"
      const [time, modifier] = timeStr.split(' ');
      let [hours, minutes] = time.split(':').map(Number);
      
      if (modifier === 'PM' && hours < 12) hours += 12;
      if (modifier === 'AM' && hours === 12) hours = 0;
      
      d.setHours(hours, minutes, 0, 0);
    } else {
      // 24h format: "14:30"
      const [hours, minutes] = timeStr.split(':').map(Number);
      d.setHours(hours, minutes, 0, 0);
    }
    return d;
  } catch (e) {
    console.error('Error parsing time:', timeStr, e);
    return baseDate;
  }
};

/**
 * Sorts an array of time strings in 12-hour format chronologically.
 */
export const sortTimes = (times: string[]): string[] => {
  return [...times].sort((a, b) => {
    const timeA = formatTo24Hour(a);
    const timeB = formatTo24Hour(b);
    return timeA.localeCompare(timeB);
  });
};

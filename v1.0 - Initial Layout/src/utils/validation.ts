/**
 * Validates whether a value is a valid Indian mobile number (exactly 10 digits, only numbers).
 */
export function validatePhoneNumber(phone: string): boolean {
  if (!phone) return false;
  // Indian mobile numbers strictly contain exactly 10 digits and start with 6, 7, 8, or 9
  return /^[6-9]\d{9}$/.test(phone);
}

/**
 * Formats phone number by removing any extra characters if needed, or keeping it clean
 */
export function cleanPhoneNumber(phone: string): string {
  return phone.replace(/\s+/g, '');
}

/**
 * Keeps only numeric digits and restricts length to maximum 10 digits
 */
export function sanitizePhoneInput(value: string): string {
  const digitsOnly = value.replace(/\D/g, '');
  return digitsOnly.slice(0, 10);
}

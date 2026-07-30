/**
 * Robust API Base URL configuration helper for Spice Garden.
 * 
 * WHY THIS IS NECESSARY:
 * During manual deployments outside of Google AI Studio (e.g., Firebase Hosting,
 * Render, Vercel, Netlify, or self-hosted environments), the bundler/runtime may
 * fail to load or resolve environment variables properly, or the user might input
 * `VITE_API_BASE_URL` without its protocol.
 * 
 * If a raw domain or a relative-like path is provided (e.g. `spice-garden-api...`),
 * browsers interpret it as a relative path `/spice-garden-api...` under the hosting
 * domain. Hosting providers like Firebase Hosting will then treat this request
 * as a local route and fallback to serving the SPA's `index.html`. This causes the
 * API request to fail with parsing errors (trying to parse HTML as JSON).
 * 
 * This module ensures we always resolve a fully-qualified, absolute URL with http/https
 * protocol. If the environment variable is missing, invalid, relative, or malformed,
 * we safely fallback to our designated default Cloudflare Worker URL.
 */

export function resolveApiBaseUrl(): string {
  const fallbackUrl = 'https://spicegarden-api.yourusername.workers.dev/';
  
  try {
    const apiBase = import.meta.env.VITE_API_BASE_URL;
    
    // Check if the variable is missing, empty, or set to string equivalents of missing values
    if (
      !apiBase ||
      typeof apiBase !== 'string' ||
      apiBase.trim() === '' ||
      apiBase.trim() === 'undefined' ||
      apiBase.trim() === 'null'
    ) {
      return fallbackUrl;
    }
    
    let trimmedUrl = apiBase.trim();
    
    // Remove trailing slashes dynamically to avoid dual slashes in endpoints
    while (trimmedUrl.endsWith('/')) {
      trimmedUrl = trimmedUrl.slice(0, -1);
    }
    
    // Strict Protocol Verification: must start with http:// or https://
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      console.warn(
        `[API Config] Provided VITE_API_BASE_URL "${apiBase}" is invalid because it lacks a protocol prefix (http:// or https://). ` +
        `To prevent relative-path routing errors on custom hosting environments, falling back to default API URL: ${fallbackUrl}`
      );
      return fallbackUrl;
    }
    
    // Final sanity check via browser native URL builder
    try {
      new URL(trimmedUrl);
    } catch (e) {
      console.warn(
        `[API Config] Provided VITE_API_BASE_URL "${apiBase}" failed URL validation. ` +
        `Falling back to default API URL: ${fallbackUrl}`
      );
      return fallbackUrl;
    }
    
    return trimmedUrl;
  } catch (err) {
    console.error('[API Config] Unexpected error during base URL resolution, using safe fallback:', err);
    return fallbackUrl;
  }
}

// Instantiate the centralized API base URL once to ensure stability across imports
export const API_BASE_URL = resolveApiBaseUrl();

// Log startup details clearly in the browser console for trace-ability and debugging
console.group('🌐 [Spice Garden API Config Initialization]');
console.log(`API_BASE_URL loaded: ${API_BASE_URL}`);
console.log(`OTP endpoint: ${API_BASE_URL}/api/otp/start`);
console.log(`Verify endpoint: ${API_BASE_URL}/api/otp/verify`);
console.log(`Email endpoint: ${API_BASE_URL}/api/send-email`);
console.groupEnd();

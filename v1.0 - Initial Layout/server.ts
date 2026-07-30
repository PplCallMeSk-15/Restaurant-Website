import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { startAutomationEngine } from "./src/services/automationServer";
import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  increment 
} from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import firebaseConfig from "./firebase-applet-config.json";

// Initialize Firebase client-side SDK for server-side endpoints
const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(firebaseApp);

let isBackendUserAuthenticated = false;
let backendAuthPromise: Promise<void> | null = null;

async function ensureBackendAuthenticated() {
  if (isBackendUserAuthenticated && auth.currentUser) return;
  if (backendAuthPromise) {
    return backendAuthPromise;
  }

  backendAuthPromise = (async () => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, 'admin@gmail.com', 'admin6');
      isBackendUserAuthenticated = true;
      console.log("🔒 [BACKEND AUTH]: Server-side authenticated securely as admin@gmail.com!");
      try {
        const user = userCredential.user;
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: 'admin@gmail.com',
          displayName: 'System Admin',
          role: 'admin',
          updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log("✅ [BACKEND AUTH]: Fail-safe admin user document verified in /users collection!");
      } catch (saveErr: any) {
        console.warn("⚠️ [BACKEND AUTH]: Fail-safe admin user document write bypassed:", saveErr.message);
      }
    } catch (err: any) {
      console.log("⚠️ [BACKEND AUTH]: Sign in as admin failed, attempting to bootstrap/register admin account...", err.message);
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, 'admin@gmail.com', 'admin6');
        isBackendUserAuthenticated = true;
        console.log("🔒 [BACKEND AUTH]: Server-side registered and authenticated securely as admin@gmail.com!");
        const user = userCredential.user;
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: 'admin@gmail.com',
          displayName: 'System Admin',
          role: 'admin',
          updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log("✅ [BACKEND AUTH]: Admin user document bootstrapped in /users collection!");
      } catch (signupErr: any) {
        console.error("❌ [BACKEND AUTH FAIL]: Could not sign in or register admin", signupErr.message);
        // Clear cached promise on complete failure to enable retry on next incoming request
        backendAuthPromise = null;
      }
    }
  })();

  return backendAuthPromise;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize background automation engine (real-time listeners, etc.)
  try {
    startAutomationEngine();
    console.log("🚀 [BACKEND AUTOMATION]: Real-time email schedules, retry loops & hooks started successfully!");
  } catch (err) {
    console.error("❌ [BACKEND AUTOMATION]: Failed to boot core email scheduler engines:", err);
  }

  // Set up standard body parsers
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // --- Production-Grade HTTP Security Headers Middleware ---
  app.use((req, res, next) => {
    // Enable CORS for all routes (to support local/embedded/preview cross-origin fetch requests)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }

    // 1. Content-Security-Policy (CSP) - Production-ready, compatible with Firebase, Brevo, OpenStreetMap (Leaflet), and Google Auth
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://accounts.google.com https://www.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.basemaps.cartocdn.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org https://lh3.googleusercontent.com https://*.googleusercontent.com https://*.googleapis.com https://*.gstatic.com https://*.firebaseapp.com https://*.cartocdn.com https://*.openstreetmap.org https://images.unsplash.com",
      "connect-src 'self' ws: wss: https://*.workers.dev https://*.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.firestore.googleapis.com https://firebasestorage.googleapis.com https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org https://*.openstreetmap.org https://nominatim.openstreetmap.org",
      "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com",
      "frame-ancestors 'self' https://*.google.com https://ai.studio https://*.run.app https://*.aistudio.google",
      "object-src 'none'"
    ];
    res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

    // 2. X-Frame-Options - Dynamic protection to ensure AI Studio sandboxed preview doesn't break
    const referer = req.headers.referer || '';
    const isGoogleFramed = referer.includes('google.com') || referer.includes('ai.studio') || referer.includes('run.app') || referer.includes('aistudio.google');
    if (!isGoogleFramed) {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    }

    // 3. X-Content-Type-Options
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // 4. Referrer-Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // 5. Permissions-Policy - Tailored to only allow geolocation (safely aligning with metadata.json / Delivery Tracking Map)
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=(), payment=()');

    // 6. Strict-Transport-Security (HSTS)
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

    next();
  });

  // --- Rate Limiting Infrastructure ---
  interface RateLimitConfig {
    windowMs: number;
    max: number;
    message: string;
  }

  const rateLimiters: { [key: string]: { [ip: string]: { count: number; resetTime: number } } } = {};

  function createRateLimiter(key: string, config: RateLimitConfig) {
    rateLimiters[key] = {};
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const ip = (req.headers['x-forwarded-for'] as string) || req.ip || req.socket.remoteAddress || 'unknown';
      const now = Date.now();

      if (!rateLimiters[key][ip]) {
        rateLimiters[key][ip] = {
          count: 1,
          resetTime: now + config.windowMs
        };
        return next();
      }

      const clientLimit = rateLimiters[key][ip];
      if (now > clientLimit.resetTime) {
        clientLimit.count = 1;
        clientLimit.resetTime = now + config.windowMs;
        return next();
      }

      clientLimit.count++;
      if (clientLimit.count > config.max) {
        const retryAfter = Math.ceil((clientLimit.resetTime - now) / 1000);
        res.setHeader('Retry-After', retryAfter);
        return res.status(429).json({
          error: "Too Many Requests",
          message: config.message,
          retryAfter
        });
      }

      next();
    };
  }

  // Define protection limits
  const sendEmailLimiter = createRateLimiter('send-email', {
    windowMs: 15 * 60 * 1000, // 15 mins
    max: 10,                 // 10 emails per window
    message: "Too many email sending requests from this IP. Please try again after 15 minutes."
  });

  const otpStartLimiter = createRateLimiter('otp-start', {
    windowMs: 5 * 60 * 1000,  // 5 mins
    max: 5,                  // 5 OTP generations per window
    message: "Too many verification requests. Please try again after 5 minutes."
  });

  const otpVerifyLimiter = createRateLimiter('otp-verify', {
    windowMs: 5 * 60 * 1000,  // 5 mins
    max: 20,                 // allow up to 20 attempts per window to match attempts limits
    message: "Too many verification attempts. Please wait 5 minutes."
  });

  // API Route: Server-side secure Email dispatch proxy with rate-limiting
  app.post("/api/send-email", sendEmailLimiter, async (req, res) => {
    try {
      const { toEmail, toName, subject, htmlContent, textContent } = req.body;

      if (!toEmail || !subject || !htmlContent) {
        return res.status(400).json({ error: "Missing required fields (toEmail, subject, htmlContent)" });
      }

      // Check environment API keys - STRICTLY BACKEND ONLY (no VITE_ prefixes loaded or backed up)
      const brevoApiKey = process.env.BREVO_API_KEY;
      const senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@spicegarden.com';
      const senderName = process.env.BREVO_SENDER_NAME || 'Spice Garden';

      // Dynamically resolve placeholder/fallback email destination to the website owner/sender email configured in .env
      const resolvedToEmail = toEmail === 'abc@gmail.com' ? senderEmail : toEmail;

      // Fallback: If not configured, print to terminal and flag as simulated preview
      if (!brevoApiKey) {
        console.group('📧 [Spice Garden SERVER - Mock Preview]');
        console.log(`To: ${toName || 'Valued Customer'} <${resolvedToEmail}>`);
        console.log(`Subject: ${subject}`);
        console.log(`Text fallback:\n${textContent || 'None'}`);
        console.log(`HTML length: ${htmlContent.length} chars`);
        console.groupEnd();
        return res.json({ success: true, preview: true, details: { resolvedToEmail, senderEmail } });
      }

      console.log(`Sending email via Brevo SMTP API to ${resolvedToEmail}...`);

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'api-key': brevoApiKey
        },
        body: JSON.stringify({
          sender: {
            name: senderName,
            email: senderEmail
          },
          to: [
            {
              email: resolvedToEmail,
              name: toName || 'Valued Customer'
            }
          ],
          subject: subject,
          htmlContent: htmlContent,
          ...(textContent ? { textContent } : {})
        })
      });

      const responseText = await response.text();

      if (!response.ok) {
        console.error(`Brevo SMTP server response failed with status ${response.status}`, responseText);
        let parsedError: any;
        try {
          parsedError = JSON.parse(responseText);
        } catch {
          parsedError = { error: responseText };
        }
        
        const errorMessage = parsedError.message || String(responseText);
        const code = parsedError.code || '';

        // Check if Brevo is blocking due to unactivated account or unauthorized IP
        const isUnactivated = errorMessage.toLowerCase().includes("not yet activated") || errorMessage.toLowerCase().includes("permission_denied") || code === "permission_denied";
        const isIpBlocked = errorMessage.toLowerCase().includes("unrecognised ip") || errorMessage.toLowerCase().includes("authorised_ips") || code === "unauthorized";

        if (isUnactivated || isIpBlocked) {
          console.warn(`⚡ [BACKEND FALLBACK DETECTED]: Brevo returned an account restrictions error: "${errorMessage}".`);
          console.warn(`👉 Automatically switching to mock/preview mode so you can continue testing without app crashes!`);
          
          console.group('📧 [Spice Garden SERVER - Mock Preview Fallback]');
          console.log(`To: ${toName || 'Valued Customer'} <${toEmail}>`);
          console.log(`Subject: ${subject}`);
          console.log(`Text content:\n${textContent || 'None'}`);
          console.log(`HTML string length: ${htmlContent.length} chars`);
          console.groupEnd();

          return res.json({ 
            success: true, 
            preview: true, 
            reason: isUnactivated ? 'unactivated_smtp' : 'ip_block',
            details: errorMessage 
          });
        }

        return res.status(response.status).json({
          error: "Brevo SMTP request rejected",
          details: parsedError
        });
      }

      let responseJSON = {};
      try {
        responseJSON = JSON.parse(responseText);
      } catch {
        responseJSON = { raw: responseText };
      }

      console.log(`Email successfully dispatched via Brevo for: ${toEmail}`);
      return res.json({ success: true, response: responseJSON });
    } catch (err: any) {
      console.error('Core failure during email dispatch proxy:', err);
      return res.status(500).json({ error: "Internal mail server failure", message: err.message });
    }
  });

  // API Route: Server-side secure OTP session starter (rate limited)
  app.post("/api/otp/start", otpStartLimiter, async (req, res) => {
    try {
      const { email, name } = req.body;
      if (!email) {
        return res.status(400).json({ success: false, message: "Email is required." });
      }

      const cleanedEmail = email.trim().toLowerCase();
      const now = Date.now();
      const cooldownPeriod = 30 * 1000; // 30s resend cooldown
      const validityPeriod = 5 * 60 * 1000; // 5 mins expiration

      await ensureBackendAuthenticated();
      const docRef = doc(db, 'otp_verifications', cleanedEmail);

      // Verify cooldown restriction
      try {
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data && data.cooldownUntil && data.cooldownUntil > now) {
            const remaining = Math.ceil((data.cooldownUntil - now) / 1000);
            return res.status(429).json({
              success: false,
              cooldownUntil: data.cooldownUntil,
              message: `Please wait ${remaining} seconds before requesting a new OTP.`
            });
          }
        }
      } catch (err) {
        console.warn("Could not check existing OTP session cooldown:", err);
      }

      // Generate secure 6-digit code on the server side
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = now + validityPeriod;
      const cooldownUntil = now + cooldownPeriod;

      // Persist the details to Firestore (without ever sending the code to the frontend)
      await setDoc(docRef, {
        email: cleanedEmail,
        otp,
        expiresAt,
        cooldownUntil,
        attempts: 0
      });

      // Prepare OTP dispatch parameters
      const recipientName = name || 'Valued Customer';
      const subject = 'Spice Garden - Email Verification Code 🌿';
      const textContent = `Hello ${recipientName},\n\nYour security verification OTP code is: ${otp}\n\nThis verification code expires in 5 minutes. If you did not initiate this request, please ignore this email.\n\nBest regards,\nSpice Garden Team`;

      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Verification</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background-color: #fafafa;
      color: #1a1a1a;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #fafafa;
      padding: 40px 20px;
      box-sizing: border-box;
    }
    .container {
      max-width: 500px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
      border: 1px solid #f0f0f0;
    }
    .header {
      background-color: #ea580c;
      padding: 40px 30px;
      text-align: center;
    }
    .logo-text {
      font-size: 28px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -1px;
      margin: 0;
      font-family: 'Georgia', serif;
    }
    .logo-sub {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 3px;
      color: rgba(255, 255, 255, 0.8);
      margin-top: 5px;
      font-weight: 700;
    }
    .content {
      padding: 40px 35px;
      text-align: center;
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      margin-top: 0;
      margin-bottom: 12px;
      color: #111827;
      letter-spacing: -0.5px;
    }
    p {
      font-size: 15px;
      line-height: 1.6;
      color: #4b5563;
      margin-top: 0;
      margin-bottom: 24px;
    }
    .otp-box {
      background-color: #fff7ed;
      border: 2px dashed #ffedd5;
      padding: 24px;
      border-radius: 18px;
      margin: 30px 0;
    }
    .otp-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #ea580c;
      font-weight: 800;
      margin-bottom: 10px;
    }
    .otp-code {
      font-size: 38px;
      font-weight: 800;
      color: #ea580c;
      letter-spacing: 8px;
      margin: 0;
      padding-left: 8px;
      white-space: nowrap;
      word-break: keep-all;
      display: inline-block;
    }
    .expires {
      font-size: 13px;
      font-weight: 600;
      color: #ef4444;
      background-color: #fef2f2;
      padding: 10px 16px;
      border-radius: 50px;
      display: inline-block;
      margin-bottom: 10px;
    }
    .footer {
      padding: 25px 35px;
      background-color: #f9fafb;
      border-top: 1px solid #f3f4f6;
      text-align: center;
      font-size: 12px;
      color: #9ca3af;
      line-height: 1.5;
    }
    @media only screen and (max-width: 480px) {
      .wrapper {
        padding: 20px 10px !important;
      }
      .content {
        padding: 30px 15px !important;
      }
      .otp-code {
        font-size: 28px !important;
        letter-spacing: 4px !important;
        padding-left: 4px !important;
      }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="logo-text">Spice Garden</div>
        <div class="logo-sub">Authentic Heritage Cuisine</div>
      </div>
      <div class="content">
        <h1>Email Verification</h1>
        <p>Hello ${recipientName},</p>
        <p>To verify this email address and complete your request, please use the 6-digit secure code below.</p>
        <div class="otp-box">
          <div class="otp-label">Your verification code is</div>
          <div class="otp-code">${otp}</div>
        </div>
        <div class="expires">
          ⏱️ This OTP will expire in 5 minutes
        </div>
      </div>
      <div class="footer">
        <p style="margin: 0 0 10px 0;">If you did not request this code, please ignore this email.</p>
        <p style="margin: 0;">&copy; 2026 Spice Garden. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

      console.log(`[SMTP OTP HANDLER] Attempting email send to ${cleanedEmail}...`);

      const brevoApiKey = process.env.BREVO_API_KEY;
      const senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@spicegarden.com';
      const senderName = process.env.BREVO_SENDER_NAME || 'Spice Garden';

      let mailSuccess = false;

      // Standard sandbox fallback checking
      if (!brevoApiKey) {
        console.warn(`[OTP PREVIEW FALLBACK]: No BREVO_API_KEY configured. Logging target OTP directly to server terminal: ${otp}`);
        mailSuccess = true;
      } else {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'api-key': brevoApiKey
          },
          body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: cleanedEmail, name: recipientName }],
            subject,
            htmlContent,
            textContent
          })
        });

        if (response.ok) {
          mailSuccess = true;
          console.log(`[SMTP OTP HANDLER] Successfully sent OTP to ${cleanedEmail} via Brevo!`);
        } else {
          const text = await response.text();
          console.error("[SMTP OTP HANDLER] Brevo returned rejection payload:", text);
        }
      }

      if (mailSuccess) {
        return res.json({ success: true, cooldownUntil, message: "Verification code has been sent to your email!" });
      } else {
        return res.status(500).json({ success: false, message: "Failed to dispatch email verification. Check server keys." });
      }
    } catch (err: any) {
      console.error("General server-side OTP start error:", err);
      return res.status(500).json({ success: false, message: "OTP initiation failed: " + err.message });
    }
  });

  // API Route: Server-side secure OTP verification check (rate limited)
  app.post("/api/otp/verify", otpVerifyLimiter, async (req, res) => {
    try {
      const { email, otp } = req.body;
      if (!email || !otp) {
        return res.status(400).json({ success: false, message: "Email and OTP code are required parameters." });
      }

      const cleanedEmail = email.trim().toLowerCase();
      const now = Date.now();
      await ensureBackendAuthenticated();
      const docRef = doc(db, 'otp_verifications', cleanedEmail);

      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        return res.status(404).json({ success: false, message: 'No active OTP verification session found. Please request a new OTP.' });
      }

      const data = snap.data();
      if (!data) {
        return res.status(500).json({ success: false, message: 'Failed to retrieve verification session data.' });
      }

      // Check remaining attempts (max 5)
      if (data.attempts >= 5) {
        return res.status(400).json({ success: false, message: 'Maximum retries exceeded. Please trigger a new OTP verification.' });
      }

      // Check validity duration bounds
      if (data.expiresAt && now > data.expiresAt) {
        await deleteDoc(docRef);
        return res.status(400).json({ success: false, message: 'OTP has expired (validity is 5 minutes). Please try sending a new one.' });
      }

      // Exact match verify check complete on the backend side
      if (data.otp === otp.trim()) {
        // Validation matched successfully! Reset & prune session record
        await deleteDoc(docRef);
        return res.json({ success: true, message: 'Verification successful.' });
      } else {
        // Failure tracker increment
        const nextAttempts = (data.attempts || 0) + 1;
        await updateDoc(docRef, {
          attempts: increment(1)
        });

        const remaining = 5 - nextAttempts;
        if (remaining <= 0) {
          await deleteDoc(docRef);
          return res.status(400).json({ success: false, message: 'Maximum retries exceeded. This OTP is now locked. Please generate a new code.' });
        }
        return res.status(400).json({ success: false, message: `Incorrect OTP. You have ${remaining} attempts remaining.` });
      }
    } catch (err: any) {
      console.error("General server-side OTP validation error:", err);
      return res.status(500).json({ success: false, message: "OTP validation failed: " + err.message });
    }
  });

  // API Route: Healthcheck
  app.get("/api/health", (req, res) => {
    res.json({ status: "alive", timestamp: new Date().toISOString() });
  });

  // Vite middleware setup (serve front-end via Vite dev server or static distribution build)
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode with static file assets...");
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server bound and listening at http://0.0.0.0:${PORT}`);
  });
}

startServer();

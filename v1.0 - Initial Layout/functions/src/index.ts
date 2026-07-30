import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import express from "express";
import cors from "cors";

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

const app = express();

// Standard CORS policy configuration (Allows requests from Hosting domain)
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate Limiting Infrastructure
interface RateLimitConfig {
  windowMs: number;
  max: number;
  message: string;
}

const rateLimiters: { [key: string]: { [ip: string]: { count: number; resetTime: number } } } = {};

function createRateLimiter(key: string, config: RateLimitConfig) {
  rateLimiters[key] = {};
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Correct IP acquisition behind cloud proxies / load-balancers
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() || req.ip || "unknown";
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
      res.setHeader("Retry-After", retryAfter);
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
const sendEmailLimiter = createRateLimiter("send-email", {
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 10,                 // 10 emails per window
  message: "Too many email sending requests from this IP. Please try again after 15 minutes."
});

const otpStartLimiter = createRateLimiter("otp-start", {
  windowMs: 5 * 60 * 1000,  // 5 mins
  max: 5,                  // 5 OTP generations per window
  message: "Too many verification requests. Please try again after 5 minutes."
});

const otpVerifyLimiter = createRateLimiter("otp-verify", {
  windowMs: 5 * 60 * 1000,  // 5 mins
  max: 20,                 // allow up to 20 attempts per window
  message: "Too many verification attempts. Please wait 5 minutes."
});

/**
 * Modern HTML template builder for authentic email newsletters/alerts
 */
function getOTPEmailHtml(recipientName: string, otp: string): string {
  return `<!DOCTYPE html>
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
}

/**
 * CORE HANDLERS
 */

// 1. Send Email handler (Brevo proxy)
const sendEmailHandler = async (req: express.Request, res: express.Response) => {
  try {
    const { toEmail, toName, subject, htmlContent, textContent } = req.body;

    if (!toEmail || !subject || !htmlContent) {
      return res.status(400).json({ error: "Missing required fields (toEmail, subject, htmlContent)" });
    }

    const brevoApiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL || "noreply@spicegarden.com";
    const senderName = process.env.BREVO_SENDER_NAME || "Spice Garden";

    // Fallback if not configured: log inside Cloud logger
    if (!brevoApiKey) {
      console.warn("⚠️ No BREVO_API_KEY configured in Firebase Secret/Env variables. Simulating email send.");
      console.log(`[SIMULATED EMAIL] To: ${toName || "Valued Customer"} <${toEmail}> | Subject: ${subject}`);
      return res.json({ success: true, preview: true });
    }

    console.log(`Dispatched transaction mail to ${toEmail}...`);

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "api-key": brevoApiKey
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: toEmail, name: toName || "Valued Customer" }],
        subject,
        htmlContent,
        ...(textContent ? { textContent } : {})
      })
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error(`Brevo SMTP server rejected dispatch with status ${response.status}`, responseText);
      let parsedError: any;
      try {
        parsedError = JSON.parse(responseText);
      } catch {
        parsedError = { error: responseText };
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

    console.log(`Email successfully routed via Brevo to ${toEmail}`);
    return res.json({ success: true, response: responseJSON });
  } catch (err: any) {
    console.error("Failure in mail cloud proxy router:", err);
    return res.status(500).json({ error: "Internal mail proxy failure", message: err.message });
  }
};

// 2. Start OTP handler (generate OTP & dispatch mail)
const startOTPHandler = async (req: express.Request, res: express.Response) => {
  try {
    const { email, name } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required." });
    }

    const cleanedEmail = email.trim().toLowerCase();
    const now = Date.now();
    const cooldownPeriod = 30 * 1000; // 30s resend cooldown
    const validityPeriod = 5 * 60 * 1000; // 5 mins expiration

    const docRef = db.collection("otp_verifications").doc(cleanedEmail);

    // Verify cooldown restriction
    const snap = await docRef.get();
    if (snap.exists) {
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

    // Generate secure 6-digit code on the secure Cloud Function environment
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = now + validityPeriod;
    const cooldownUntil = now + cooldownPeriod;

    // Securely log in database (closed to any frontend Client SDK queries)
    await docRef.set({
      email: cleanedEmail,
      otp,
      expiresAt,
      cooldownUntil,
      attempts: 0
    });

    const recipientName = name || "Valued Customer";
    const subject = "Spice Garden - Email Verification Code 🌿";
    const textContent = `Hello ${recipientName},\n\nYour security verification OTP code is: ${otp}\n\nThis verification code expires in 5 minutes. If you did not initiate this request, please ignore this email.\n\nBest regards,\nSpice Garden Team`;
    const htmlContent = getOTPEmailHtml(recipientName, otp);

    const brevoApiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL || "noreply@spicegarden.com";
    const senderName = process.env.BREVO_SENDER_NAME || "Spice Garden";

    let mailSuccess = false;

    if (!brevoApiKey) {
      console.warn(`⚠️ [OTP PREVIEW FALLBACK]: No BREVO_API_KEY configured. Security verification OTP: ${otp}`);
      mailSuccess = true;
    } else {
      const mailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "content-type": "application/json",
          "api-key": brevoApiKey
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: cleanedEmail, name: recipientName }],
          subject,
          htmlContent,
          textContent
        })
      });

      if (mailResponse.ok) {
        mailSuccess = true;
        console.log(`Successfully dispatched verification OTP email to ${cleanedEmail}.`);
      } else {
        const text = await mailResponse.text();
        console.error("Brevo rejected verification mail dispatch payload:", text);
      }
    }

    if (mailSuccess) {
      return res.json({ success: true, cooldownUntil, message: "Verification code has been sent to your email!" });
    } else {
      return res.status(500).json({ success: false, message: "Failed to dispatch email verification. Check server keys." });
    }
  } catch (err: any) {
    console.error("General backend OTP initiation error:", err);
    return res.status(500).json({ success: false, message: "OTP initiation failed: " + err.message });
  }
};

// 3. Verify OTP handler
const verifyOTPHandler = async (req: express.Request, res: express.Response) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and OTP code are required parameters." });
    }

    const cleanedEmail = email.trim().toLowerCase();
    const now = Date.now();
    const docRef = db.collection("otp_verifications").doc(cleanedEmail);

    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, message: "No active OTP verification session found. Please request a new OTP." });
    }

    const data = snap.data();
    if (!data) {
      return res.status(500).json({ success: false, message: "Failed to retrieve verification session data." });
    }

    if (data.attempts >= 5) {
      return res.status(400).json({ success: false, message: "Maximum retries exceeded. Please trigger a new OTP verification." });
    }

    if (data.expiresAt && now > data.expiresAt) {
      await docRef.delete();
      return res.status(400).json({ success: false, message: "OTP has expired (validity is 5 minutes). Please try sending a new one." });
    }

    if (data.otp === otp.trim()) {
      // OTP checked & validated perfectly! Delete immediately to prevent reuse
      await docRef.delete();
      return res.json({ success: true, message: "Verification successful." });
    } else {
      const nextAttempts = (data.attempts || 0) + 1;
      await docRef.update({
        attempts: admin.firestore.FieldValue.increment(1)
      });

      const remaining = 5 - nextAttempts;
      if (remaining <= 0) {
        await docRef.delete();
        return res.status(400).json({ success: false, message: "Maximum retries exceeded. This OTP is now locked. Please generate a new code." });
      }
      return res.status(400).json({ success: false, message: `Incorrect OTP. You have ${remaining} attempts remaining.` });
    }
  } catch (err: any) {
    console.error("General backend OTP validation error:", err);
    return res.status(500).json({ success: false, message: "OTP validation failed: " + err.message });
  }
};

/**
 * ROUTES REGISTRATION
 */

// Set up standard endpoints
app.post("/api/send-email", sendEmailLimiter, sendEmailHandler);
app.post("/api/otp/start", otpStartLimiter, startOTPHandler);
app.post("/api/otp/verify", otpVerifyLimiter, verifyOTPHandler);

// Set up specific requested aliases
app.post("/api/send-otp", otpStartLimiter, startOTPHandler);
app.post("/api/verify-otp", otpVerifyLimiter, verifyOTPHandler);
app.post("/api/send-order-email", sendEmailLimiter, sendEmailHandler);
app.post("/api/send-booking-email", sendEmailLimiter, sendEmailHandler);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "alive", timestamp: new Date().toISOString(), platform: "firebase-functions-v2" });
});

// Export Cloud Function
export const api = functions.https.onRequest(app);

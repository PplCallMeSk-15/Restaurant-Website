/**
 * Spice Garden - Production Secure Serverless Proxy (Cloudflare Workers)
 * Handles secure Brevo SMTP email routing, server-side OTP generation, 
 * resend cooldown prevention, and verified security validation using OTP_STORE KV.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 1. Enable standard CORS Configuration
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*", // Allows requests from your web.app domain
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-requested-with",
      "Access-Control-Max-Age": "86400",
    };

    // Handle OPTIONS browser preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // JSON response constructor helper
    const jsonResponse = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status: status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    };

    try {
      // 2. Health check endpoint for live debugging
      if (path === "/api/health" && request.method === "GET") {
        return jsonResponse({
          status: "alive",
          timestamp: new Date().toISOString(),
          platform: "cloudflare-workers",
          kvConnected: !!env.OTP_STORE,
          secretsLoaded: !!env.BREVO_API_KEY
        });
      }

      // 3. Transactions Email dispatch route
      if (
        (path === "/api/send-email" || 
         path === "/api/send-order-email" || 
         path === "/api/send-booking-email") && 
        request.method === "POST"
      ) {
        const body = await request.json();
        const { toEmail, toName, subject, htmlContent, textContent } = body;

        if (!toEmail || !subject || !htmlContent) {
          return jsonResponse({ error: "Missing required fields (toEmail, subject, htmlContent)" }, 400);
        }

        const brevoApiKey = env.BREVO_API_KEY;
        const senderEmail = env.BREVO_SENDER_EMAIL || "noreply@spicegarden.com";
        const senderName = env.BREVO_SENDER_NAME || "Spice Garden";

        if (!brevoApiKey) {
          return jsonResponse({ error: "BREVO_API_KEY secret is not configured in Cloudflare environment variables." }, 500);
        }

        const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
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
            textContent: textContent || subject
          })
        });

        const responseText = await brevoResponse.text();
        if (!brevoResponse.ok) {
          return jsonResponse({
            error: "Brevo SMTP request rejected by mail gateway",
            details: responseText
          }, brevoResponse.status);
        }

        return jsonResponse({ success: true, details: JSON.parse(responseText) });
      }

      // 4. Start OTP Verification Route (Creates secure code and emails it)
      if ((path === "/api/otp/start" || path === "/api/send-otp") && request.method === "POST") {
        const body = await request.json();
        const { email, name } = body;

        if (!email) {
          return jsonResponse({ success: false, message: "Email is required." }, 400);
        }

        const cleanedEmail = email.trim().toLowerCase();
        
        // Check resend limits via KV Store cooldown record
        const cooldownKey = `cooldown:${cleanedEmail}`;
        const cooldownActive = await env.OTP_STORE.get(cooldownKey);
        
        if (cooldownActive) {
          const now = Date.now();
          const cooldownUntil = parseInt(cooldownActive, 10);
          const remainingSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
          return jsonResponse({
            success: false,
            cooldownUntil,
            message: `Please wait ${remainingSeconds} seconds before requesting a new verification code.`
          }, 429);
        }

        // Generate tamper-proof, server-side 6-digit OTP code
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const now = Date.now();
        const cooldownUntil = now + (60 * 1000); // 60-second resend lock

        // Save generated state inside secure KV cache (5 minutes expiration TTL)
        const otpKey = `otp:${cleanedEmail}`;
        await env.OTP_STORE.put(otpKey, JSON.stringify({ otp, attempts: 0 }), {
          expirationTtl: 300 // Expiration automatic in 5 mins (300 seconds)
        });

        // Save cooldown timestamp record (30 seconds auto-clear)
        await env.OTP_STORE.put(cooldownKey, cooldownUntil.toString(), {
          expirationTtl: 60
        });

        // Email Design Template Construction
        const recipientName = name || "Valued Customer";
        const emailSubject = "Spice Garden - Email Verification Code 🌿";
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

        const brevoApiKey = env.BREVO_API_KEY;
        const senderEmail = env.BREVO_SENDER_EMAIL || "noreply@spicegarden.com";
        const senderName = env.BREVO_SENDER_NAME || "Spice Garden";

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
            subject: emailSubject,
            htmlContent,
            textContent
          })
        });

        if (mailResponse.ok) {
          return jsonResponse({ success: true, cooldownUntil, message: "Verification code has been sent to your email!" });
        } else {
          console.error("Brevo rejected verification mail dispatch:", await mailResponse.text());
          return jsonResponse({ success: false, message: "SMTP partner rejected dispatch. Check API token." }, 500);
        }
      }

      // 5. Verify OTP Route (Checks entered code on server-side)
      if ((path === "/api/otp/verify" || path === "/api/verify-otp") && request.method === "POST") {
        const body = await request.json();
        const { email, otp } = body;

        if (!email || !otp) {
          return jsonResponse({ success: false, message: "Email and OTP code are required parameters." }, 400);
        }

        const cleanedEmail = email.trim().toLowerCase();
        const otpKey = `otp:${cleanedEmail}`;

        // Retrieve existing session JSON from KV
        const storedStr = await env.OTP_STORE.get(otpKey);
        if (!storedStr) {
          return jsonResponse({ success: false, message: "No active OTP verification session found. Please request a new OTP." }, 404);
        }

        const storedSes = JSON.parse(storedStr);

        // Fail-safe protection limit against brutefore attacks
        if (storedSes.attempts >= 5) {
          await env.OTP_STORE.delete(otpKey);
          return jsonResponse({ success: false, message: "Maximum retries exceeded. This OTP is now locked. Please generate a new code." }, 400);
        }

        if (storedSes.otp === otp.trim()) {
          // Success! Delete record immediately to prevent replay/re-use attacks
          await env.OTP_STORE.delete(otpKey);
          return jsonResponse({ success: true, message: "Verification successful." });
        } else {
          const nextAttempts = (storedSes.attempts || 0) + 1;
          const remaining = 5 - nextAttempts;
          
          if (remaining <= 0) {
            await env.OTP_STORE.delete(otpKey);
            return jsonResponse({ success: false, message: "Maximum retries exceeded. This OTP is now locked. Please generate a new code." }, 400);
          }

          // Save incremented attempts state back into KV
          await env.OTP_STORE.put(otpKey, JSON.stringify({ ...storedSes, attempts: nextAttempts }), {
            expirationTtl: 300 // Maintain original validity lifecycle
          });

          return jsonResponse({ success: false, message: `Incorrect verification code. You have ${remaining} attempts remaining.` }, 400);
        }
      }

      // 404 Error fallback
      return jsonResponse({ error: "Endpoint Path Not Found" }, 404);

    } catch (err) {
      return jsonResponse({ error: "Internal Secure Server Error", details: err.message }, 500);
    }
  }
};
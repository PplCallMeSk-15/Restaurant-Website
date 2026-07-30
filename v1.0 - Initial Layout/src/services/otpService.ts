import toast from 'react-hot-toast';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { sendEmail } from './emailService';
import { API_BASE_URL } from './apiConfig';

export interface OTPRecord {
  email: string;
  otp: string;
  expiresAt: number; // Ms timestamp
  cooldownUntil: number; // Ms timestamp
  attempts: number;
}

/**
 * Generates a random 6-digit OTP string (retained for backward compatibility / type interfaces).
 */
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

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
 * Initiates the OTP creation and email dispatch strictly on the secure backend.
 */
export async function startOTPSession(email: string, name: string): Promise<{ success: boolean; cooldownUntil: number }> {
  try {
    // Send request strictly to secure backend OTP start endpoint using centralized safe base URL
    console.log(`[OTP] Requesting start at: ${API_BASE_URL}/api/otp/start`);
    const response = await fetch(`${API_BASE_URL}/api/otp/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, name })
    });

    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      console.error("Non-JSON design or HTML page received:", text);
      toast.error('The verification server is temporarily busy or starting up. Please click Verify Email & Sign Up again in a moment!');
      return { success: false, cooldownUntil: 0 };
    }

    if (!response.ok) {
      const msg = data.message || 'Failed to request email verification code.';
      toast.error(msg);
      return { success: false, cooldownUntil: data.cooldownUntil || 0 };
    }

    if (data.success) {
      toast.success(data.message || 'Verification code has been sent to your email!');
    } else {
      toast.error(data.message || 'Failed to send verification code.');
    }

    return { 
      success: data.success, 
      cooldownUntil: data.cooldownUntil || 0 
    };
  } catch (err: any) {
    console.error("Error calling start OTP endpoint:", err);
    toast.error('Could not request verification: ' + (err.message || 'Server connection error'));
    return { success: false, cooldownUntil: 0 };
  }
}

/**
 * Verifies the user-entered OTP code securely on the server-side.
 */
export async function verifyOTP(email: string, userInput: string): Promise<{ success: boolean; message: string }> {
  try {
    // Send request strictly to secure backend OTP verify endpoint using centralized safe base URL
    console.log(`[OTP] Verifying at: ${API_BASE_URL}/api/otp/verify`);
    const response = await fetch(`${API_BASE_URL}/api/otp/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, otp: userInput })
    });

    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      console.error("Non-JSON design or HTML page received during OTP verification:", text);
      return {
        success: false,
        message: 'The verification server is temporarily busy. Please wait a moment and try again.'
      };
    }

    return { 
      success: data.success, 
      message: data.message || (data.success ? 'Verification successful.' : 'Verification failed.')
    };
  } catch (err: any) {
    console.error("Error during OTP validation:", err);
    return { 
      success: false, 
      message: err.message || 'Verification failed. Please try again.' 
    };
  }
}

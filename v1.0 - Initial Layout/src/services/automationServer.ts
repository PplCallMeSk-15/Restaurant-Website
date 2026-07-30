import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  setDoc,
  query, 
  where, 
  onSnapshot 
} from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseAppletConfig from '../../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || firebaseAppletConfig.apiKey,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || firebaseAppletConfig.authDomain,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || firebaseAppletConfig.storageBucket,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || firebaseAppletConfig.messagingSenderId,
  appId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || firebaseAppletConfig.appId,
  firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || firebaseAppletConfig.firestoreDatabaseId
};
import { buildHtmlEmail, buildOrderItemsTable } from './emailTemplates';
import { getCurrentSystemTime } from './settingsService';
import fs from 'fs';
import path from 'path';

// Setup file log interceptor
const logFilePath = path.join(process.cwd(), 'automation_logs.txt');
try {
  // Clear file on start to see fresh logs
  fs.writeFileSync(logFilePath, `=== Automation Engine Logs: Started ${new Date().toISOString()} ===\n`, 'utf8');
} catch (e) {}

function logToFile(level: string, ...args: any[]) {
  const dateStr = new Date().toISOString();
  const msg = args.map(arg => typeof arg === 'object' ? (arg instanceof Error ? arg.stack || arg.message : JSON.stringify(arg)) : String(arg)).join(' ');
  const logLine = `[${dateStr}] [${level}] ${msg}\n`;
  try {
    fs.appendFileSync(logFilePath, logLine, 'utf8');
  } catch (err) {}
}

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args: any[]) => {
  originalLog(...args);
  logToFile('INFO', ...args);
};

console.error = (...args: any[]) => {
  originalError(...args);
  logToFile('ERROR', ...args);
};

console.warn = (...args: any[]) => {
  originalWarn(...args);
  logToFile('WARN', ...args);
};

// Initialize client SDK (safely in node environment, which is fully supported)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);
const serverStartTime = Date.now();

console.log(`[BACKEND INITIALIZATION]:
  DatabaseID: ${firebaseConfig.firestoreDatabaseId}
  Running via client-side Web SDK authenticated as Admin. Express Server Start Time: ${new Date(serverStartTime).toISOString()}
`);

// List to track active unsubscription functions and active timeouts
const activeUnsubscribers: any[] = [];
const activeIntervals: any[] = [];

let isFirebaseClientAuthenticated = false;

/**
 * Ensures the server-side client SDK is authenticated as an admin on the backend using email/password authentication
 */
async function ensureAuthenticated() {
  if (isFirebaseClientAuthenticated && auth.currentUser) return;

  try {
    const userCredential = await signInWithEmailAndPassword(auth, 'admin@gmail.com', 'admin6');
    isFirebaseClientAuthenticated = true;
    console.log("🔒 [BACKEND AUTHENTICATION]: Server client-side Web SDK signed in successfully as admin (admin@gmail.com)!");
    try {
      const user = userCredential.user;
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: 'admin@gmail.com',
        displayName: 'System Admin',
        role: 'admin',
        updatedAt: new Date().toISOString()
      }, { merge: true });
      console.log("✅ [BACKEND AUTH]: Fail-safe admin user document verified in /users collection via server client!");
    } catch (saveErr: any) {
      console.warn("⚠️ [BACKEND AUTH]: Fail-safe admin user document write bypassed on server client:", saveErr.message);
    }
  } catch (err: any) {
    console.log("⚠️ [BACKEND AUTHENTICATION]: Sign in as admin failed, attempting to bootstrap/register admin account...", err.message);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, 'admin@gmail.com', 'admin6');
      isFirebaseClientAuthenticated = true;
      console.log("🔒 [BACKEND AUTHENTICATION]: Server client-side Web SDK registered & signed in successfully as admin (admin@gmail.com)!");
      const user = userCredential.user;
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: 'admin@gmail.com',
        displayName: 'System Admin',
        role: 'admin',
        updatedAt: new Date().toISOString()
      }, { merge: true });
      console.log("✅ [BACKEND AUTH]: Admin user bootstrapped in /users collection via server client!");
    } catch (signupErr: any) {
      console.error("❌ [BACKEND AUTHENTICATION ERROR]: Failed to sign in or register server-side client Web SDK as admin. Error:", signupErr.message);
    }
  }
}

// In-memory key tracking for emails currently being dispatched or already dispatched in this session
const processingEmails = new Set<string>();

/**
 * Robust Core Email Sender. Handles actual dispatch via Brevo OR simulates fallbacks,
 * then records precise logs to Firestore 'email_logs' with error boundaries.
 */
async function triggerEmail(
  toEmail: string,
  toName: string,
  subject: string,
  message: string,
  emailType: string,
  refId: string,
  refType: 'orderId' | 'reservationId',
  extraVars: any = {}
): Promise<boolean> {
  const lockKey = `${refId}_${emailType}`;
  if (processingEmails.has(lockKey)) {
    console.log(`Automation Engine [MEM LOCK]: Already processing/sent ${emailType} for ${refId}. Skipping duplicate request.`);
    return true;
  }
  processingEmails.add(lockKey);

  if (!toEmail) {
    console.error(`Automation Engine: Cannot dispatch email because recipient address is undefined.`);
    processingEmails.delete(lockKey);
    return false;
  }

  try {
    await ensureAuthenticated();

    // 1. Strict Duplicate Prevention filter
    // Check if a successful log already exists for this ID and Type
    const qDup = query(
      collection(db, 'email_logs'),
      where(refType, '==', refId),
      where('emailType', '==', emailType),
      where('status', '==', 'success')
    );
    const existingLogSnap = await getDocs(qDup);

    if (!existingLogSnap.empty) {
      console.log(`Automation Engine: Email skip triggered. Duplicate prevented for ${emailType} on ${refType} ${refId}`);
      return true;
    }

    // 2. Load latest settings dynamically
    let settings: any = {};
    try {
      const settingsSnap = await getDoc(doc(db, 'settings', 'general'));
      if (settingsSnap.exists()) {
        settings = settingsSnap.data() || {};
      }
    } catch (err) {
      console.warn("Automation Engine: Could not fetch real-time settings, falling back to static defaults.", err);
    }

    // compile all templates with correct variables
    const vars = {
      customerName: toName,
      restaurantName: settings.restaurantName || 'The Royal Spice',
      contactNumber: settings.contactNumber || '+91 9876543210',
      address: settings.address || '123 Spice Garden Landmark, Indiranagar, Bengaluru, Karnataka 560038',
      ...extraVars
    };

    const finalHtml = buildHtmlEmail(subject, message, emailType, vars);

    // 3. Dispatch to Brevo SMTP block - STRICTLY BACKEND ONLY (no VITE_ prefixes loaded or backed up)
    const brevoApiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@spicegarden.com';
    const senderName = process.env.BREVO_SENDER_NAME || 'Spice Garden';

    let isMock = !brevoApiKey;
    let errorMsg: string | null = null;
    let brevoResponsePayload = '';

    if (!isMock) {
      try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'api-key': brevoApiKey!
          },
          body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: toEmail, name: toName || 'Valued Customer' }],
            subject: subject,
            htmlContent: finalHtml
          })
        });

        brevoResponsePayload = await response.text();

        if (!response.ok) {
          let parsedError: any = {};
          try { parsedError = JSON.parse(brevoResponsePayload); } catch { parsedError = { error: brevoResponsePayload }; }
          errorMsg = parsedError.message || brevoResponsePayload;

          const isUnactivated = errorMsg!.toLowerCase().includes("not yet activated") || errorMsg!.toLowerCase().includes("permission_denied");
          const isIpBlocked = errorMsg!.toLowerCase().includes("unrecognised ip") || errorMsg!.toLowerCase().includes("authorised_ips");

          if (isUnactivated || isIpBlocked) {
            console.warn(`Automation Engine Fallback: Switching to mock delivery. Reason: ${errorMsg}`);
            isMock = true;
            errorMsg = null;
          } else {
            throw new Error(`Brevo SMTP failure: ${errorMsg}`);
          }
        }
      } catch (fe: any) {
        errorMsg = fe.message || 'SMTP request connection failure';
      }
    }

    if (isMock) {
      console.log(`🤖 [MOCK RUNNER DISPATCH - ${emailType}]:
        To: ${toName} <${toEmail}>
        Subject: ${subject}
        Ref ID: ${refId} (${refType})
        Message Sample: "${message.slice(0, 75)}..."
      `);
    }

    // 4. Save audit log to 'email_logs' collection
    await addDoc(collection(db, 'email_logs'), {
      recipientEmail: toEmail,
      recipientName: toName,
      subject,
      emailType,
      status: errorMsg ? 'failed' : 'success',
      errorMessage: errorMsg,
      sentAt: new Date().toISOString(),
      [refType]: refId,
      isMockMode: isMock,
      updatedAt: new Date().toISOString()
    });

    if (errorMsg) {
      processingEmails.delete(lockKey);
    }

    return !errorMsg;
  } catch (err: any) {
    processingEmails.delete(lockKey);
    console.error(`Automation Engine Exception: Critical error during dispatching of ${emailType}`, err);
    // Write failed log if possible
    try {
      await addDoc(collection(db, 'email_logs'), {
        recipientEmail: toEmail,
        recipientName: toName,
        subject,
        emailType,
        status: 'failed',
        errorMessage: err.message || 'Unhandled Engine Error',
        sentAt: new Date().toISOString(),
        [refType]: refId,
        isMockMode: true,
        updatedAt: new Date().toISOString()
      });
    } catch {}
    return false;
  }
}

/**
 * Triggers automated retries for all emails marked as 'failed' inside the logs
 */
async function runEmailRetryLoop() {
  try {
    await ensureAuthenticated();
    const qFailed = query(collection(db, 'email_logs'), where('status', '==', 'failed'));
    const snap = await getDocs(qFailed);
    if (snap.empty) return;

    console.log(`Automation Engine Scheduler: Retrying ${snap.size} failed email dispatcher logs...`);

    for (const d of snap.docs) {
      const data = d.data();
      const refId = data.orderId || data.reservationId;
      const refType = data.orderId ? 'orderId' : 'reservationId';

      // Read real-time recipient fields to prevent sending to deleted objects
      let detailsValid = false;
      let orderData: any = null;
      let reservationData: any = null;

      if (refType === 'orderId') {
        const oSnap = await getDoc(doc(db, 'orders', refId));
        detailsValid = oSnap.exists();
        if (detailsValid) {
          orderData = oSnap.data();
        }
      } else {
        const rSnap = await getDoc(doc(db, 'reservations', refId));
        detailsValid = rSnap.exists();
        if (detailsValid) {
          reservationData = rSnap.data();
        }
      }

      if (!detailsValid) {
        console.warn(`Automation Engine Retry: Cleaned abandoned failed log pointing to deleted ${refType} ${refId}`);
        await updateDoc(doc(db, 'email_logs', d.id), {
          status: 'abandoned',
          errorMessage: 'Original document deleted',
          updatedAt: new Date().toISOString()
        });
        continue;
      }

      // Re-dispatch
      const extraVars: any = {};
      if (refType === 'orderId') {
        if (orderData) {
          extraVars.orderId = refId;
          extraVars.orderItems = buildOrderItemsTable(orderData.items || []);
          extraVars.deliveryAddress = orderData.address;
        }
      } else {
        if (reservationData) {
          extraVars.reservationId = refId;
          extraVars.reservationDate = reservationData.date;
          extraVars.reservationTime = reservationData.time;
          extraVars.guestCount = reservationData.guests;
        }
      }

      const success = await triggerEmail(
        data.recipientEmail,
        data.recipientName,
        data.subject,
        `Retried after initial delivery block. Original log notes: ${data.errorMessage || 'Unknown failure'}. \n\n${data.subject}`,
        data.emailType,
        refId,
        refType as any,
        extraVars
      );

      if (success) {
        console.log(`Automation Engine Retry Success: Successfully processed retry for log ${d.id}`);
        await updateDoc(doc(db, 'email_logs', d.id), {
          status: 'success',
          errorMessage: null,
          updatedAt: new Date().toISOString()
        });
      }
    }
  } catch (err) {
    console.error("Automation Engine Scheduler: Error in email retry scheduler loop: ", err);
  }
}

/**
 * Live 30-Minute Reservation Reminder Scheduler.
 * Checks upcoming reservations using virtual OR system time elements.
 */
async function runReservationReminderLoop() {
  try {
    await ensureAuthenticated();
    
    let settings: any = null;
    try {
      const settingsSnap = await getDoc(doc(db, 'settings', 'general'));
      settings = settingsSnap.exists() ? settingsSnap.data() as any : null;
      console.log(`[DEBUG REMINDER]: settings/general fetched successfully. exists: ${settingsSnap.exists()}`);
    } catch (settingsErr: any) {
      console.error("[DEBUG REMINDER ERROR] Failed to fetch settings/general: ", settingsErr);
      throw settingsErr;
    }

    // Use actual or virtual system hours
    const virtualNow = getCurrentSystemTime(settings);
    const nowISOString = virtualNow.toISOString();
    const currentDateString = nowISOString.split('T')[0]; // "YYYY-MM-DD"

    // Fetch daily confirmed reservations
    let snap;
    try {
      const qReservations = query(
        collection(db, 'reservations'),
        where('status', '==', 'confirmed'),
        where('date', '==', currentDateString)
      );
      snap = await getDocs(qReservations);
      console.log(`[DEBUG REMINDER]: reservations query fetched successfully. found count: ${snap.size}`);
    } catch (resErr: any) {
      console.error("[DEBUG REMINDER ERROR] Failed to query reservations collection: ", resErr);
      throw resErr;
    }

    if (snap.empty) return;

    for (const docObj of snap.docs) {
      const res = docObj.data();
      const resId = docObj.id;

      // Extract details about reservation hours
      const timeStr = res.time; // e.g., "07:30 PM" or "19:30"
      if (!timeStr) continue;

      // Parse reservation arrival detail time
      const parseLocal = (timeVal: string, base: Date): Date => {
        const d = new Date(base);
        if (timeVal.toUpperCase().includes('AM') || timeVal.toUpperCase().includes('PM')) {
          const [timePart, modifier] = timeVal.split(' ');
          let [hours, minutes] = timePart.split(':').map(Number);
          if (modifier === 'PM' && hours < 12) hours += 12;
          if (modifier === 'AM' && hours === 12) hours = 0;
          d.setHours(hours, minutes, 0, 0);
        } else {
          const [hours, minutes] = timeVal.split(':').map(Number);
          d.setHours(hours, minutes, 0, 0);
        }
        return d;
      };

      const reservationTimeObj = parseLocal(timeStr, virtualNow);
      const diffMs = reservationTimeObj.getTime() - virtualNow.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);

      // Check if it fits the 30 minute window (checking a strict 26-34 minute slot to account for timing variations)
      // and checking duplicate emails to avoid repeat spam
      if (diffMinutes >= 26 && diffMinutes <= 34) {
        let dupSnap;
        try {
          const qDup = query(
            collection(db, 'email_logs'),
            where('reservationId', '==', resId),
            where('emailType', '==', 'RESERVATION_REMINDER'),
            where('status', '==', 'success')
          );
          dupSnap = await getDocs(qDup);
          console.log(`[DEBUG REMINDER]: email_logs dup query fetched successfully. is empty: ${dupSnap.empty}`);
        } catch (dupErr: any) {
          console.error(`[DEBUG REMINDER ERROR] Failed to query email_logs collection for resId ${resId}: `, dupErr);
          throw dupErr;
        }

        if (dupSnap.empty) {
          console.log(`Automation Scheduled Trigger: Table reminder found for ${res.name} (id: ${resId}) in ${diffMinutes} minutes.`);
          
          await triggerEmail(
            res.email,
            res.name,
            `Upcoming Reservation Reminder`,
            `This is a friendly reminder that your table reservation #${resId.slice(-6).toUpperCase()} at Spice Garden is scheduled in 30 minutes at ${timeStr}. We look forward to welcome you.`,
            'RESERVATION_REMINDER',
            resId,
            'reservationId',
            {
              reservationId: resId,
              reservationDate: res.date,
              reservationTime: res.time,
              guestCount: res.guests
            }
          );
        }
      }
    }
  } catch (err) {
    console.error("Automation Scheduled Exception: Error in reservation reminder schedule loops:", err);
  }
}

/**
 * Initializes real-time listener monitors to observe status migrations on orders and reservations.
 */
export function startAutomationEngine() {
  console.log("Automation Engine: Setting up real-time Firebase Web Client listeners...");

  ensureAuthenticated().then(() => {
    // --- Real-time Order Listener ---
    const unsubscribeOrders = onSnapshot(collection(db, 'orders'), async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        const orderData = change.doc.data() as any;
        const orderId = change.doc.id;
        
        const createdAtVal = orderData.createdAt;
        let docTime = Date.now();
        if (createdAtVal) {
          if (typeof createdAtVal.toMillis === 'function') {
            docTime = createdAtVal.toMillis();
          } else if (createdAtVal instanceof Date) {
            docTime = createdAtVal.getTime();
          } else if (typeof createdAtVal === 'string' || typeof createdAtVal === 'number') {
            docTime = new Date(createdAtVal).getTime();
          }
        }

        // Skip old historical items parsed on initial snapshot load
        if (docTime < serverStartTime - 5000) {
          continue;
        }

        const email = orderData.customerEmail;
        const name = orderData.customerName;

        if (change.type === 'added') {
          // 1. ORDER_CREATED
          console.log(`Automation Trigger: New Order placed successfully: ${orderId}`);
          await triggerEmail(
            email,
            name,
            'Order Received Successfully',
            `Thank you for your order. We have successfully received your order and our kitchen has started processing it.\n\nEstimated Preparation Time: 30-40 minutes.`,
            'ORDER_CREATED',
            orderId,
            'orderId',
            {
              orderId,
              orderItems: buildOrderItemsTable(orderData.items || []),
              deliveryAddress: orderData.address
            }
          );
        } else if (change.type === 'modified') {
          if (orderData.status === 'Assigned To Delivery Partner' || orderData.status === 'On The Way' || orderData.status === 'Picked Up') {
            // 2. DELIVERY_ASSIGNED
            console.log(`Automation Trigger: Order delivery partner assigned / heading out: ${orderId}`);
            
            let partnerName = 'Your assigned courier rider';
            if (orderData.deliveryPartnerId) {
              try {
                const partnerSnap = await getDoc(doc(db, 'delivery_partners', orderData.deliveryPartnerId));
                if (partnerSnap.exists()) {
                  const partnerData = partnerSnap.data();
                  if (partnerData) {
                    partnerName = `${partnerData.fullName} (${partnerData.vehicleType} - ${partnerData.vehicleNumber})`;
                  }
                }
              } catch {}
            }

            await triggerEmail(
              email,
              name,
              'Your Order Is On The Way',
              `Great news! Your order has been picked up by our delivery team and is now on the way to your location.\n\nEstimated Arrival Time: 15-20 minutes.`,
              'DELIVERY_ASSIGNED',
              orderId,
              'orderId',
              {
                orderId,
                deliveryPartner: partnerName,
                deliveryAddress: orderData.address
              }
            );
          } else if (orderData.status === 'delivered') {
            // 3. ORDER_DELIVERED
            console.log(`Automation Trigger: Order delivered: ${orderId}`);
            await triggerEmail(
              email,
              name,
              'Order Delivered Successfully',
              `We hope you enjoyed your meal! Thank you for ordering from us. We'd love to hear your feedback on your items.`,
              'DELIVERED',
              orderId,
              'orderId',
              {
                orderId,
                orderItems: buildOrderItemsTable(orderData.items || [])
              }
            );
          }
        }
      }
    }, (err) => {
      console.error("Automation Listener Error (Orders):", err);
    });

    // --- Real-time Reservation Listener ---
    const unsubscribeReservations = onSnapshot(collection(db, 'reservations'), async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        const resData = change.doc.data() as any;
        const resId = change.doc.id;
        
        const createdAtVal = resData.createdAt;
        let docTime = Date.now();
        if (createdAtVal) {
          if (typeof createdAtVal.toMillis === 'function') {
            docTime = createdAtVal.toMillis();
          } else if (createdAtVal instanceof Date) {
            docTime = createdAtVal.getTime();
          } else if (typeof createdAtVal === 'string' || typeof createdAtVal === 'number') {
            docTime = new Date(createdAtVal).getTime();
          }
        }

        // Skip old historical items parsed on initial snapshot load
        if (docTime < serverStartTime - 5000) {
          continue;
        }

        const email = resData.email;
        const name = resData.name;

        if (change.type === 'added') {
          // 4. RESERVATION_RECEIVED
          console.log(`Automation Trigger: New table booking request received: ${resId}`);
          await triggerEmail(
            email,
            name,
            'Reservation Request Received 🌿',
            `Thank you for choosing us! We have successfully received your table reservation request. Please note that your booking is currently in pending status. Our host team is reviewing your details, and you will receive a confirmation email containing your locked tables once we accept the booking.`,
            'RESERVATION_RECEIVED',
            resId,
            'reservationId',
            {
              reservationId: resId,
              reservationDate: resData.date,
              reservationTime: resData.time,
              guestCount: resData.guests
            }
          );
        } else if (change.type === 'modified') {
          if (resData.status === 'confirmed') {
            // 5. RESERVATION_CONFIRMED
            console.log(`Automation Trigger: Reservation Confirmed by Admin: ${resId}`);
            await triggerEmail(
              email,
              name,
              'Reservation Confirmed 🎉',
              `Great news! Your table reservation has been reviewed and officially confirmed by our administration! Your requested spots have been successfully accepted, assigned, and locked. We look forward to welcoming you for an exceptional and flavorful dining experience.`,
              'RESERVATION_CONFIRMED',
              resId,
              'reservationId',
              {
                reservationId: resId,
                reservationDate: resData.date,
                reservationTime: resData.time,
                guestCount: resData.guests
              }
            );
          } else if (resData.status === 'completed') {
            // 7. VISIT_COMPLETED
            console.log(`Automation Trigger: Reservation Completed: ${resId}`);
            await triggerEmail(
              email,
              name,
              'Thank You For Visiting',
              `Thank you for dining with us at Spice Garden! We hope you had a wonderful, flavorful experience. Your feedback keeps us growing.`,
              'VISIT_COMPLETED',
              resId,
              'reservationId',
              {
                reservationId: resId,
                reservationDate: resData.date,
                reservationTime: resData.time,
                guestCount: resData.guests
              }
            );
          } else if (resData.status === 'no-show') {
            // 8. MISSED_RESERVATION (No-Show)
            console.log(`Automation Trigger: Reservation Marked as No-Show: ${resId}`);
            await triggerEmail(
              email,
              name,
              'We Missed You',
              `We noticed that you were unable to attend your reservation at Spice Garden. We would love to serve you another time. Click the button below to reserve a table for your next craving.`,
              'NO_SHOW',
              resId,
              'reservationId',
              {
                reservationId: resId,
                reservationDate: resData.date,
                reservationTime: resData.time,
                guestCount: resData.guests
              }
            );
          }
        }
      }
    }, (err) => {
      console.error("Automation Listener Error (Reservations):", err);
    });

    // --- Start Scheduled Background Interval Timers ---
    // Every 1 minute: check for upcoming 30-minute reservation reminders
    const scheduledReminderTimer = setInterval(() => {
      runReservationReminderLoop();
    }, 60000);

    // Every 3 minutes: run the delivery robust retry loop to re-attempt failed emails
    const retryFailedTimer = setInterval(() => {
      runEmailRetryLoop();
    }, 180000);

    // Immediate check on startup
    runReservationReminderLoop();
    runEmailRetryLoop();

    // Store active listeners/timeouts for clean tear down
    activeUnsubscribers.push(unsubscribeOrders, unsubscribeReservations);
    activeIntervals.push(scheduledReminderTimer, retryFailedTimer);
  });

  return () => {
    activeUnsubscribers.forEach(unsub => { try { unsub(); } catch {} });
    activeIntervals.forEach(timer => clearInterval(timer));
    activeUnsubscribers.length = 0;
    activeIntervals.length = 0;
  };
}

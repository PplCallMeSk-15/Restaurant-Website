import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { sendEmail } from './emailService';
import { buildHtmlEmail, buildOrderItemsTable } from './emailTemplates';

/**
 * Centrally executes client-side email triggers to handle environments where the Node automation backend is offline.
 */
export async function clientTriggerEmail(
  toEmail: string,
  toName: string,
  subject: string,
  message: string,
  emailType: string,
  refId: string,
  refType: 'orderId' | 'reservationId',
  extraVars: any = {}
): Promise<boolean> {
  if (!toEmail) {
    console.warn(`[Client Email Trigger] Cannot dispatch email because recipient address is undefined.`);
    return false;
  }

  try {
    // 1. Load latest settings dynamically
    let settings: any = {};
    try {
      const settingsSnap = await getDoc(doc(db, 'settings', 'general'));
      if (settingsSnap.exists()) {
        settings = settingsSnap.data() || {};
      }
    } catch (err) {
      console.warn("[Client Email Trigger] Could not fetch settings, using defaults:", err);
    }

    const vars = {
      customerName: toName,
      restaurantName: settings.restaurantName || 'Spice Garden',
      contactNumber: settings.contactNumber || '+91 9876543210',
      address: settings.address || '123 Curry Lane, Royal Food Court, Bangalore',
      ...extraVars
    };

    const finalHtml = buildHtmlEmail(subject, message, emailType, vars);

    // 2. Dispatch via centralized emailService (which uses safe API_BASE_URL via Cloudflare Worker)
    console.log(`[Client Email Trigger] Dispatching ${emailType} directly from client to: ${toEmail}`);
    const success = await sendEmail({
      toEmail,
      toName,
      subject,
      htmlContent: finalHtml,
      textContent: message
    });

    if (success) {
      console.log(`[Client Email Trigger] Email successfully dispatched directly for ${refType} ${refId}`);
      return true;
    }

    return false;
  } catch (err) {
    console.error(`[Client Email Trigger] Error triggering email for ${emailType}:`, err);
    return false;
  }
}

/**
 * Triggers order status emails directly from the client.
 */
export async function triggerOrderEmailForStatus(orderId: string, status: string) {
  try {
    const orderSnap = await getDoc(doc(db, 'orders', orderId));
    if (!orderSnap.exists()) return;
    const orderData = orderSnap.data();
    if (!orderData) return;

    const email = orderData.customerEmail;
    const name = orderData.customerName;
    if (!email) return;

    if (status === 'Assigned To Delivery Partner' || status === 'On The Way' || status === 'Picked Up') {
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

      await clientTriggerEmail(
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
    } else if (status === 'delivered') {
      await clientTriggerEmail(
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
  } catch (err) {
    console.warn('[Client Email Trigger] Error triggering order status email:', err);
  }
}

/**
 * Triggers reservation status emails directly from the client.
 */
export async function triggerReservationEmailForStatus(resId: string, status: string) {
  try {
    const resSnap = await getDoc(doc(db, 'reservations', resId));
    if (!resSnap.exists()) return;
    const resData = resSnap.data();
    if (!resData) return;

    const email = resData.email;
    const name = resData.name;
    if (!email) return;

    if (status === 'confirmed') {
      await clientTriggerEmail(
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
    } else if (status === 'completed') {
      await clientTriggerEmail(
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
    } else if (status === 'no-show') {
      await clientTriggerEmail(
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
  } catch (err) {
    console.warn('[Client Email Trigger] Error triggering reservation status email:', err);
  }
}

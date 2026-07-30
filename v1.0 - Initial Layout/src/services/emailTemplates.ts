/**
 * Dynamic HTML Email Template System for Spice Garden.
 * Fully responsive, modern, branding-aligned with deep slate and orange accents.
 */

interface TemplateVariables {
  customerName?: string;
  orderId?: string;
  reservationId?: string;
  orderItems?: string; // HTML formatted table of items
  reservationDate?: string;
  reservationTime?: string;
  guestCount?: number | string;
  deliveryPartner?: string;
  deliveryAddress?: string;
  googleReviewUrl?: string;
  appUrl?: string;
  restaurantName?: string;
  contactNumber?: string;
  address?: string;
}

/**
 * Builds a highly polished responsive HTML email wrapper around a primary message and metadata.
 */
export function buildHtmlEmail(
  subject: string,
  message: string,
  eventType: string,
  vars: TemplateVariables
): string {
  const restaurantName = vars.restaurantName || 'Spice Garden';
  const contactNumber = vars.contactNumber || '+91 9876543210';
  const address = vars.address || '123 Curry Lane, Royal Food Court, Bangalore';
  const appUrl = vars.appUrl || 'https://spicegarden.com';
  const googleReviewUrl = vars.googleReviewUrl || 'https://g.page/r/spice-garden-review/review';

  // Format delivery address panel if available
  let addressPanel = '';
  if (vars.deliveryAddress) {
    addressPanel = `
      <div style="margin-top: 20px; background-color: #faf9f6; border-left: 4px solid #ea580c; padding: 12px 16px; border-radius: 0 12px 12px 0; text-align: left;">
        <span style="font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #ea580c; display: block; margin-bottom: 4px;">Delivery Location</span>
        <span style="font-size: 13px; color: #1f2937; line-height: 1.4;">${vars.deliveryAddress}</span>
      </div>
    `;
  }

  // Format delivery partner panel if available
  let deliveryPartnerPanel = '';
  if (vars.deliveryPartner) {
    deliveryPartnerPanel = `
      <div style="margin-top: 20px; background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 12px; text-align: left; display: flex; align-items: center;">
        <div style="font-size: 24px; margin-right: 12px;">🚲</div>
        <div>
          <span style="font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #166534; display: block;">Delivery Fleet Partner Assigned</span>
          <strong style="font-size: 14px; color: #14532d; display: block; margin-top: 2px;">${vars.deliveryPartner}</strong>
        </div>
      </div>
    `;
  }

  // Format reservation specs panel if available
  let reservationPanel = '';
  if (vars.reservationDate && vars.reservationTime) {
    reservationPanel = `
      <div style="margin-top: 20px; background-color: #fafafa; border: 1px solid #e5e7eb; border-radius: 16px; padding: 16px; text-align: left;">
        <h4 style="margin: 0 0 12px 0; color: #111827; font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #f3f4f6; padding-bottom: 8px;">Reservation Log</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 4px 0; color: #4b5563;"><strong>Booking Date:</strong></td>
            <td style="padding: 4px 0; text-align: right; color: #111827;">${vars.reservationDate}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #4b5563;"><strong>Timing Slot:</strong></td>
            <td style="padding: 4px 0; text-align: right; color: #111827;">${vars.reservationTime}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #4b5563;"><strong>Guest Count:</strong></td>
            <td style="padding: 4px 0; text-align: right; color: #111827;">${vars.guestCount || 1} Guests</td>
          </tr>
          ${vars.reservationId ? `
          <tr>
            <td style="padding: 4px 0; color: #4b5563;"><strong>Reservation ID:</strong></td>
            <td style="padding: 4px 0; text-align: right; color: #ea580c; font-family: monospace; font-weight: bold;">#${vars.reservationId.slice(-6).toUpperCase()}</td>
          </tr>
          ` : ''}
        </table>
      </div>
    `;
  }

  // Action call to button elements
  let buttonsHtml = '';
  if (eventType === 'DELIVERED') {
    buttonsHtml = `
      <div style="margin-top: 24px; text-align: center;">
        <a href="${googleReviewUrl}" target="_blank" style="display: inline-block; background-color: #ea580c; color: #ffffff; padding: 12px 24px; font-size: 13px; font-weight: bold; text-decoration: none; border-radius: 12px; margin: 6px; box-shadow: 0 4px 6px -1px rgba(234, 88, 12, 0.15);">★ Leave a Google Review</a>
        <a href="${appUrl}/orders" style="display: inline-block; background-color: #111827; color: #ffffff; padding: 12px 24px; font-size: 13px; font-weight: bold; text-decoration: none; border-radius: 12px; margin: 6px;">Rate Your Order</a>
      </div>
    `;
  } else if (eventType === 'VISIT_COMPLETED') {
    buttonsHtml = `
      <div style="margin-top: 24px; text-align: center;">
        <a href="${googleReviewUrl}" target="_blank" style="display: inline-block; background-color: #ea580c; color: #ffffff; padding: 12px 24px; font-size: 13px; font-weight: bold; text-decoration: none; border-radius: 12px; margin: 6px; box-shadow: 0 4px 6px -1px rgba(234, 88, 12, 0.15);">★ Leave a Google Review</a>
        <a href="${appUrl}/orders" style="display: inline-block; background-color: #111827; color: #ffffff; padding: 12px 24px; font-size: 13px; font-weight: bold; text-decoration: none; border-radius: 12px; margin: 6px;">Rate Your Booking</a>
      </div>
    `;
  } else if (eventType === 'NO_SHOW') {
    buttonsHtml = `
      <div style="margin-top: 24px; text-align: center;">
        <a href="${appUrl}/reservations" style="display: inline-block; background-color: #ea580c; color: #ffffff; padding: 12px 24px; font-size: 13px; font-weight: bold; text-decoration: none; border-radius: 12px; margin: 6px; box-shadow: 0 4px 6px -1px rgba(234, 88, 12, 0.15);">Book Again</a>
      </div>
    `;
  }

  // Render items grid/table if variables contain orderItems
  let orderItemsTable = '';
  if (vars.orderItems) {
    orderItemsTable = `
      <div style="margin-top: 20px; border-top: 1px solid #f3f4f6; padding-top: 16px;">
        <h4 style="margin: 0 0 12px 0; color: #111827; font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em;">Order Details</h4>
        ${vars.orderItems}
      </div>
    `;
  }

  // Compile final template
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, a { font-family: Arial, sans-serif !important; }
  </style>
  <![endif]-->
  <style>
    @media (prefers-color-scheme: dark) {
      body { background-color: #0b0f19 !important; color: #f3f4f6 !important; }
      .email-card { background-color: #111827 !important; border-color: #1f2937 !important; }
      .header-title { color: #f97316 !important; }
      .text-title { color: #ffffff !important; }
      .text-body { color: #d1d5db !important; }
      .footer-text { color: #9ca3af !important; }
      .divider { border-color: #1f2937 !important; }
    }
  </style>
</head>
<body style="font-family: 'Inter', system-ui, -apple-system, sans-serif; background-color: #fafbfc; margin: 0; padding: 40px 10px; -webkit-font-smoothing: antialiased; text-align: center;">

  <div class="email-card" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #eaeef2; border-radius: 24px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.02), 0 4px 6px -4px rgba(0, 0, 0, 0.02); overflow: hidden; padding: 32px; text-align: left;">
    
    <!-- Branding Header -->
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #f3f4f6;" class="divider">
      <div style="display: flex; align-items: center;">
        <span style="font-size: 24px; margin-right: 8px;">🌶️</span>
        <h2 style="margin: 0; font-size: 20px; font-weight: 800; color: #111827; letter-spacing: -0.02em;" class="header-title">${restaurantName}</h2>
      </div>
      ${vars.orderId ? `
        <span style="font-size: 11px; font-weight: bold; background-color: #fff7ed; color: #ea580c; padding: 4px 10px; border-radius: 6px; font-family: monospace;">#${vars.orderId.slice(-6).toUpperCase()}</span>
      ` : ''}
    </div>

    <!-- Title / Headline -->
    <h1 style="font-size: 22px; font-weight: 800; color: #111827; margin: 0 0 12px 0; tracking-tight: -0.01em;" class="text-title">
      ${subject}
    </h1>

    <p style="font-size: 15px; line-height: 1.6; color: #4b5563; margin: 0 0 16px 0;" class="text-body">
      Hi ${vars.customerName || 'Valued Customer'},
    </p>

    <!-- Specific Structured Message Body -->
    <div style="font-size: 15px; line-height: 1.6; color: #4b5563;" class="text-body">
      ${message}
    </div>

    <!-- Context Modules -->
    ${addressPanel}
    ${deliveryPartnerPanel}
    ${reservationPanel}
    ${orderItemsTable}
    ${buttonsHtml}

    <div style="margin-top: 32px; border-top: 1px solid #f3f4f6; padding-top: 24px;" class="divider">
      <p style="font-size: 12px; color: #6b7280; text-align: center; margin: 0 0 12px 0;" class="footer-text">
        Spice Garden Delivery Fleet Engine. If you have any inquiries, contact our guest relationships desk at <strong style="color: #111827;" class="text-title">${contactNumber}</strong>.
      </p>
      
      <!-- Social Link Badges -->
      <div style="text-align: center; margin-bottom: 16px;">
        <a href="#" style="display: inline-block; margin: 0 6px; text-decoration: none; color: #ea580c; font-size: 13px; font-weight: bold;">Facebook</a> •
        <a href="#" style="display: inline-block; margin: 0 6px; text-decoration: none; color: #ea580c; font-size: 13px; font-weight: bold;">Instagram</a> •
        <a href="#" style="display: inline-block; margin: 0 6px; text-decoration: none; color: #ea580c; font-size: 13px; font-weight: bold;">Twitter</a>
      </div>

      <p style="font-size: 11px; color: #9ca3af; text-align: center; margin: 0;" class="footer-text">
        © ${new Date().getFullYear()} ${restaurantName}. All rights reserved. <br>
        ${address}
      </p>
    </div>

  </div>

</body>
</html>
`;
}

/**
 * Compiles a beautiful HTML tabular display for order line items.
 */
export function buildOrderItemsTable(items: any[]): string {
  if (!items || items.length === 0) return '';
  let html = `
    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
      <thead>
        <tr style="border-bottom: 2px solid #f3f4f6; color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;" class="divider">
          <th style="padding: 8px 0; font-weight: bold;">Item</th>
          <th style="padding: 8px 0; text-align: center; font-weight: bold; width: 60px;">Quantity</th>
          <th style="padding: 8px 0; text-align: right; font-weight: bold; width: 100px;">Price</th>
        </tr>
      </thead>
      <tbody>
  `;
  items.forEach(item => {
    html += `
      <tr style="border-bottom: 1px solid #f3f4f6;" class="divider">
        <td style="padding: 12px 0; color: #111827;" class="text-title">
          <strong style="display: block;">${item.name}</strong>
        </td>
        <td style="padding: 12px 0; text-align: center; color: #4b5563;" class="text-body">${item.quantity}</td>
        <td style="padding: 12px 0; text-align: right; font-weight: bold; color: #111827;" class="text-title">₹${item.price * item.quantity}</td>
      </tr>
    `;
  });
  html += `
      </tbody>
    </table>
  `;
  return html;
}

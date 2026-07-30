import toast from 'react-hot-toast';
import { API_BASE_URL } from './apiConfig';

interface SendEmailParams {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

/**
 * Centrally manages email sending via Brevo SMTP API.
 * Clean, modern, fully-typed dynamic wrapper.
 */
export async function sendEmail({
  toEmail,
  toName = 'Valued Customer',
  subject,
  htmlContent,
  textContent
}: SendEmailParams): Promise<boolean> {
  try {
    // Send email strictly via the backend secure proxy route using centralized safe base URL
    console.log(`[Email] Dispatching to: ${API_BASE_URL}/api/send-email`);
    const response = await fetch(`${API_BASE_URL}/api/send-email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        toEmail,
        toName,
        subject,
        htmlContent,
        textContent
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const detailsMsg = data.details?.message || data.message || '';
      if (detailsMsg.includes('unrecognised IP address') || detailsMsg.includes('authorised_ips')) {
        toast.error(
          '🔒 Brevo API secure IP block detected! To fix: visit https://app.brevo.com/security/authorised_ips inside your Brevo account dashboard, and either whitelist your IP or disable IP restrictions.',
          { duration: 12000 }
        );
      } else if (detailsMsg.includes('not yet activated') || detailsMsg.includes('SMTP account is not yet activated') || detailsMsg.includes('contact@brevo.com')) {
        toast.error(
          '✉️ Your Brevo SMTP account is not yet activated! Please check your email/inbox for an activation notice or request SMTP activation on Brevo.',
          { duration: 15000 }
        );
      }
      const errMsg = data.error || data.message || `Server Status ${response.status}`;
      throw new Error(`Proxy Error: ${errMsg}. ${JSON.stringify(data.details || {})}`);
    }

    if (data.preview) {
      console.group('📧 [Spice Garden - Email Redirected via Server Preview]');
      console.log(`To: ${toName} <${toEmail}>`);
      console.log(`Subject: ${subject}`);
      console.log(`Fallback Reason:`, data.details || 'General simulation mode');
      console.groupEnd();
      
      if (data.reason === 'unactivated_smtp') {
        toast.success(
          '✨ (Simulation Preview Mode Active) Order placed! However, your Brevo SMTP Account is not yet activated. Check console/terminal logs to view the compiled email markup!',
          { duration: 10000 }
        );
      } else if (data.reason === 'ip_block') {
        toast.success(
          '🔒 (Simulation Preview Mode Active) Check your console logs! Your Brevo authorized IP list blocked this dynamic cloud IP, so we simulated the dispatch.',
          { duration: 10000 }
        );
      } else {
        toast.success(`(Preview) Simulated email to ${toEmail}. Check developer logs!`, { duration: 6000 });
      }
      return true;
    }

    console.log(`Successfully sent email to ${toEmail} via SMTP Server Proxy.`);
    return true;
  } catch (error: any) {
    console.error('Failed to dispatch email via secure proxy:', error);
    toast.error(`Email dispatch failed. Visual fallback triggered.`);
    
    // Always print console log fallback for convenient testing
    console.group('📧 [Fallback - Email Logged From UI Service Error]');
    console.log(`To: ${toName} <${toEmail}>`);
    console.log(`Subject: ${subject}`);
    console.log(`Reason: ${error.message || error}`);
    console.log(`HTML Body:`, htmlContent);
    console.groupEnd();
    
    return false;
  }
}

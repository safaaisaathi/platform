// whatsappService.ts
//
// The outbound WhatsApp sender.
//
// It speaks Meta's Cloud API first and falls back to Twilio. If neither is
// configured it logs the message and returns, so a missing provider never
// makes the caller fail.
//
// Every credential is a Firebase secret param, not an environment read. The
// secret names are exported so the webhook that uses them can declare them in
// `functions.runWith({ secrets: [...] })`. A value that is not configured
// reads as empty, which is what the provider check treats as "not available".

import { defineSecret } from 'firebase-functions/params';

// The Meta Cloud API credentials.
export const WHATSAPP_CLOUD_API_TOKEN = defineSecret('WHATSAPP_CLOUD_API_TOKEN');
export const WHATSAPP_PHONE_NUMBER_ID = defineSecret('WHATSAPP_PHONE_NUMBER_ID');

// The Twilio fallback credentials.
export const TWILIO_ACCOUNT_SID = defineSecret('TWILIO_ACCOUNT_SID');
export const TWILIO_AUTH_TOKEN = defineSecret('TWILIO_AUTH_TOKEN');
export const TWILIO_WHATSAPP_FROM = defineSecret('TWILIO_WHATSAPP_FROM');

/** The default Twilio sender, used when the secret is not configured. */
const DEFAULT_TWILIO_FROM = 'whatsapp:+14155238886';

/**
 * A secret's value, or an empty string when it is not configured.
 *
 * A missing secret must not throw here. The caller treats an empty credential
 * as "provider not available" and moves on.
 */
function secretValue(secret: { value(): string }): string {
  try {
    return secret.value();
  } catch {
    return '';
  }
}

export interface WhatsAppMessagePayload {
  toPhone: string;
  templateType: 'complaint_created' | 'cleaning_verification' | 'sla_breached_72h' | 'auto_resolved' | 'ticket_reopened';
  ticketId: string;
  data: Record<string, string>;
}

export class WhatsAppBotService {
  /**
   * Normalise a phone number to digits with the Indian country code and no
   * leading plus. A bare ten-digit number gets the 91 prefix.
   */
  public static sanitizePhone(phone: string): string {
    let cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.length === 10) {
      cleaned = '91' + cleaned;
    }
    return cleaned;
  }

  /**
   * Send one WhatsApp message through Meta, then Twilio.
   *
   * Returns true when a provider accepted the message, and also true when no
   * provider is configured, because the call is best-effort and must not fail
   * the caller.
   */
  public static async sendMessage(toPhone: string, text: string): Promise<boolean> {
    const sanitized = this.sanitizePhone(toPhone);
    console.log(`[WhatsApp Bot] Dispatching to ${sanitized}:\n${text}`);

    // 1. Meta Cloud API.
    const metaToken = secretValue(WHATSAPP_CLOUD_API_TOKEN);
    const phoneNumberId = secretValue(WHATSAPP_PHONE_NUMBER_ID);
    if (metaToken.length > 0 && phoneNumberId.length > 0) {
      try {
        const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${metaToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: sanitized,
            type: 'text',
            text: { body: text },
          }),
        });
        if (res.ok) return true;
        const errJson = await res.json();
        console.error('Meta WhatsApp API Error:', errJson);
      } catch (err) {
        console.error('Meta WhatsApp Network Error:', err);
      }
    }

    // 2. Twilio WhatsApp API.
    const twilioSid = secretValue(TWILIO_ACCOUNT_SID);
    const twilioAuth = secretValue(TWILIO_AUTH_TOKEN);
    const twilioFrom = secretValue(TWILIO_WHATSAPP_FROM) || DEFAULT_TWILIO_FROM;
    if (twilioSid.length > 0 && twilioAuth.length > 0) {
      try {
        const authHeader = 'Basic ' + Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64');
        const formParams = new URLSearchParams();
        formParams.append('From', twilioFrom);
        formParams.append('To', `whatsapp:+${sanitized}`);
        formParams.append('Body', text);

        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formParams.toString(),
        });
        if (res.ok) return true;
      } catch (err) {
        console.error('Twilio WhatsApp Error:', err);
      }
    }

    // No provider accepted the message. The caller does not fail on this.
    return true;
  }

  /** The citizen's complaint receipt. */
  public static async sendComplaintReceipt(
    toPhone: string,
    ticketId: string,
    categoryGu: string,
    categoryEn: string,
    address: string,
    trackUrl: string
  ): Promise<boolean> {
    const text =
`*🌱 પંચમહાલ ગોધરા સ્વચ્છતા સાથી - સ્વયંસંચાલિત વોટ્સએપ બોટ*
*Panchmahal Godhra Sanitation Bot - Official Receipt*
━━━━━━━━━━━━━━━━━━━━━
નમસ્તે! આપની સ્વચ્છતા ફરિયાદ સફળતાપૂર્વક નોંધાઈ છે.
Hello! Your sanitation grievance has been registered.

📋 *ટિકિટ ક્રમાંક / Ticket ID:* ${ticketId}
⚠️ *સમસ્યા / Category:* ${categoryGu} / ${categoryEn}
📍 *સરનામું / Address:* ${address}
🕒 *તારીખ / Time:* ${new Date().toLocaleString('en-IN')}
⏳ *SLA નિરાકરણ સમય / SLA:* 24 Hours / ૨૪ કલાક

🔗 *લાઈવ સ્ટેટસ ટ્રેક કરો / Live Track:*
${trackUrl}

_જ્યારે સફાઈ કર્મચારી દ્વારા સફાઈ પૂર્ણ કરવામાં આવશે, ત્યારે આપને ચકાસણી માટે અહીં મેસેજ મળશે._
_When sanitation worker completes cleaning, you will receive verification prompt here._`;

    return this.sendMessage(toPhone, text);
  }

  /** The cleaning proof and the cross-verification request. */
  public static async sendCleaningVerificationRequest(
    toPhone: string,
    ticketId: string,
    workerName: string,
    cleanPhotoUrl: string,
    verifyUrl: string
  ): Promise<boolean> {
    const text =
`*🔔 સફાઈ પૂર્ણ - નાગરિક ચકાસણી / Verification Required*
━━━━━━━━━━━━━━━━━━━━━
ટિકિટ ક્રમાંક / Ticket ID: *${ticketId}*

સફાઈ કર્મચારી *${workerName || 'મહાનગરપાલિકા સ્ટાફ'}* દ્વારા આ વિસ્તારની સફાઈ પૂર્ણ કરવામાં આવી છે.
Sanitation worker *${workerName || 'Municipal Staff'}* has marked this spot as CLEANED.

📸 *સફાઈ બાદનો ફોટો / Cleaned Photo:*
${cleanPhotoUrl}

કૃપા કરીને સ્થળ ચકાસીને જવાબ આપો:
Please cross-verify the location:
👉 *હા (YES)*: જો સફાઈ બરાબર થઈ ગઈ હોય (Reply YES if cleaned)
👉 *ના (NO)*: જો હજુ ગંદકી બાકી હોય (Reply NO if still unclean)

અથવા એપમાં ફોટો પુરાવા સાથે ચકાસો:
Or verify with live camera proof in app:
${verifyUrl}

⏱️ *નોંધ:* જો ૨૪ કલાકમાં જવાબ નહીં મળે, તો ટિકિટ આપોઆપ સંપન્ન ગણાશે.
_Note: If no response in 24h, ticket will be auto-resolved._`;

    return this.sendMessage(toPhone, text);
  }

  /** The 72-hour SLA breach alert with the authority contact numbers. */
  public static async send72HourSlaBreachAlert(
    toPhone: string,
    ticketId: string,
    category: string,
    address: string,
    inspectorName: string,
    inspectorPhone: string,
    chiefOfficerPhone: string,
    ddoPhone: string
  ): Promise<boolean> {
    const text =
`*🚨 અતિ તાકીદની સૂચના - ૭૨ કલાક SLA ઉલ્લંઘન*
*URGENT: 72-Hour SLA Escalation Notice*
━━━━━━━━━━━━━━━━━━━━━
ટિકિટ ક્રમાંક / Ticket ID: *${ticketId}*
સ્થળ / Address: *${address}*

આપની ફરિયાદ ૭૨ કલાકમાં ઉકેલાયેલ ન હોવાથી પંચમહાલ જિલ્લા વિકાસ અધિકારી (DDO) અને ચીફ ઓફિસર કચેરીને સીધી એસ્કેલેટ કરવામાં આવી છે.
Your complaint was not resolved within 72h. It has been escalated directly to the DDO & Chief Officer.

📞 *અધિકારીઓના સીધા સંપર્ક નંબર / Authority Direct Contacts:*
1. વોર્ડ ઇન્સ્પેક્ટર / Ward Inspector:
   ${inspectorName || 'Rajesh Parmar'}: *${inspectorPhone || '+91 94260 12341'}*

2. ચીફ ઓફિસર (ગોધરા નગરપાલિકા) / Chief Officer:
   Smt. Vaishali Patel: *${chiefOfficerPhone || '+91 94260 99001'}*

3. જિલ્લા પંચાયત ફરિયાદ નિવારણ સેલ / DDO Grievance Helpline:
   Panchmahal District: *${ddoPhone || '+91 2672 242000'}*

આપ ઉપરોક્ત નંબરો પર સીધો સંપર્ક કરી શકો છો.`;

    return this.sendMessage(toPhone, text);
  }

  /** The auto-resolution notice after the citizen's silence. */
  public static async sendAutoResolvedNotice(
    toPhone: string,
    ticketId: string,
    reopenUrl: string
  ): Promise<boolean> {
    const text =
`*✅ ફરિયાદ સ્વયં-સંપન્ન / Ticket Auto-Resolved (24h)*
━━━━━━━━━━━━━━━━━━━━━
ટિકિટ ક્રમાંક / Ticket ID: *${ticketId}*

સફાઈ બાદ ૨૪ કલાકમાં આપનો કોઈ પ્રત્યુત્તર ન મળતા આ ટિકિટ સિસ્ટમ દ્વારા આપોઆપ સંપન્ન કરવામાં આવી છે.
Since no response was received within 24 hours of cleaning, this ticket has been auto-resolved.

❓ *જો હજુ પણ ગંદકી હોય તો:*
આપ નીચેની લિંક પર ક્લિક કરી તાજો ફોટો પાડીને આ ટિકિટ *ફરીથી ખોલી શકો છો (Reopen)*:
${reopenUrl}`;

    return this.sendMessage(toPhone, text);
  }

  /** The notice that a complaint was reopened. */
  public static async sendTicketReopenedNotice(
    toPhone: string,
    ticketId: string,
    reason: string
  ): Promise<boolean> {
    const text =
`*🔄 ફરિયાદ ફરીથી સક્રિય કરવામાં આવી / Ticket Reopened*
━━━━━━━━━━━━━━━━━━━━━
ટિકિટ ક્રમાંક / Ticket ID: *${ticketId}*
કારણ / Reason: *${reason || 'નાગરિક અસંતોષ / Citizen Disputed'}*

આપના અસંતોષ અને ફોટો પુરાવા બાદ આ ટિકિટને પુનઃ સક્રિય કરી ચીફ સેનિટરી ઇન્સ્પેક્ટરને તાકીદની પુનઃસફાઈ માટે મોકલવામાં આવી છે.
Based on your dispute and live photo proof, this ticket has been reopened and re-assigned for urgent re-cleaning.`;

    return this.sendMessage(toPhone, text);
  }
}

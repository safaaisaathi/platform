// whatsappWebhook.ts
//
// The one endpoint on the internet.
//
// Two things it must never do: trust an unverified payload, and let a bad
// payload write anything.
//
//   GET   Meta's subscription handshake. The verify token must match, or the
//         request is refused.
//   POST  An inbound message. The provider's signature is checked against the
//         raw body BEFORE anything is read from it. A signature that does not
//         match is rejected with 401 and nothing is written.
//
// The signed message becomes a complaint. Its fields come from
// 02-contracts/collections/complaint.schema.json, and only from there: status
// received, escalationLevel 0, and a server timestamp for createdAt. The
// sender's number is the identity in the payload, so it is the deviceId and
// the masked phone is derived from it.
//
// The verify token and the app secret are Firebase secrets, so the whole
// function is wrapped with `runWith({ secrets: [...] })`.

import * as functions from 'firebase-functions/v1';
import * as crypto from 'crypto';
import { defineSecret } from 'firebase-functions/params';

import { db, serverNow } from '../lib/firebase';
import { maskPhone } from '../lib/phone';
import { distanceMeters, istDayKey, type GeoPoint } from '../lib/time';
import {
  WHATSAPP_CLOUD_API_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_FROM,
  WhatsAppBotService,
} from '../lib/whatsappService';

// The verification credentials. The Meta handshake uses the verify token and
// the POST signature uses the app secret.
const WHATSAPP_VERIFY_TOKEN = defineSecret('WHATSAPP_VERIFY_TOKEN');
const WHATSAPP_APP_SECRET = defineSecret('WHATSAPP_APP_SECRET');

/** The complaint statuses and default category this webhook writes. */
const STATUS_RECEIVED = 'received';
const CATEGORY_OTHER = 'other';
const ESCALATION_LEVEL_RECEIVED = 0;

/** The Meta signature header, and the prefix its value carries. */
const SIGNATURE_HEADER = 'x-hub-signature-256';
const SIGNATURE_PREFIX = 'sha256=';

// --- small helpers ----------------------------------------------------------

/** A secret's value, or an empty string when it is not configured. */
function secretValue(secret: { value(): string }): string {
  try {
    return secret.value();
  } catch {
    return '';
  }
}

/** A stored {lat, lng} as a point, or undefined when the shape is wrong. */
function asGeo(value: unknown): GeoPoint | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.lat !== 'number' || typeof record.lng !== 'number') return undefined;
  return { lat: record.lat, lng: record.lng };
}

/**
 * Check Meta's HMAC signature over the raw body.
 *
 * The comparison is timing-safe, because a byte-by-byte compare leaks the
 * expected signature to an attacker who can measure the response time.
 */
function verifyMetaSignature(
  rawBody: Buffer | undefined,
  header: string | undefined,
  appSecret: string
): boolean {
  if (rawBody === undefined || appSecret.length === 0) return false;
  if (header === undefined || !header.startsWith(SIGNATURE_PREFIX)) return false;

  const provided = header.slice(SIGNATURE_PREFIX.length);
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

// --- inbound parsing --------------------------------------------------------

interface InboundMessage {
  fromPhone: string;
  text: string;
  location?: GeoPoint;
}

function geoFrom(lat: unknown, lng: unknown): GeoPoint | undefined {
  if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  return undefined;
}

/**
 * Read the sender, the text and any location out of either provider shape:
 * Twilio's flat form body, or Meta's nested entry/changes/value/messages.
 */
function parseInbound(body: unknown): InboundMessage | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const root = body as Record<string, unknown>;

  // Twilio shape: a flat body with From and Body.
  if (typeof root.From === 'string' && root.From.length > 0) {
    const message: InboundMessage = {
      fromPhone: WhatsAppBotService.sanitizePhone(root.From),
      text: typeof root.Body === 'string' ? root.Body : '',
    };
    const location = geoFrom(root.Latitude, root.Longitude);
    if (location !== undefined) message.location = location;
    return message;
  }

  // Meta shape: entry[0].changes[0].value.messages[0].
  const entry = Array.isArray(root.entry) ? root.entry[0] : undefined;
  if (typeof entry !== 'object' || entry === null) return undefined;
  const entryRecord = entry as Record<string, unknown>;

  const changes = Array.isArray(entryRecord.changes) ? entryRecord.changes[0] : undefined;
  if (typeof changes !== 'object' || changes === null) return undefined;
  const value = (changes as Record<string, unknown>).value;
  if (typeof value !== 'object' || value === null) return undefined;
  const valueRecord = value as Record<string, unknown>;

  const first = Array.isArray(valueRecord.messages) ? valueRecord.messages[0] : undefined;
  if (typeof first !== 'object' || first === null) return undefined;
  const message = first as Record<string, unknown>;

  const from = message.from;
  if (typeof from !== 'string' || from.length === 0) return undefined;

  const textObj = message.text;
  const text =
    typeof textObj === 'object' && textObj !== null && typeof (textObj as Record<string, unknown>).body === 'string'
      ? String((textObj as Record<string, unknown>).body)
      : '';

  const locObj = message.location;
  const location =
    typeof locObj === 'object' && locObj !== null
      ? geoFrom((locObj as Record<string, unknown>).latitude, (locObj as Record<string, unknown>).longitude)
      : undefined;

  const result: InboundMessage = { fromPhone: WhatsAppBotService.sanitizePhone(from), text };
  if (location !== undefined) result.location = location;
  return result;
}

// --- complaint creation -----------------------------------------------------

/** The human id shape is PMH-YYYYMMDD-NNNN. */
function makeTicketId(dayKey: string): string {
  const compactDay = dayKey.replace(/-/g, '');
  const sequence = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `PMH-${compactDay}-${sequence}`;
}

/** The ward whose circle contains the point, or undefined when none do. */
async function resolveWard(location: GeoPoint): Promise<string | undefined> {
  const wardsSnap = await db.collection('wards').get();

  let bestId: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const doc of wardsSnap.docs) {
    const ward: Record<string, unknown> = doc.data() ?? {};
    const center = asGeo(ward.center);
    const radiusM = typeof ward.radiusM === 'number' ? ward.radiusM : undefined;
    if (center === undefined || radiusM === undefined) continue;

    const distance = distanceMeters(location, center);
    if (distance <= radiusM && distance < bestDistance) {
      bestDistance = distance;
      bestId = doc.id;
    }
  }
  return bestId;
}

/**
 * Turn a signed inbound message into a complaint.
 *
 * A ward is required by the complaint schema, and the only way to place a
 * WhatsApp message is the location the provider sent. A message with no
 * location cannot be placed, so nothing is written.
 */
async function createComplaint(message: InboundMessage): Promise<string | undefined> {
  if (message.location === undefined) return undefined;

  const wardId = await resolveWard(message.location);
  if (wardId === undefined) return undefined;

  const ref = db.collection('complaints').doc();
  const ticketId = makeTicketId(istDayKey());

  await ref.set({
    id: ref.id,
    ticketId,
    // The sender's number is the only identity in the payload.
    deviceId: message.fromPhone,
    category: CATEGORY_OTHER,
    location: { lat: message.location.lat, lng: message.location.lng },
    wardId,
    phoneMasked: maskPhone(message.fromPhone),
    createdAt: serverNow(),
    status: STATUS_RECEIVED,
    escalationLevel: ESCALATION_LEVEL_RECEIVED,
  });

  return ticketId;
}

// --- whatsappWebhook --------------------------------------------------------

export const whatsappWebhook = functions
  .runWith({
    secrets: [
      WHATSAPP_CLOUD_API_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID,
      TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN,
      TWILIO_WHATSAPP_FROM,
      WHATSAPP_VERIFY_TOKEN,
      WHATSAPP_APP_SECRET,
    ],
  })
  .https.onRequest(async (req, res) => {
    // The subscription handshake. Meta echoes the challenge when the verify
    // token matches.
    if (req.method === 'GET') {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      const expectedToken = secretValue(WHATSAPP_VERIFY_TOKEN);
      if (mode === 'subscribe' && expectedToken.length > 0 && token === expectedToken) {
        res.status(200).send(challenge);
        return;
      }
      res.status(403).send('Forbidden');
      return;
    }

    // The signature is verified BEFORE anything is read from the payload.
    const signature = req.get(SIGNATURE_HEADER);
    if (!verifyMetaSignature(req.rawBody, signature, secretValue(WHATSAPP_APP_SECRET))) {
      res.status(401).send('Unauthorized');
      return;
    }

    try {
      const message = parseInbound(req.body);
      if (message !== undefined) {
        console.log(`[WhatsApp webhook] inbound from ${message.fromPhone}: ${message.text}`);
        const ticketId = await createComplaint(message);
        if (ticketId !== undefined) {
          try {
            await WhatsAppBotService.sendMessage(
              message.fromPhone,
              `✅ આપની ફરિયાદ નોંધાઈ છે. ટિકિટ ક્રમાંક: ${ticketId}\nYour complaint has been registered. Ticket ID: ${ticketId}`
            );
          } catch (err) {
            console.warn('WhatsApp acknowledgement deferred:', err);
          }
        }
      }
    } catch (err) {
      console.error('Error in WhatsApp webhook:', err);
    }

    res.status(200).send({ received: true });
  });

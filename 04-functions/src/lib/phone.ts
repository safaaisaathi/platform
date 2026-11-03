// phone.ts
//
// The mask is applied at the SOURCE, not by the reader.
//
// A raw phone number never sits in a collection the apps can read. It sits
// in staffPhones/{code}, which only the callables read. The readable copy
// is drivers.phoneMasked, which is this shape:
//
//     98XXXXXX10
//
// PHONE_MASK_FORMAT in 02-contracts/constants.json is the authority for
// that shape. A different length breaks the confirm card's layout.

/**
 * Mask a raw phone number.
 *
 * The mask is `98XXXXXX` plus the last two digits of the number. The leading
 * `98` is FIXED, not the number's own first two digits, so a mask never leaks
 * which network or which state the number belongs to. Only the last two
 * digits survive, because the office needs to recognise a number it has
 * already called.
 *
 * An Indian mobile is ten digits, so the mask is ten characters too:
 * `98XXXXXX10`. That is PHONE_MASK_FORMAT.
 */
export function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 2) return '98XXXXXX00';
  return `98XXXXXX${digits.slice(-2)}`;
}

/**
 * A phone is 10 digits and starts with 6, 7, 8 or 9. The admin panel
 * normalises before it calls the callable; this is the server's own check,
 * because the server does not trust the panel.
 */
export function isValidIndianPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 && /^[6789]/.test(digits);
}

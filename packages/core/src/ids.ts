// Web Crypto: works in Node 24 and in the browser.

// No 0/O, 1/I/L: easy to read aloud and type.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function randomIndex(n: number): number {
  // Rejection sampling to avoid modulo bias.
  const limit = 256 - (256 % n);
  const buf = new Uint8Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0]! < limit) return buf[0]! % n;
  }
}

/** Short human id for a request, e.g. "K7Q2MX". */
export function shortId(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomIndex(ALPHABET.length)];
  return out;
}

/** Url-safe random token for invites (valid as a Telegram /start parameter). */
export function inviteToken(bytes = 12): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

import crypto from "crypto";

function base32Decode(base32: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = base32.toUpperCase().replace(/=+$/, "");
  let bits = "";
  for (let i = 0; i < cleaned.length; i++) {
    const val = alphabet.indexOf(cleaned.charAt(i));
    if (val === -1) throw new Error("Invalid base32 character");
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateHOTP(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(0, 0);
  buffer.writeUInt32BE(counter, 4);

  const hmac = crypto.createHmac("sha1", key);
  hmac.update(buffer);
  const digest = hmac.digest();

  const lastByte = digest[digest.length - 1];
  if (lastByte === undefined) {
    throw new Error("HMAC digest is empty.");
  }
  const offset = lastByte & 0xf;

  const b0 = digest[offset];
  const b1 = digest[offset + 1];
  const b2 = digest[offset + 2];
  const b3 = digest[offset + 3];

  if (b0 === undefined || b1 === undefined || b2 === undefined || b3 === undefined) {
    throw new Error("Invalid digest offset.");
  }

  const code =
    ((b0 & 0x7f) << 24) |
    ((b1 & 0xff) << 16) |
    ((b2 & 0xff) << 8) |
    (b3 & 0xff);

  const otp = code % 1000000;
  return otp.toString().padStart(6, "0");
}

export function generateSecret(length = 16): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let secret = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    const byte = bytes[i];
    if (byte === undefined) {
      throw new Error("Failed to generate random bytes.");
    }
    secret += alphabet.charAt(byte % 32);
  }
  return secret;
}

export function getTOTPCode(secret: string, time = Date.now()): string {
  const counter = Math.floor(time / 1000 / 30);
  return generateHOTP(secret, counter);
}

export function verifyTOTP(secret: string, code: string, window = 1): boolean {
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let i = -window; i <= window; i++) {
    if (generateHOTP(secret, counter + i) === code) {
      return true;
    }
  }
  return false;
}

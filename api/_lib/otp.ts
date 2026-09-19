export const OTP_TTL_MS = 15 * 60 * 1000;

const OTP_FORMAT = /^\d{6}$/;

export function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function isOtpFormatValid(code: unknown): code is string {
  return typeof code === "string" && OTP_FORMAT.test(code);
}

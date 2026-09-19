export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 15 * 60 * 1000;

const OTP_FORMAT = /^\d{6}$/;

export interface OtpTicket {
  code: string;
  expiresAt: number;
}

export function generateOtp(): OtpTicket {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  return { code, expiresAt: Date.now() + OTP_TTL_MS };
}

export function isOtpFormatValid(code: string): boolean {
  return OTP_FORMAT.test(code);
}

export function isOtpExpired(ticket: OtpTicket | null): boolean {
  return !ticket || Date.now() > ticket.expiresAt;
}

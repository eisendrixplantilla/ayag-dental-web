import emailjs from "@emailjs/browser";
import { formatManilaTime } from "./formatDate";

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const TEMPLATE_OTP_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_OTP_ID;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

export function sendOtpEmail(email: string, passcode: string, validMinutes = 15) {
  const time = formatManilaTime(new Date(Date.now() + validMinutes * 60_000));

  return emailjs.send(
    SERVICE_ID,
    TEMPLATE_OTP_ID,
    { email, passcode, time },
    { publicKey: PUBLIC_KEY }
  );
}

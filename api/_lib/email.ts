import { manilaTimeStr } from "./date.js";

export async function sendOtpEmail(email: string, code: string, validMinutes: number) {
  const time = manilaTimeStr(new Date(Date.now() + validMinutes * 60_000));

  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: process.env.VITE_EMAILJS_SERVICE_ID,
      template_id: process.env.VITE_EMAILJS_TEMPLATE_OTP_ID,
      user_id: process.env.VITE_EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: { email, passcode: code, time },
    }),
  });

  if (!res.ok) {
    throw new Error(`EmailJS send failed: ${res.status} ${await res.text()}`);
  }
}

export interface AppointmentEmailParams {
  email: string;
  status: "confirmed" | "rejected" | "cancelled" | "rescheduled";
  patientName: string;
  service: string;
  dentistName: string | null;
  date: string;
  time: string;
  message?: string;
}

const STATUS_LABELS: Record<AppointmentEmailParams["status"], string> = {
  confirmed: "Confirmed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
};

/** "13:00" -> "1:00 PM", matching how times are shown in the app. */
function to12Hour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export async function sendAppointmentEmail(params: AppointmentEmailParams) {
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: process.env.VITE_EMAILJS_SERVICE_ID,
      template_id: process.env.VITE_EMAILJS_TEMPLATE_APPOINTMENT_ID,
      user_id: process.env.VITE_EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: {
        email: params.email,
        status: STATUS_LABELS[params.status],
        patient_name: params.patientName,
        service: params.service,
        dentist_name: params.dentistName ?? "our clinic team",
        appointment_date: params.date,
        appointment_time: to12Hour(params.time),
        message: params.message ?? "",
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`EmailJS send failed: ${res.status} ${await res.text()}`);
  }
}

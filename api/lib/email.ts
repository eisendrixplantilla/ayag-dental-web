export async function sendOtpEmail(email: string, code: string, validMinutes: number) {
  const time = new Date(Date.now() + validMinutes * 60_000).toLocaleTimeString();

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

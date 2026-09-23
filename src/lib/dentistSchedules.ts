import { format } from "date-fns";

export const toKey = (d: Date) => format(d, "yyyy-MM-dd");

export const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export const toLabel = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
};

export const toValue = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/** "1:00 PM" on its own, or "1:00 PM – 2:30 PM" once the visit's length is known.
 * Bookings saved before end times were recorded have none, so they show the start only. */
export const formatTimeRange = (time: string, endTime?: string | null) =>
  toLabel(toMinutes(time)) + (endTime ? ` – ${toLabel(toMinutes(endTime))}` : "");

import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { sql } from "./_lib/db.js";
import { getSessionFromRequest } from "./_lib/auth.js";
import { splitName, joinName } from "./_lib/name.js";
import { manilaDateStr } from "./_lib/date.js";
import { ensureBookingTables, hoursFor, limitsFor, mapServiceHours } from "./_lib/bookingLimits.js";
import { displayService } from "./_lib/services.js";
import { assignCodes, ensureCodes } from "./_lib/codes.js";
import { CONSENT_FIELDS, DEFAULT_CONSENT, MAX_CONSENT_TEXT, consentTemplate, ensureConsentTables } from "./_lib/consent.js";
import {
  MAX_LEAVE_DAYS, TIME, approveLeave, changeOf, datesBetween, ensureLeaveTable, ensureUnavailableTimes, leaveDates, mapLeave, nameOf,
  removeLeaveDays, saveChange, shortenLeave,
} from "./_lib/leave.js";

function mapStaff(u: any) {
  return {
    id: u.id,
    employeeId: u.employee_id,
    name: joinName(u.first_name, u.middle_name, u.last_name),
    email: u.email,
    contact: u.contact_number,
    role: u.role,
    status: u.status,
    photoUrl: u.photo_url,
    createdAt: manilaDateStr(u.created_at),
    archivedAt: manilaDateStr(u.archived_at),
    archivedBy: u.archived_by,
    archivedReason: u.archived_reason,
  };
}

function requireSuperAdmin(req: VercelRequest, res: VercelResponse) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "superadmin") {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return session;
}

function mapUnavailable(u: any) {
  return {
    id: u.id,
    date: new Date(u.unavailable_date).toISOString().slice(0, 10),
    reason: u.reason,
    remarks: u.remarks,
    // Part of the day only (from leave for some hours); null for the whole day.
    startTime: u.start_time ?? null,
    endTime: u.end_time ?? null,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET" && req.query.directory === "true") {
    if (!getSessionFromRequest(req)) return res.status(401).json({ error: "Unauthorized" });
    const rows = await sql`SELECT id, first_name, middle_name, last_name FROM users WHERE role = 'dentist' AND status = 'active' ORDER BY last_name`;
    return res.status(200).json({ dentists: rows.map((r) => ({ id: r.id, name: joinName(r.first_name, r.middle_name, r.last_name) })) });
  }

  // The clinic's public details: what every printed document carries under its name, and
  // what the landing page's footer shows visitors. Read-only and open to anyone, since it
  // is only the name, address, phone, email and hours the clinic advertises anyway;
  // editing stays with the superadmin below.
  if (req.method === "GET" && req.query.letterhead === "true") {
    const [info] = await sql`/* letterhead-info */ SELECT name, phone, email, address FROM clinic_info WHERE id = 1`;
    const hours = await sql`/* letterhead-hours */
      SELECT day, open_time, close_time, enabled FROM clinic_hours
      ORDER BY CASE day
        WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4
        WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 WHEN 'Sunday' THEN 7 END`;
    return res.status(200).json({
      info: info ?? null,
      hours: hours.map((r) => ({ day: r.day, open: r.open_time, close: r.close_time, enabled: r.enabled })),
    });
  }

  // Each active dentist as patients choose between them: name, photo, the services they
  // offer (null = every service), working days and hours, and daily limits. Public, as
  // the home page lists the dentists too — none of it is more than the clinic advertises.
  if (req.method === "GET" && req.query.dentistProfiles === "true") {
    await Promise.all([ensureBookingTables(), ensureUnavailableTimes()]);
    const today = manilaDateStr(new Date());
    const [dentists, days, offered, limits, hours, away] = await Promise.all([
      sql`/* dentist-profiles */ SELECT id, first_name, middle_name, last_name, photo_url FROM users
        WHERE role = 'dentist' AND status = 'active' ORDER BY last_name, first_name`,
      sql`/* profile-days */ SELECT dentist_id, day_of_week, start_time, end_time FROM dentist_schedules ORDER BY day_of_week`,
      sql`/* profile-services */ SELECT dentist_id, service_name FROM dentist_services`,
      sql`/* profile-limits */ SELECT dentist_id, service_name, daily_limit FROM dentist_service_limits`,
      sql`/* profile-hours */ SELECT dentist_id, service_name, days, start_time, end_time, day_limits FROM dentist_service_hours`,
      // Only the coming dates, each with why (shown when pointing at it).
      sql`/* profile-unavailable */ SELECT dentist_id, unavailable_date, reason, start_time, end_time FROM dentist_unavailable
        WHERE unavailable_date >= ${today} ORDER BY unavailable_date`,
    ]);
    const forDentist = <T extends { dentist_id: string }>(rows: T[], id: string) => rows.filter((r) => r.dentist_id === id);
    return res.status(200).json({
      dentists: (dentists as any[]).map((d) => {
        const services = forDentist(offered as any[], d.id).map((r) => displayService(r.service_name as string));
        return {
          id: d.id,
          name: joinName(d.first_name, d.middle_name, d.last_name),
          photoUrl: d.photo_url ?? null,
          services: services.length ? services : null,
          days: forDentist(days as any[], d.id).map((r) => ({ dayOfWeek: r.day_of_week, start: r.start_time, end: r.end_time })),
          limits: forDentist(limits as any[], d.id).map((r) => ({ service: displayService(r.service_name as string), dailyLimit: Number(r.daily_limit) })),
          hours: forDentist(hours as any[], d.id).map(mapServiceHours),
          unavailable: forDentist(away as any[], d.id).map((r) => {
            const u = mapUnavailable(r);
            return { date: u.date, reason: r.reason ?? null, startTime: u.startTime, endTime: u.endTime };
          }),
        };
      }),
    });
  }

  // Which services a dentist offers; set by the superadmin. An empty list means all of them.
  if (req.method === "PUT" && req.query.dentistServices === "true") {
    if (!requireSuperAdmin(req, res)) return;
    const { dentistId, services } = req.body ?? {};
    if (!dentistId || !Array.isArray(services)) return res.status(400).json({ error: "Missing dentistId or services" });
    const names = [...new Set(services.map((x: unknown) => String(x ?? "").trim()).filter(Boolean))];
    await ensureBookingTables();
    await sql`/* clear-dentist-services */ DELETE FROM dentist_services WHERE dentist_id = ${dentistId}`;
    for (const name of names) {
      await sql`/* save-dentist-service */ INSERT INTO dentist_services (dentist_id, service_name) VALUES (${dentistId}, ${name})`;
    }
    return res.status(200).json({ services: names });
  }

  // The days and hours a dentist keeps for particular services (read with the schedule);
  // set by the superadmin. A service left out can be booked whenever the dentist works.
  if (req.method === "PUT" && req.query.serviceHours === "true") {
    if (!requireSuperAdmin(req, res)) return;
    const { dentistId, hours } = req.body ?? {};
    if (!dentistId || !Array.isArray(hours)) return res.status(400).json({ error: "Missing dentistId or hours" });
    const isTime = (t: unknown) => typeof t === "string" && /^\d{2}:\d{2}$/.test(t);
    const clean = hours
      .map((h: { service?: unknown; days?: unknown; start?: unknown; end?: unknown; dayLimits?: unknown }) => {
        const days = [...new Set((Array.isArray(h.days) ? h.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
        // A number only for a day the service is done on.
        const given = h.dayLimits && typeof h.dayLimits === "object" ? h.dayLimits as Record<string, unknown> : {};
        const dayLimits = Object.fromEntries(days.map((d) => [String(d), Number(given[String(d)])] as const)
          .filter(([, n]) => Number.isInteger(n) && n > 0));
        return {
          service: String(h.service ?? "").trim(),
          days,
          start: isTime(h.start) && isTime(h.end) ? String(h.start) : null,
          end: isTime(h.start) && isTime(h.end) ? String(h.end) : null,
          dayLimits,
        };
      })
      .filter((h) => h.service && (h.days.length > 0 || h.start));
    const backwards = clean.find((h) => h.start && h.end && h.start >= h.end);
    if (backwards) return res.status(400).json({ error: `The hours for ${backwards.service} must end after they start` });
    await ensureBookingTables();
    await sql`/* clear-service-hours */ DELETE FROM dentist_service_hours WHERE dentist_id = ${dentistId}`;
    for (const h of clean) {
      await sql`/* save-service-hours */
        INSERT INTO dentist_service_hours (dentist_id, service_name, days, start_time, end_time, day_limits)
        VALUES (${dentistId}, ${h.service}, ${h.days}::int[], ${h.start}, ${h.end}, ${JSON.stringify(h.dayLimits)}::jsonb)`;
    }
    return res.status(200).json({ hours: clean });
  }

  // How many of each procedure a dentist takes in a day. Anyone signed in reads them
  // (the booking calendars show what's left); only the superadmin sets them.
  if (req.query.serviceLimits === "true") {
    if (req.method === "GET") {
      if (!getSessionFromRequest(req)) return res.status(401).json({ error: "Unauthorized" });
      const dentistId = typeof req.query.dentistId === "string" ? req.query.dentistId : null;
      const dentistName = typeof req.query.dentistName === "string" ? req.query.dentistName : null;
      if (!dentistId && !dentistName) return res.status(400).json({ error: "Missing dentistId" });
      const limits = await limitsFor(dentistId, dentistName);
      return res.status(200).json({
        limits: [...limits].map(([service, dailyLimit]) => ({ service, dailyLimit })),
      });
    }
    if (req.method === "PUT") {
      if (!requireSuperAdmin(req, res)) return;
      const { dentistId, limits } = req.body ?? {};
      if (!dentistId || !Array.isArray(limits)) return res.status(400).json({ error: "Missing dentistId or limits" });
      const clean = limits
        .map((l: { service?: unknown; dailyLimit?: unknown }) => ({ service: String(l.service ?? "").trim(), dailyLimit: Number(l.dailyLimit) }))
        .filter((l: { service: string; dailyLimit: number }) => l.service && Number.isInteger(l.dailyLimit) && l.dailyLimit > 0);
      await ensureBookingTables();
      await sql`/* clear-service-limits */ DELETE FROM dentist_service_limits WHERE dentist_id = ${dentistId}`;
      for (const l of clean) {
        await sql`/* save-service-limit */
          INSERT INTO dentist_service_limits (dentist_id, service_name, daily_limit)
          VALUES (${dentistId}, ${l.service}, ${l.dailyLimit})`;
      }
      return res.status(200).json({ limits: clean });
    }
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (req.query.schedule === "true") {
    if (req.method === "GET") await ensureUnavailableTimes();
    const dentistId = typeof req.query.dentistId === "string" ? req.query.dentistId : undefined;

    const mapDay = (d: any) => ({
      dayOfWeek: d.day_of_week,
      start: d.start_time,
      end: d.end_time,
      lunchStart: d.lunch_start,
      lunchEnd: d.lunch_end,
      duration: d.duration_minutes,
      maxPatients: d.max_patient,
    });

    // Everyone's days and days off in two queries, for the superadmin's weekly grid.
    if (req.method === "GET" && req.query.all === "true") {
      if (!requireSuperAdmin(req, res)) return;
      const [days, unavailable] = await Promise.all([
        sql`/* schedules-all-days */ SELECT dentist_id, day_of_week, start_time, end_time, lunch_start, lunch_end, duration_minutes, max_patient FROM dentist_schedules ORDER BY day_of_week`,
        sql`/* schedules-all-unavailable */ SELECT id, dentist_id, unavailable_date, reason, remarks, start_time, end_time FROM dentist_unavailable ORDER BY unavailable_date`,
      ]);
      const schedules: Record<string, { days: ReturnType<typeof mapDay>[]; unavailable: ReturnType<typeof mapUnavailable>[] }> = {};
      const of = (id: string) => (schedules[id] ??= { days: [], unavailable: [] });
      for (const d of days as any[]) of(d.dentist_id).days.push(mapDay(d));
      for (const u of unavailable as any[]) of(u.dentist_id).unavailable.push(mapUnavailable(u));
      return res.status(200).json({ schedules });
    }

    if (req.method === "GET") {
      if (!getSessionFromRequest(req)) return res.status(401).json({ error: "Unauthorized" });
      if (!dentistId) return res.status(400).json({ error: "Missing dentistId" });
      const [days, unavailable, serviceHours] = await Promise.all([
        sql`SELECT day_of_week, start_time, end_time, lunch_start, lunch_end, duration_minutes, max_patient FROM dentist_schedules WHERE dentist_id = ${dentistId} ORDER BY day_of_week`,
        sql`SELECT id, unavailable_date, reason, remarks, start_time, end_time FROM dentist_unavailable WHERE dentist_id = ${dentistId} ORDER BY unavailable_date`,
        // Extra: a schedule still loads if these can't be read.
        hoursFor(dentistId, null).catch(() => []),
      ]);
      return res.status(200).json({
        days: days.map(mapDay),
        unavailable: unavailable.map(mapUnavailable),
        serviceHours,
      });
    }

    if (req.method === "PUT") {
      if (!requireSuperAdmin(req, res)) return;
      const { dentistId: bodyDentistId, days } = req.body ?? {};
      if (!bodyDentistId || !Array.isArray(days)) return res.status(400).json({ error: "Missing dentistId or days" });
      await sql`DELETE FROM dentist_schedules WHERE dentist_id = ${bodyDentistId}`;
      for (const d of days) {
        await sql`
          INSERT INTO dentist_schedules (dentist_id, day_of_week, start_time, end_time, lunch_start, lunch_end, duration_minutes, max_patient)
          VALUES (${bodyDentistId}, ${d.dayOfWeek}, ${d.start}, ${d.end}, ${d.lunchStart ?? null}, ${d.lunchEnd ?? null}, ${d.duration ?? 30}, ${d.maxPatients ?? 20})
        `;
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  if (req.query.clinicHours === "true") {
    if (!requireSuperAdmin(req, res)) return;

    if (req.method === "GET") {
      const rows = await sql`
        SELECT day, open_time, close_time, enabled FROM clinic_hours
        ORDER BY CASE day
          WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4
          WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 WHEN 'Sunday' THEN 7 END
      `;
      return res.status(200).json({
        hours: rows.map((r) => ({ day: r.day, open: r.open_time, close: r.close_time, enabled: r.enabled })),
      });
    }

    if (req.method === "PUT") {
      const { hours } = req.body ?? {};
      if (!Array.isArray(hours)) return res.status(400).json({ error: "Missing hours" });
      for (const h of hours) {
        await sql`
          INSERT INTO clinic_hours (day, open_time, close_time, enabled)
          VALUES (${h.day}, ${h.open ?? "00:00"}, ${h.close ?? "00:00"}, ${h.enabled ?? false})
          ON CONFLICT (day) DO UPDATE SET open_time = EXCLUDED.open_time, close_time = EXCLUDED.close_time, enabled = EXCLUDED.enabled
        `;
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  if (req.query.clinicInfo === "true") {
    if (!requireSuperAdmin(req, res)) return;

    if (req.method === "GET") {
      const rows = await sql`SELECT name, phone, email, address FROM clinic_info WHERE id = 1`;
      return res.status(200).json({ info: rows[0] ?? null });
    }

    if (req.method === "PUT") {
      const { name, phone, email, address } = req.body ?? {};
      await sql`
        UPDATE clinic_info SET
          name = COALESCE(${name ?? null}, name),
          phone = COALESCE(${phone ?? null}, phone),
          email = COALESCE(${email ?? null}, email),
          address = COALESCE(${address ?? null}, address),
          updated_at = now()
        WHERE id = 1
      `;
      const rows = await sql`SELECT name, phone, email, address FROM clinic_info WHERE id = 1`;
      return res.status(200).json({ info: rows[0] });
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  // The wording of the patient's consent form (see _lib/consent). Empty goes back to the
  // standard wording.
  if (req.query.consentText === "true") {
    if (!requireSuperAdmin(req, res)) return;
    await ensureConsentTables();

    if (req.method === "PUT") {
      const { text } = req.body ?? {};
      if (text != null && typeof text !== "string") return res.status(400).json({ error: "text must be a string" });
      const own = (text ?? "").trim();
      if (own.length > MAX_CONSENT_TEXT) {
        return res.status(400).json({ error: `The consent form can be at most ${MAX_CONSENT_TEXT} characters.` });
      }
      await sql`/* consent-text-save */ UPDATE clinic_info SET consent_text = ${own || null}, updated_at = now() WHERE id = 1`;
    } else if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }
    const t = await consentTemplate();
    return res.status(200).json({ text: t.text, custom: t.custom, standard: DEFAULT_CONSENT, fields: CONSENT_FIELDS });
  }

  // Leave: a dentist asks for days off; the superadmin approves (turning each day into an
  // Unavailable Date) or rejects it. It can only be approved once no booking holds those
  // days, so no patient is left booked with a dentist who isn't there.
  if (req.query.leave === "true") {
    const session = getSessionFromRequest(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    await ensureLeaveTable();
    const leaveId = typeof req.query.id === "string" ? req.query.id : undefined;
    // dentist_id holds whoever asked: dentists, and admins too.
    const SELECT_LEAVE = `SELECT l.*, u.first_name, u.middle_name, u.last_name, u.role
      FROM leave_requests l JOIN users u ON u.id = l.dentist_id`;

    if (req.method === "GET") {
      // Dentists see their own; the superadmin all (or one person's); the front desk its own,
      // plus everyone's approved leave still to come, to know who's away.
      let rows: any[];
      if (session.role === "dentist") {
        rows = await sql.query(`${SELECT_LEAVE} WHERE l.dentist_id = $1 ORDER BY l.created_at DESC`, [session.sub]) as any[];
      } else if (session.role === "superadmin") {
        const dentistId = typeof req.query.dentistId === "string" ? req.query.dentistId : null;
        rows = dentistId
          ? await sql.query(`${SELECT_LEAVE} WHERE l.dentist_id = $1 ORDER BY l.created_at DESC`, [dentistId]) as any[]
          : await sql.query(`${SELECT_LEAVE} ORDER BY l.created_at DESC`) as any[];
      } else if (session.role === "admin") {
        rows = await sql.query(
          `${SELECT_LEAVE} WHERE l.dentist_id = $1 OR (l.status = 'approved' AND l.end_date >= $2::date) ORDER BY l.created_at DESC`,
          [session.sub, manilaDateStr(new Date())],
        ) as any[];
      } else {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.status(200).json({ leave: await Promise.all(rows.map(mapLeave)) });
    }

    if (req.method === "POST") {
      // Dentists and admins ask for their own; the superadmin can file it for one of them.
      const filing = session.role === "superadmin";
      if (!filing && session.role !== "dentist" && session.role !== "admin") {
        return res.status(403).json({ error: "Only dentists and admins can request leave" });
      }
      const { startDate, endDate, reason, note, staffId } = req.body ?? {};
      let forId = session.sub;
      if (filing) {
        const [who] = typeof staffId === "string"
          ? await sql`/* leave-staff */ SELECT id FROM users WHERE id = ${staffId} AND role IN ('dentist', 'admin') AND status = 'active'`
          : [];
        if (!who) return res.status(400).json({ error: "Choose the dentist or admin the leave is for" });
        forId = who.id;
      }
      const DAY = /^\d{4}-\d{2}-\d{2}$/;
      const why = typeof reason === "string" ? reason.trim() : "";
      if (!DAY.test(startDate ?? "") || !DAY.test(endDate ?? "") || !why) {
        return res.status(400).json({ error: "From, To and a reason are required" });
      }
      if (endDate < startDate) return res.status(400).json({ error: "The last day can't be before the first" });
      if (startDate < (manilaDateStr(new Date()) ?? "")) return res.status(400).json({ error: "Leave can't start in the past" });
      if (datesBetween(startDate, endDate).length > MAX_LEAVE_DAYS) {
        return res.status(400).json({ error: `Ask for at most ${MAX_LEAVE_DAYS} days at a time` });
      }
      // Part of a day: both hours, on a one-day leave, the first before the last.
      const { startTime, endTime } = req.body ?? {};
      const partDay = startTime != null || endTime != null;
      if (partDay) {
        if (!TIME.test(startTime ?? "") || !TIME.test(endTime ?? "")) return res.status(400).json({ error: "Give both times, as HH:MM" });
        if (startDate !== endDate) return res.status(400).json({ error: "Leave for part of a day covers one day only" });
        if (endTime <= startTime) return res.status(400).json({ error: "The leave has to end after it starts" });
      }
      // Days removed from an approved leave are free again, so only the days it still covers count.
      const asked = new Set(datesBetween(startDate, endDate));
      const near = await sql`/* leave-overlap */
        SELECT id, start_date, end_date, removed_dates FROM leave_requests
        WHERE dentist_id = ${forId} AND status IN ('pending', 'approved')
          AND start_date <= ${endDate}::date AND end_date >= ${startDate}::date`;
      if ((near as any[]).some((l) => leaveDates(l).some((d) => asked.has(d)))) {
        return res.status(409).json({
          error: filing ? "They already have leave requested or approved on some of these days"
            : "You already have leave requested or approved on some of these days",
        });
      }
      const [created] = await sql`/* leave-insert */
        INSERT INTO leave_requests (dentist_id, start_date, end_date, reason, note, start_time, end_time)
        VALUES (${forId}, ${startDate}, ${endDate}, ${why}, ${typeof note === "string" && note.trim() ? note.trim() : null},
          ${partDay ? startTime : null}, ${partDay ? endTime : null})
        RETURNING id`;
      let [row] = await sql.query(`${SELECT_LEAVE} WHERE l.id = $1`, [created.id]) as any[];
      // Filed by the superadmin, it's their decision already: approved at once, unless
      // bookings still hold those days, when it waits like any request until they're moved.
      if (filing) {
        const leave = await mapLeave(row);
        if (leave.conflicts.length === 0) {
          await approveLeave(row, leave, await nameOf(session));
          [row] = await sql.query(`${SELECT_LEAVE} WHERE l.id = $1`, [created.id]) as any[];
        }
      }
      return res.status(201).json({ leave: await mapLeave(row) });
    }

    if (req.method === "PATCH") {
      if (!leaveId) return res.status(400).json({ error: "Missing id" });
      const [existing] = await sql.query(`${SELECT_LEAVE} WHERE l.id = $1`, [leaveId]) as any[];
      if (!existing) return res.status(404).json({ error: "Leave request not found" });
      const action = req.body?.action;

      // The superadmin taking some (or all) of the days still to come off approved leave.
      if (action === "remove_days") {
        if (session.role !== "superadmin") return res.status(403).json({ error: "Only the superadmin can change approved leave" });
        if (existing.status !== "approved") return res.status(409).json({ error: "Only approved leave can have days removed" });
        const dates = Array.isArray(req.body?.dates) ? [...new Set(req.body.dates as unknown[])] : [];
        const covered = new Set(leaveDates(existing));
        const today = manilaDateStr(new Date()) ?? "";
        if (dates.length === 0 || !dates.every((d) => typeof d === "string" && covered.has(d))) {
          return res.status(400).json({ error: "Choose days this leave still covers" });
        }
        if ((dates as string[]).some((d) => d < today)) return res.status(400).json({ error: "Days already past can't be removed" });
        await removeLeaveDays(existing, dates as string[], await nameOf(session));
        const [row] = await sql.query(`${SELECT_LEAVE} WHERE l.id = $1`, [leaveId]) as any[];
        return res.status(200).json({ leave: await mapLeave(row) });
      }

      // The person asking to change their own approved leave: work some of its days after
      // all, or (leave for part of a day) keep fewer of its hours. It waits for the superadmin.
      const change = changeOf(existing);
      const today = manilaDateStr(new Date()) ?? "";
      /** Why new hours for part-day leave can't be had, or null: inside the approved ones, not the same, the day not past. */
      const badHours = (startTime: unknown, endTime: unknown): string | null => {
        if (!existing.start_time) return "Only leave for part of a day has hours to shorten";
        if (typeof startTime !== "string" || typeof endTime !== "string" || !TIME.test(startTime) || !TIME.test(endTime)) return "Give both times, as HH:MM";
        if (endTime <= startTime) return "The leave has to end after it starts";
        if (startTime < existing.start_time || endTime > existing.end_time) return "The new hours have to be inside the ones approved";
        if (startTime === existing.start_time && endTime === existing.end_time) return "Those are the hours already approved";
        if (leaveDates(existing)[0] < today) return "That day has already passed";
        return null;
      };

      // The superadmin cutting part-day leave to fewer hours directly (days: remove_days).
      if (action === "shorten") {
        if (session.role !== "superadmin") return res.status(403).json({ error: "Only the superadmin can change approved leave" });
        if (existing.status !== "approved") return res.status(409).json({ error: "Only approved leave can be changed" });
        const { startTime, endTime } = req.body ?? {};
        const bad = badHours(startTime, endTime);
        if (bad) return res.status(400).json({ error: bad });
        await shortenLeave(existing, startTime, endTime, await nameOf(session));
        const [row] = await sql.query(`${SELECT_LEAVE} WHERE l.id = $1`, [leaveId]) as any[];
        return res.status(200).json({ leave: await mapLeave(row) });
      }

      if (action === "request_change") {
        if (existing.dentist_id !== session.sub) return res.status(403).json({ error: "Forbidden" });
        if (existing.status !== "approved") return res.status(409).json({ error: "Only approved leave can be changed" });
        if (change?.status === "pending") return res.status(409).json({ error: "A change to this leave is already waiting for approval" });
        const note = typeof req.body?.note === "string" && req.body.note.trim() ? req.body.note.trim() : null;
        const { startTime, endTime } = req.body ?? {};
        let dates: string[] = [];
        if (startTime != null || endTime != null) {
          const bad = badHours(startTime, endTime);
          if (bad) return res.status(400).json({ error: bad });
        } else {
          dates = Array.isArray(req.body?.dates) ? [...new Set(req.body.dates as unknown[])] as string[] : [];
          const covered = new Set(leaveDates(existing));
          if (dates.length === 0 || !dates.every((d) => typeof d === "string" && covered.has(d))) {
            return res.status(400).json({ error: "Choose days this leave still covers" });
          }
          if (dates.some((d) => d < today)) return res.status(400).json({ error: "Days already past can't be removed" });
          dates.sort();
        }
        await saveChange(leaveId, {
          dates, startTime: dates.length ? null : startTime, endTime: dates.length ? null : endTime, note,
          status: "pending", requestedAt: new Date().toISOString(), decidedBy: null, decidedAt: null, decisionReason: null,
        });
        const [row] = await sql.query(`${SELECT_LEAVE} WHERE l.id = $1`, [leaveId]) as any[];
        return res.status(200).json({ leave: await mapLeave(row) });
      }
      if (action === "cancel_change" || action === "approve_change" || action === "reject_change") {
        if (change?.status !== "pending") return res.status(409).json({ error: "No change to this leave is waiting" });
        if (action === "cancel_change") {
          if (existing.dentist_id !== session.sub) return res.status(403).json({ error: "Forbidden" });
          await saveChange(leaveId, null);
        } else {
          if (session.role !== "superadmin") return res.status(403).json({ error: "Only the superadmin can decide on leave" });
          const decidedBy = await nameOf(session);
          if (action === "reject_change") {
            const why = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
            if (!why) return res.status(400).json({ error: "Say why the change is rejected" });
            await saveChange(leaveId, { ...change, status: "rejected", decidedBy, decidedAt: new Date().toISOString(), decisionReason: why });
          } else {
            if (existing.status !== "approved") return res.status(409).json({ error: "This leave is no longer approved" });
            if (change.dates.length) {
              // Days the superadmin freed in the meantime are free already.
              const covered = new Set(leaveDates(existing));
              const dates = change.dates.filter((d) => covered.has(d));
              if (dates.some((d) => d < today)) return res.status(409).json({ error: "Some of those days have already passed" });
              if (dates.length) await removeLeaveDays(existing, dates, null);
            } else {
              if (leaveDates(existing)[0] < today) return res.status(409).json({ error: "That day has already passed" });
              await shortenLeave(existing, change.startTime!, change.endTime!);
            }
            await saveChange(leaveId, { ...change, status: "approved", decidedBy, decidedAt: new Date().toISOString() });
          }
        }
        const [row] = await sql.query(`${SELECT_LEAVE} WHERE l.id = $1`, [leaveId]) as any[];
        return res.status(200).json({ leave: await mapLeave(row) });
      }

      if (existing.status !== "pending") return res.status(409).json({ error: "This request has already been decided" });

      // The dentist can take back a request nobody has decided on yet.
      if (action === "cancel") {
        if (existing.dentist_id !== session.sub) return res.status(403).json({ error: "Forbidden" });
        await sql`/* leave-cancel */ UPDATE leave_requests SET status = 'cancelled', updated_at = now() WHERE id = ${leaveId}`;
      } else {
        if (session.role !== "superadmin") return res.status(403).json({ error: "Only the superadmin can decide on leave" });
        const decidedBy = await nameOf(session);
        const leave = await mapLeave(existing);

        if (action === "approve") {
          if (leave.conflicts.length > 0) {
            return res.status(409).json({
              error: `${leave.conflicts.length} appointment${leave.conflicts.length === 1 ? "" : "s"} on these days must be rescheduled or cancelled first`,
              conflicts: leave.conflicts,
            });
          }
          await approveLeave(existing, leave, decidedBy);
        } else if (action === "reject") {
          const why = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
          if (!why) return res.status(400).json({ error: "Say why the leave is rejected" });
          await sql`/* leave-decide */ UPDATE leave_requests
            SET status = 'rejected', decided_by = ${decidedBy}, decided_at = now(), decision_reason = ${why}, updated_at = now()
            WHERE id = ${leaveId}`;
        } else {
          return res.status(400).json({ error: "Unknown action" });
        }
      }
      const [row] = await sql.query(`${SELECT_LEAVE} WHERE l.id = $1`, [leaveId]) as any[];
      return res.status(200).json({ leave: await mapLeave(row) });
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  if (req.query.unavailable === "true") {
    if (!requireSuperAdmin(req, res)) return;

    if (req.method === "POST") {
      const { dentistId, date, reason, remarks } = req.body ?? {};
      if (!dentistId || !date) return res.status(400).json({ error: "Missing dentistId or date" });
      const inserted = await sql`
        INSERT INTO dentist_unavailable (dentist_id, unavailable_date, reason, remarks)
        VALUES (${dentistId}, ${date}, ${reason ?? null}, ${remarks ?? null})
        RETURNING id, unavailable_date, reason, remarks
      `;
      return res.status(201).json({ unavailable: mapUnavailable(inserted[0]) });
    }

    if (req.method === "DELETE") {
      const unavailId = typeof req.query.id === "string" ? req.query.id : undefined;
      if (!unavailId) return res.status(400).json({ error: "Missing id" });
      await sql`DELETE FROM dentist_unavailable WHERE id = ${unavailId}`;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  const id = typeof req.query.id === "string" ? req.query.id : undefined;

  const session = getSessionFromRequest(req);
  const isSelf =
    !!session &&
    !!id &&
    session.sub === id &&
    (session.role === "admin" || session.role === "dentist" || session.role === "superadmin");

  // Older accounts get their DT-/AN-/SA- ID before one is shown (see codes.ts). Showing
  // the account matters more, so a failure there doesn't stop it.
  if (req.method === "GET") await ensureCodes("staff");

  if (isSelf && req.method === "GET") {
    const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
    const staff = rows[0];
    if (!staff) return res.status(404).json({ error: "Staff account not found" });
    return res.status(200).json({ staff: mapStaff(staff) });
  }

  if (isSelf && req.method === "PATCH") {
    const { contact, photo } = req.body ?? {};
    await sql`
      UPDATE users SET
        contact_number = COALESCE(${contact ?? null}, contact_number),
        photo_url = COALESCE(${photo ?? null}, photo_url),
        updated_at = now()
      WHERE id = ${id}
    `;
    const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
    if (!rows[0]) return res.status(404).json({ error: "Staff account not found" });
    return res.status(200).json({ staff: mapStaff(rows[0]) });
  }

  if (!requireSuperAdmin(req, res)) return;

  if (req.method === "GET") {
    if (id) {
      const rows = await sql`SELECT * FROM users WHERE id = ${id} AND role IN ('admin', 'dentist')`;
      const staff = rows[0];
      if (!staff) return res.status(404).json({ error: "Staff account not found" });
      return res.status(200).json({ staff: mapStaff(staff) });
    }

    const archived = req.query.archived === "true";
    const rows = archived
      ? await sql`SELECT * FROM users WHERE role IN ('admin', 'dentist') AND status = 'archived' ORDER BY last_name`
      : await sql`SELECT * FROM users WHERE role IN ('admin', 'dentist') AND status != 'archived' ORDER BY role, last_name`;
    return res.status(200).json({ staff: rows.map(mapStaff) });
  }

  if (req.method === "POST") {
    const { name, contact, email, role, password } = req.body ?? {};
    if (!name || !email || !role || !password) {
      return res.status(400).json({ error: "Name, email, role, and password are required" });
    }
    if (role !== "admin" && role !== "dentist") {
      return res.status(400).json({ error: "Role must be admin or dentist" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const [existingPatient, existingUser] = await Promise.all([
      sql`SELECT id FROM patients WHERE lower(email) = ${normalizedEmail}`,
      sql`SELECT id FROM users WHERE lower(email) = ${normalizedEmail}`,
    ]);
    if (existingPatient.length > 0 || existingUser.length > 0) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }
    // The ID (DT-261001) is given once the account is in, from when it was made; never typed in.
    await ensureCodes("staff");

    const { firstName, lastName } = splitName(name);
    const passwordHash = await bcrypt.hash(password, 10);
    const inserted = await sql`
      INSERT INTO users (email, password_hash, first_name, last_name, contact_number, role, verified, status)
      VALUES (${normalizedEmail}, ${passwordHash}, ${firstName}, ${lastName}, ${contact ?? null}, ${role}, TRUE, 'active')
      RETURNING *
    `;
    // The account is saved either way; without an ID now, it gets one on the next look.
    const codes = await assignCodes("staff").catch((err) => {
      console.error("Could not give the Employee ID", err);
      return new Map<string, string>();
    });
    return res.status(201).json({ staff: mapStaff({ ...inserted[0], employee_id: codes.get(inserted[0].id) ?? inserted[0].employee_id }) });
  }

  if (!id) return res.status(400).json({ error: "Missing id" });

  if (req.method === "PATCH") {
    const { action, name, contact, email, password, status, reason, archivedBy } = req.body ?? {};

    if (action === "archive") {
      // A reason is required: the Archive has to say why an account was taken out of service.
      const archivedReason = typeof reason === "string" ? reason.trim() : "";
      if (!archivedReason) return res.status(400).json({ error: "A reason is required to archive a staff account" });
      await sql`
        UPDATE users SET
          status = 'archived',
          archived_at = now(),
          archived_by = ${archivedBy ?? "Super Admin"},
          archived_reason = ${archivedReason},
          updated_at = now()
        WHERE id = ${id}
      `;
    } else if (action === "restore") {
      await sql`
        UPDATE users SET status = 'active', archived_at = NULL, archived_by = NULL, archived_reason = NULL, updated_at = now()
        WHERE id = ${id}
      `;
    } else {
      const nameParts = name ? splitName(name) : null;
      const passwordHash = password ? await bcrypt.hash(password, 10) : null;
      await sql`
        UPDATE users SET
          first_name = COALESCE(${nameParts?.firstName ?? null}, first_name),
          last_name = COALESCE(${nameParts?.lastName ?? null}, last_name),
          contact_number = COALESCE(${contact ?? null}, contact_number),
          email = COALESCE(${email ? String(email).trim().toLowerCase() : null}, email),
          password_hash = COALESCE(${passwordHash}, password_hash),
          status = COALESCE(${status ?? null}, status),
          updated_at = now()
        WHERE id = ${id}
      `;
    }

    const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
    if (!rows[0]) return res.status(404).json({ error: "Staff account not found" });
    return res.status(200).json({ staff: mapStaff(rows[0]) });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

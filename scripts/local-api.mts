// Runs the /api functions locally on :3010 (what `npm run dev` proxies to) without the
// Vercel CLI, against the database in .env.local.dev. For local testing only.
//
//   npx tsx scripts/local-api.mts
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Vercel functions run in UTC, and the handlers' date handling relies on that (on a
// Manila-time PC every DATE would come back a day early).
process.env.TZ = "UTC";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = process.env.ENV_FILE ?? ".env.local.dev";
for (const line of readFileSync(join(ROOT, ENV_FILE), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}

// /api/appointments -> api/appointments.ts, /api/patients -> api/patients/index.ts
const handlerFile = (path: string) => {
  const rel = path.replace(/^\/api\//, "").replace(/\/$/, "");
  if (!rel || rel.split("/").some(part => part.startsWith("_") || part === "..")) return null;
  for (const file of [join(ROOT, "api", `${rel}.ts`), join(ROOT, "api", rel, "index.ts")]) {
    if (existsSync(file)) return file;
  }
  return null;
};

const PORT = Number(process.env.PORT ?? 3010);

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const file = handlerFile(url.pathname);
  if (!file) {
    res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Not found" }));
    return;
  }
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  let body: unknown = undefined;
  if (raw) { try { body = JSON.parse(raw); } catch { body = raw; } }

  const shim: any = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this; },
    setHeader(name: string, value: string) { res.setHeader(name, value); return this; },
    json(payload: unknown) {
      if (!res.headersSent) res.writeHead(this.statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
      return this;
    },
    send(payload: unknown) { return typeof payload === "string" ? (res.writeHead(this.statusCode).end(payload), this) : this.json(payload); },
    end(payload?: string) { if (!res.headersSent) res.writeHead(this.statusCode); res.end(payload); return this; },
  };
  try {
    const { default: handler } = await import(pathToFileURL(file).href);
    await handler({ method: req.method, url: req.url, headers: req.headers, query: Object.fromEntries(url.searchParams), body }, shim);
  } catch (err) {
    console.error(`${req.method} ${url.pathname} failed:`, err);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Server error" }));
  }
  console.log(`${req.method} ${url.pathname}${url.search} -> ${shim.statusCode}`);
}).listen(PORT, () => console.log(`Local API on http://localhost:${PORT} using ${ENV_FILE}`));

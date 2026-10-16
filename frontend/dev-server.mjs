// Local preview of Ride Assure v2, no Vercel account needed.
//   cd frontend
//   npm install
//   npm run dev        -> open http://localhost:3000/call.html
// Reads secrets from ../.env or ./.env (never committed): ANTHROPIC_API_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY. Serves the static site and runs api/*.js like Vercel does.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
for (const f of [path.join(here, "..", ".env"), path.join(here, ".env")]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2] !== "" && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".m4a": "audio/mp4" };

const port = Number(process.env.PORT || 3000);
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, "");
      const file = path.join(here, "api", `${name}.js`);
      if (!name || name.startsWith("_") || !fs.existsSync(file)) { res.writeHead(404); return res.end("Not found"); }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString("utf8");
      req.body = raw ? JSON.parse(raw) : {};
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (obj) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };
      const mod = await import(pathToFileURL(file).href);
      return mod.default(req, res);
    }
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(here, p);
    if (!file.startsWith(here) || file.includes(`${path.sep}api${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    console.error(err);
    res.writeHead(500); res.end("Server error");
  }
}).listen(port, () => {
  console.log(`Ride Assure v2 running at http://localhost:${port}/call.html`);
  const missing = ["ANTHROPIC_API_KEY", "SUPABASE_URL"].filter((k) => !process.env[k]);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY && !process.env.DATABASE_URL) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length && !process.env.DATABASE_URL) console.log(`Heads up: missing ${missing.join(", ")} in .env. The call won't connect until they're set.`);
});

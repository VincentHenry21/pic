"use strict";
/* PIC photobooth backend. Zero dependencies, Node 18+.
 * Run: node server.js   (env: PORT=3101, PUBLIC_URL=https://your-host, PIC_HTML=./public/index.html)
 * API:
 *   GET  /                -> the PIC app
 *   GET  /api/health      -> {ok:true}
 *   POST /api/upload      -> body: raw image/png (max 10MB) -> {ok,id,url,expiresHours}
 *   GET  /s/:id           -> the PNG (view)
 *   GET  /s/:id/download  -> the PNG (download)
 * Files auto-expire after 24h.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = parseInt(process.env.PORT || "3101", 10);
const DATA = path.join(__dirname, "data");
const HTML = process.env.PIC_HTML || path.join(__dirname, "public", "index.html");
const TTL_MS = 24 * 3600 * 1000;
const MAX_BYTES = 10 * 1024 * 1024;

fs.mkdirSync(DATA, { recursive: true });

const B62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
function newId() {
  const b = crypto.randomBytes(6);
  let s = "";
  for (const x of b) s += B62[x % 62];
  return s;
}

function cleanup() {
  const now = Date.now();
  let n = 0;
  for (const f of fs.readdirSync(DATA)) {
    const p = path.join(DATA, f);
    try {
      if (now - fs.statSync(p).mtimeMs > TTL_MS) { fs.unlinkSync(p); n++; }
    } catch (e) {}
  }
  if (n) console.log("cleaned " + n + " expired file(s)");
}
setInterval(cleanup, 3600 * 1000).unref();
cleanup();

function json(res, obj, code) {
  res.writeHead(code || 200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  let url;
  try { url = new URL(req.url, "http://x"); }
  catch (e) { res.writeHead(400); res.end("bad request"); return; }
  const p = url.pathname;

  if (req.method === "GET" && p === "/") {
    fs.readFile(HTML, (e, d) => {
      if (e) { res.writeHead(500, { "Content-Type": "text/plain" }); res.end("app file not found: " + HTML); return; }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
      res.end(d);
    });
    return;
  }

  if (req.method === "GET" && p === "/api/health") {
    json(res, { ok: true, time: new Date().toISOString() });
    return;
  }

  if (req.method === "POST" && p === "/api/upload") {
    const ct = req.headers["content-type"] || "";
    if (!ct.startsWith("image/png")) { json(res, { ok: false, error: "send image/png" }, 415); return; }
    const chunks = [];
    let n = 0, tooBig = false;
    req.on("data", (c) => {
      n += c.length;
      if (n > MAX_BYTES) { tooBig = true; req.destroy(); return; }
      chunks.push(c);
    });
    req.on("close", () => { if (tooBig && !res.writableEnded) json(res, { ok: false, error: "file too large (max 10MB)" }, 413); });
    req.on("end", () => {
      if (tooBig) return;
      const buf = Buffer.concat(chunks);
      if (buf.length < 8 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
        json(res, { ok: false, error: "not a PNG" }, 400); return;
      }
      const id = newId();
      fs.writeFileSync(path.join(DATA, id + ".png"), buf);
      const host = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || ("http://" + req.headers.host)).replace(/\/+$/, "");
      json(res, { ok: true, id, url: host + "/s/" + id, expiresHours: 24 });
    });
    req.on("error", () => {});
    return;
  }

  const m = p.match(/^\/s\/([0-9A-Za-z]{6,12})(\/download)?$/);
  if (req.method === "GET" && m) {
    const fp = path.join(DATA, m[1] + ".png");
    if (!/^[0-9A-Za-z]{6,12}$/.test(m[1]) || !fs.existsSync(fp)) {
      res.writeHead(404, { "Content-Type": "text/plain" }); res.end("expired or not found"); return;
    }
    const headers = { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" };
    if (m[2]) headers["Content-Disposition"] = 'attachment; filename="pic-booth-' + m[1] + '.png"';
    res.writeHead(200, headers);
    fs.createReadStream(fp).pipe(res);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, () => console.log("PIC backend listening on :" + PORT));

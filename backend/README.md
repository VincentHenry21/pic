# PIC backend

Tiny zero-dependency Node server for the PIC photobooth app. It serves the app itself and handles "Send to phone" uploads: the app POSTs the strip PNG, the server returns a short shareable link that works on any phone browser. Files auto-delete after 24 hours.

## Run it locally

```bash
cd pic-backend
node server.js
```

Open http://localhost:3101 on your computer. On your phone (same Wi-Fi), open `http://<your-computer-ip>:3101`.

In the PIC app, open the Share step and paste the backend URL into the Backend URL field.

## Free hosting options (so it works anywhere)

The server is a plain Node HTTP app with no dependencies, so it runs on any free Node host:

- **Render (one click)**: this repo includes `render.yaml`. On Render: New Blueprint, point it at this repo, done. `PUBLIC_URL` is picked up automatically from Render's external URL.
- **Render (manual)**: New Web Service, root directory `backend`, build command empty, start command `node server.js`, plan Free. Set env `PUBLIC_URL` to your Render URL (e.g. `https://pic-backend-xyz.onrender.com`).
- **Railway / Fly.io**: same idea, start command `node server.js`, set `PUBLIC_URL`.
- **Any VPS**: `node server.js` behind nginx/Caddy, set `PUBLIC_URL` to your domain.

Environment variables:

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `3101` | Port to listen on |
| `PUBLIC_URL` | request host | Base URL used in share links (set this when behind a proxy) |
| `PIC_HTML` | `./public/index.html` | Path to the PIC app HTML file served at `/` |

Copy `pic-photobooth.html` into `public/index.html` before deploying (or set `PIC_HTML`).

## API

- `GET /` serves the PIC app
- `GET /api/health` returns `{ok:true}`
- `POST /api/upload` with `Content-Type: image/png` and the raw PNG bytes (max 10MB) returns `{ok:true, id, url, expiresHours:24}`
- `GET /s/:id` views the image, `GET /s/:id/download` downloads it

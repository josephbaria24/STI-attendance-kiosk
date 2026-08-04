# AttendX (Next.js)

Next.js + Tailwind rewrite of the original `attendance.html` Attendance Pro kiosk.

## Features (same as HTML version)

- QR / camera scanning (Time In, Time Out, Class Mode)
- Open Time vs Strict threshold modes
- Manual ID entry + TTS / chime feedback
- Daily gate roster & classroom subject logs
- Analytics (hours, scan counts) + Excel export
- Admin: settings, CSV/XLSX import, registration, photos, QR ID cards, print
- IndexedDB persistence (same `AttendX_IDB` store as the HTML app)
- PWA manifest + service worker

## Run

```bash
cd attendx
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Camera scanning needs HTTPS or `localhost`, and browser camera permission.

## Stack

- Next.js 16 (App Router)
- React 19
- Tailwind CSS 4
- `html5-qrcode`, `qrcode.react`, `xlsx`

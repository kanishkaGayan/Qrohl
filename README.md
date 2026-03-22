# Qrohl

**The Whole Package for QR and Barcodes.**

Qrohl is a Next.js + Prisma QR/Barcode generator with live preview, export options, and generation history.

## Features

- QR payload generators (URL, text, contact, Wi-Fi, email, SMS, geo, event, crypto)
- Barcode generation for plain text
- PNG/SVG download support
- Generation history with:
	- server-side pagination
	- sorting (newest/oldest)
	- date filtering constrained to last 60 days
- Automatic history retention cleanup (records older than 60 days are removed)
- Electron desktop packaging support (Windows NSIS + APPX)

## Tech Stack

- Next.js (App Router)
- React + TypeScript
- Prisma + SQLite
- Tailwind CSS + shadcn/base-ui components
- Electron + electron-builder

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Create/update Prisma client:

```bash
npm run prisma:generate
```

3. Run database migrations:

```bash
npm run prisma:migrate
```

4. Start the app:

```bash
npm run dev
```

Open http://localhost:3000

## History Retention and Memory Management

- History queries are paginated on the server to avoid loading large datasets into the client.
- Only a single page of history is loaded at a time (default page size: 10).
- A retention cleanup runs automatically during history read and save actions.
- Any record older than 60 days is deleted automatically.
- Date filters in UI are restricted to the same 60-day window.
- For packaged desktop builds, runtime SQLite is stored in user AppData (`%APPDATA%/Qrohl/history.db`) to avoid write-permission issues in installation directories.

## Scripts

- `npm run dev` - start Next.js dev server
- `npm run build` - production build
- `npm run start` - run production server
- `npm run lint` - run ESLint
- `npm run prisma:generate` - generate Prisma client
- `npm run prisma:migrate` - run Prisma migration in dev
- `npm run prisma:studio` - open Prisma Studio
- `npm run dev:electron` - run Next.js + Electron locally
- `npm run electron:assets` - generate branded Windows packaging assets
- `npm run build:electron` - build Windows desktop packages

## Desktop Packaging (Electron)

Run in development:

```bash
npm run dev:electron
```

Generate branding assets before packaging:

```bash
npm run electron:assets
```

Build Windows packages:

```bash
npm run build:electron
```

### Windows packaging safety checks

- Always run `npm run electron:assets` before packaging.
- The asset generator validates required icon sizes (including `Square44x44Logo.png` and `Square150x150Logo.png`) and fails if mismatched.
- Submit signed `.appx`/`.msix` packages to Store ingestion workflows.
- Avoid relying on unsigned `.exe` artifacts for Store certification.

For Microsoft Store reviewer notes (`runFullTrust`) and certification checklist, see:

- `docs/microsoft-store-certification-notes.md`

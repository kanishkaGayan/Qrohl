# Microsoft Store certification notes

Use this note in Partner Center under **Notes for certification**:

Qrohl is a Win32 desktop application built with Electron and packaged for Microsoft Store. The package requires `runFullTrust` because it is a desktop bridge app and must execute outside the UWP sandbox. The capability is required for:

- local SQLite database read/write operations for history persistence
- exporting user-generated PNG/SVG files to user-selected local file paths

Qrohl stores its runtime database in the user's AppData path (`%APPDATA%/Qrohl/history.db`) and does not transmit these records to external servers.

## Pre-submit checklist

1. Run `npm run electron:assets` before every Store build.
2. Build with `npm run build:electron` so AppX/MSIX package uses branded icons from `build/`.
3. Verify package contains these assets (no defaults):
   - `Square44x44Logo.png`
   - `Square50x50Logo.png`
   - `Square150x150Logo.png`
   - `Square310x310Logo.png`
   - `Wide310x150Logo.png`
   - `StoreLogo.png`
4. Run WACK (Windows App Certification Kit) locally against the generated `.appx`/`.msixupload`.
5. Upload a signed `.appx`/`.msix` package directly in Partner Center (avoid unsigned `.exe` submissions).
6. Keep app name and listing metadata aligned with branding:
   - App name: **Qrohl**
   - Slogan: **The Whole Package for QR and Barcodes.**

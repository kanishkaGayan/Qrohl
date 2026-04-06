# Microsoft Store certification notes

Use this note in Partner Center under **Notes for certification**:

Qrohl is a Win32 desktop application built with Electron and packaged for Microsoft Store. The package requires `runFullTrust` because it is a desktop bridge app and must execute outside the UWP sandbox. The capability is required for:

- local SQLite database read/write operations for history persistence
- exporting user-generated PNG/SVG files to user-selected local file paths

Qrohl stores its runtime database in the user's AppData path (`%APPDATA%/Qrohl/history.db`) and does not transmit these records to external servers.

## Pre-submit checklist

1. Place your high-resolution source logo at `build/icon-source.png` (fallback is `public/icon.png`).
2. Run `npm run electron:assets` before every Store build.
3. Build with `npm run build:electron` so AppX/MSIX package uses branded icons from `build/appx/`.
4. Verify package contains these assets (no defaults):
   - `Square44x44Logo.png`
   - `Square150x150Logo.png`
   - `SmallTile.png`
   - `LargeTile.png`
   - `Wide310x150Logo.png`
   - `StoreLogo.png`
   - `SplashScreen.png`
5. Verify manifest path: `build/appx/appxmanifest.xml` is used through `build.appx.customManifestPath`.
6. Run WACK (Windows App Certification Kit) locally against the generated `.appx`/`.msixupload`.
7. Upload a signed `.appx`/`.msix` package directly in Partner Center (avoid unsigned `.exe` submissions).
8. Keep app name and listing metadata aligned with branding:
   - App name: **Qrohl**
   - Slogan: **The Whole Package for QR and Barcodes.**

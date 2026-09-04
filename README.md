# Forest Log — private iPhone PWA

A simple private observation map for mushrooms, trees, animal tracks/paths, animals, and other finds.

## What version 1 does

- Full-screen map
- GPS current position
- Add an observation at your current GPS position
- Or save an observation at the current map center
- Categories: Mushroom, Tree/place, Tracks/path, Animal, Other
- Title + notes
- Up to 3 photos per observation
- Photos are compressed before local storage
- Tap a marker to see details
- Edit and delete observations
- Local storage in IndexedDB (observations are not uploaded to a server)
- JSON backup/export including photos
- JSON backup/import
- Installable on iPhone Home Screen as a web app
- App shell is cached for offline reopening after it has loaded online; live map imagery still needs network access

## Satellite imagery

The app works immediately with an OpenStreetMap street-map fallback.

For satellite imagery, use a free MapTiler Cloud personal/non-commercial account:

1. Create a MapTiler Cloud account.
2. Create/copy an API key.
3. Open Forest Log → Settings (gear icon).
4. Paste the key and tap **Save satellite key**.

The key is saved only in this browser/web-app storage and is not committed to the source code.

For better protection, MapTiler recommends restricting browser keys to the domain where you host Forest Log.

## Easiest free hosting: GitHub Pages

You do not need Node.js, Xcode, or a Mac.

1. Create a GitHub account if you do not already have one.
2. Create a new repository, for example `forest-log`.
3. Upload all files and folders from this project into the repository root.
4. Open repository **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select branch **main** and folder **/(root)**, then save.
7. GitHub will show your HTTPS Pages address after deployment.
8. Open that address on your iPhone in Safari.
9. Tap Share → **Add to Home Screen** / **Open as Web App**.

HTTPS is important because browsers require a secure context for location permission and service workers.

## Local test on Windows

This is optional, but useful before uploading.

If Python is installed, open Command Prompt in this folder and run:

    python -m http.server 8000

Then open:

    http://localhost:8000

`localhost` can use browser geolocation for desktop testing. For the iPhone, use the HTTPS GitHub Pages address instead of your PC's local network address.

## Data & backup warning

Observations are local to the browser/PWA on that device. Removing website data, deleting the PWA's data, or certain device restore scenarios can remove it.

Use **Settings → Export backup** regularly and save the `.json` file somewhere separate (Files/iCloud Drive/OneDrive/etc.).

## Offline behavior

The application files are cached by a service worker. Leaflet is loaded from its official CDN and cached after use, so after an online load the UI can reopen without a connection.

This project deliberately does **not** cache third-party map/satellite tiles for offline use. Map imagery therefore needs an internet connection unless a future version uses a provider and licensing model that explicitly supports offline tile packages.

Even with no map tiles, already-saved observations remain in IndexedDB and GPS/location capture may still work on the device.

## Privacy

There is no server-side database in this project. Observation data and photos stay in the device's browser storage unless you explicitly export/share a backup file.

The map provider receives normal map tile requests needed to display the area you are viewing.

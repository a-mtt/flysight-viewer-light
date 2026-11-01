# FlySight Viewer (light)

A simple web app to view and score [FlySight](https://flysight.ca) tracks on your phone or laptop.

**Open it here: https://a-mtt.github.io/flysight-viewer-light/**

- Altitude, vertical speed, horizontal speed, total speed and glide ratio on one chart
- Zoom in on any part of the jump
- Score a performance window: time in window, distance and horizontal speed
- Works offline once installed, so you can use it at the dropzone
- No account, nothing to set up. Your track is read on your device and never uploaded.

Supports FlySight 2 and FlySight 1 track files (`TRACK.CSV`).

## Install it on your phone

Installing puts an icon on your home screen. The app then opens full screen and works without an internet connection.

**iPhone (Safari)**
1. Open the link above in Safari.
2. Tap the **Share** button, then **Add to Home Screen**.
3. Tap **Add**.

**Android (Chrome)**
1. Open the link above in Chrome.
2. Tap the **⋮** menu, then **Install app** (or **Add to Home screen**).
3. Confirm.

**Laptop (Chrome or Edge)**
Click the install icon at the right of the address bar, or use the browser menu: **Install FlySight Viewer**.

You can also just use it in the browser without installing.

## Get the track off your FlySight

The FlySight shows up as a USB drive. Tracks are in dated folders:

```
YY-MM-DD / HH-MM-SS / TRACK.CSV
```

For example `26-08-01/17-15-09/TRACK.CSV` is a jump on 1 August 2026 at 17:15:09 (UTC).

- **Android:** connect the FlySight with a USB‑C cable (USB OTG). It appears as a drive in the file picker.
- **iPhone with USB‑C (15 or later):** connect it with a USB‑C cable. It appears in the Files app under *Locations*.
- **iPhone with Lightning:** use a Lightning-to-USB adapter, or copy the file to the phone first (e.g. AirDrop from a laptop).
- **Laptop:** plug it in and it appears as a drive.

## Using the app

1. Tap **Import track** and pick a `TRACK.CSV` file. Importing a new track replaces the previous one.
2. **Chart:** tap the coloured pills to show or hide each measure. Glide ratio and total speed are off by default.
3. **Zoom:** drag sideways across the chart (mouse or finger), or type the **From** and **To** times in seconds. **Reset** shows the whole track.
4. **Scoring:** set the window with **Top** and **Bottom** (metres above the dropzone, 2500 → 1500 m by default). The app finds where you descend through them after exit and shows:
   - **Time in window** in seconds
   - **Distance:** straight line from where you entered the window to where you left it
   - **Horizontal speed:** distance ÷ time

   The scoring window is shaded in yellow on the chart.

### DZ elevation

Altitudes are shown above the dropzone. The app estimates the DZ elevation from the lowest point of the track, which is right if you recorded until landing.

If you stopped recording under canopy, or landed somewhere else, type your dropzone's elevation (metres above sea level) in **DZ elevation**. It's the `DZ_Elev` value in the FlySight's `CONFIG.TXT`.

### How the numbers are calculated

| Measure | Calculation |
|---|---|
| Altitude | `hMSL` − DZ elevation |
| Vertical speed | `velD` (positive when descending) |
| Horizontal speed | √(velN² + velE²) |
| Total speed | √(velN² + velE² + velD²) |
| Glide ratio | horizontal speed ÷ vertical speed, only while descending faster than 10 km/h |

Window entry and exit times are interpolated between GPS samples.

## Run it on your own computer

It's a static site with no build step. From the project folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. To try it on a phone on the same Wi‑Fi, add `--bind 0.0.0.0` and open `http://<your-computer's-IP>:8000` on the phone. Installing and offline mode only work over https or on localhost.

## Project files

| File | What it does |
|---|---|
| `index.html` | Page layout |
| `style.css` | Styles, light and dark themes |
| `parser.js` | Reads FlySight 1 and 2 CSV files |
| `scoring.js` | Finds the scoring window and computes the score |
| `app.js` | Chart, controls and wiring |
| `sw.js` | Offline support |
| `manifest.webmanifest`, `icons/` | Makes the app installable |
| `vendor/` | [uPlot](https://github.com/leeoniya/uPlot) chart library (MIT) |

When you change `style.css` or a `.js` file, bump the `?v=` number in `index.html` so browsers load the new version.

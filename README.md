# FlySight Viewer (light)

A simple web app to view and score [FlySight](https://flysight.ca) tracks on your phone or laptop.

**Open it here: https://a-mtt.github.io/flysight-viewer-light/**

- Altitude, vertical speed, horizontal speed, total speed and glide ratio on one chart
- Zoom in on any part of the jump
- See the jump on a map, linked to the chart
- Score a performance window: time in window, distance and horizontal speed
- Works offline once installed, so you can use it at the dropzone
- Check your alarm timing against the scoring window entry
- Remembers your DZ elevation, scoring window, chart choices and alarms, handy for several days at the same dropzone
- No account, nothing to set up. Your track is read on your device and never uploaded (see [Privacy](#privacy)).

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

1. Tap **Import track** and pick a `TRACK.CSV` file. Importing a new track replaces the previous one. The header shows the jump's date and exit time, converted from the file's UTC to your device's time zone.
2. **Score bar:** pinned at the top so it's always visible: **Time** in the window, **Distance** and **Speed**, and under them your entry into the window: time since exit, vertical (**v**) and horizontal (**h**) speed, and glide ratio (**GR**).
3. **Chart:** tap the coloured pills to show or hide each measure. Glide ratio and total speed are off by default.
4. **Zoom:** drag sideways across the chart (mouse or finger), or type the **From** and **To** times in seconds. **Jump** zooms to the jump, from 2 s before exit down to 1000 m above the dropzone. **Entry** zooms from exit to 10 s after you enter the scoring window and shows your alarms (see [Alarms](#alarms)). **Reset** shows the whole track.
5. **Map:** shows your ground track for the current viewing window, with markers for exit, lane start, the scoring window (yellow) and 1000 m. **Lane start** is where the FAI wingsuit performance lane begins: 9 seconds after your vertical speed first reaches 10 m/s. Hover over or touch the chart to see where you were at that moment. The map follows the viewing window, so **Jump** frames the jump.
6. **Settings** (collapsed at the bottom, with a summary of what's set):
   - **DZ elevation** and the scoring window's **Top** and **Bottom** (metres above the dropzone, 2500 → 1500 m by default). The app finds where you descend through them after exit; the window is shaded in yellow on the chart. Distance is the straight line from where you entered the window to where you left it, and speed is distance ÷ time.
   - **Open new tracks in:** Full track, Jump, Entry, or Last used (whichever of Jump / Entry / Reset you pressed last).
   - **Alarms**, see below.

### Alarms

Add the alarms you set on your FlySight under **Settings → Alarms**: a name (e.g. the audio file it plays) and the altitude in metres above the dropzone, as in `Alarm_Elev` in `CONFIG.TXT`. They're saved on your device.

Press **Entry** to see them: a dashed line on the chart where each alarm went off (the first time after exit you descended through its altitude), and an **Alarms** card under the map with each alarm's timing relative to entering the scoring window (e.g. *4.7 s before entry*) and your vertical and horizontal speed at that moment. **Jump** or **Reset** hides them again.

### On a phone held upright

The layout gets compact so the chart and map fit on one screen: the controls and the measure pills each take one row (swipe the pills sideways to reach the rest), the pills show live values while you touch the chart, and the map sits right under it. Turn the phone sideways, or use a laptop, for the full-size layout with the complete legend.

### Privacy

Your track file is read on your device and never uploaded. The map background comes from [OpenStreetMap](https://www.openstreetmap.org): to draw it, your browser downloads map images of the area you're looking at, so OpenStreetMap's servers can see roughly which area that is. The track itself is drawn on your device.

The map background needs an internet connection. Offline, the rest of the app works normally; the map only shows areas your browser still has saved.

### DZ elevation

Altitudes are shown above the dropzone. The app estimates the DZ elevation from the lowest point of the track, which is right if you recorded until landing.

If you stopped recording under canopy, or landed somewhere else, type your dropzone's elevation (metres above sea level) in **DZ elevation**. It's the `DZ_Elev` value in the FlySight's `CONFIG.TXT`.

Once typed, it's saved and used for every track you import. Under the field the app shows what each new track suggests, e.g. *Saved · this track suggests 380 m*, so you'll notice if you've moved to another dropzone. Tap **Use estimate** to go back to the automatic value.

### Saved settings

These are remembered on your device between visits:

- DZ elevation (only if you typed one)
- Scoring window **Top** and **Bottom**
- Which view new tracks open in
- Which measures are shown on the chart
- Your alarms

They're stored in your browser only, never uploaded. Each device keeps its own settings; on iPhone the home-screen app and Safari also keep separate ones. **Reset saved settings** (in Settings) puts everything back to the defaults.

### How the numbers are calculated

| Measure | Calculation |
|---|---|
| Altitude | `hMSL` − DZ elevation |
| Vertical speed | `velD` (positive when descending) |
| Horizontal speed | √(velN² + velE²) |
| Total speed | √(velN² + velE² + velD²) |
| Glide ratio | horizontal speed ÷ vertical speed, only while descending faster than 10 km/h |

Window entry and exit times are interpolated between GPS samples.

**Finding the exit:** after the top of the climb, the app looks for the first moment vertical speed passes 10 m/s (36 km/h), which the plane never reaches but a jumper does about a second after leaving. It then steps back to where that acceleration began. A hop-and-pop that opens before reaching 10 m/s isn't detected.

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
| `scoring.js` | Finds the scoring window, the exit and the score |
| `map.js` | Map of the ground track |
| `app.js` | Chart, controls and wiring |
| `sw.js` | Offline support |
| `manifest.webmanifest`, `icons/` | Makes the app installable |
| `vendor/` | [uPlot](https://github.com/leeoniya/uPlot) chart library (MIT) and [Leaflet](https://leafletjs.com) map library (BSD-2) |

When you change `style.css` or a `.js` file, bump the `?v=` number in `index.html` so browsers load the new version.

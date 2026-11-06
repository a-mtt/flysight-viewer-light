// Parses a FlySight 1 or FlySight 2 track CSV into arrays for charting.
// Returns { start, t, hMSL, ground, lat, lon, vSpeed, hSpeed, tSpeed, glide } where:
//   start  time of the first sample (ms since 1970, UTC as in the file)
//   t      seconds since the first sample
//   hMSL   metres above mean sea level, as recorded
//   ground estimated ground elevation in metres above sea level
//          (lowest reliable altitude in the track, rounded to the metre)
//   lat    degrees
//   lon    degrees
//   vSpeed km/h, positive when descending
//   hSpeed km/h
//   tSpeed km/h, total speed in 3D
//   glide  horizontal / vertical speed, null unless descending faster than 10 km/h
function parseFlySight(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) throw new Error("The file is empty.");

  // Real FlySight files use commas; files re-saved by a spreadsheet may use semicolons.
  const first = lines[0];
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";

  let columns = null; // column names, in order
  let offset = 0; // index of the first value in a data row
  const rows = [];

  if (first.startsWith("$")) {
    // FlySight 2: $COL;GNSS;time;... then $GNSS;<time>;...
    for (const line of lines) {
      const f = line.split(delim);
      if (f[0] === "$COL" && f[1] === "GNSS") {
        columns = f.slice(2);
        offset = 1;
      } else if (f[0] === "$GNSS") {
        rows.push(f);
      }
    }
  } else {
    // FlySight 1: header row of names, a units row, then data rows
    columns = first.split(delim);
    for (const line of lines.slice(1)) rows.push(line.split(delim));
  }

  if (!columns) throw new Error("No GPS column header found. Is this a FlySight track?");
  const col = (name) => {
    const i = columns.indexOf(name);
    if (i < 0) throw new Error(`Missing column "${name}".`);
    return i + offset;
  };
  const iTime = col("time");
  const iLat = col("lat");
  const iLon = col("lon");
  const iAlt = col("hMSL");
  const iN = col("velN");
  const iE = col("velE");
  const iD = col("velD");
  const iVAcc = columns.indexOf("vAcc") >= 0 ? col("vAcc") : -1;

  const ms = [];
  const lat = [];
  const lon = [];
  const hMSL = [];
  const vAcc = [];
  const vSpeed = [];
  const hSpeed = [];
  const tSpeed = [];
  const glide = [];
  for (const f of rows) {
    const time = Date.parse(f[iTime]);
    const la = parseFloat(f[iLat]);
    const lo = parseFloat(f[iLon]);
    const alt = parseFloat(f[iAlt]);
    const n = parseFloat(f[iN]);
    const e = parseFloat(f[iE]);
    const d = parseFloat(f[iD]);
    if ([time, la, lo, alt, n, e, d].some(isNaN)) continue; // units row, bad lines
    ms.push(time);
    lat.push(la);
    lon.push(lo);
    hMSL.push(alt);
    vAcc.push(iVAcc >= 0 ? parseFloat(f[iVAcc]) : 0);
    vSpeed.push(d * 3.6);
    hSpeed.push(Math.hypot(n, e) * 3.6);
    tSpeed.push(Math.hypot(n, e, d) * 3.6);
    glide.push(d * 3.6 > 10 ? Math.hypot(n, e) / d : null); // blank in the plane and on the ground
  }
  if (ms.length === 0) throw new Error("No GPS samples found in the file.");

  // Ground level: lowest altitude among samples with a decent vertical fix.
  // The first samples after power-on can be tens of metres off.
  let ground = Infinity;
  for (let i = 0; i < hMSL.length; i++) if (vAcc[i] < 10) ground = Math.min(ground, hMSL[i]);
  if (ground === Infinity) ground = Math.min(...hMSL);

  return {
    start: ms[0],
    t: ms.map((m) => (m - ms[0]) / 1000),
    hMSL,
    ground: Math.round(ground),
    lat,
    lon,
    vSpeed,
    hSpeed,
    tSpeed,
    glide,
  };
}

if (typeof module !== "undefined") module.exports = { parseFlySight };

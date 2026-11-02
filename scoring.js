// Scores the descent between two altitudes (metres above ground, same as the chart).
// Only the part of the track after its highest point (exit) is considered,
// so the climb in the plane is ignored.
// Returns { start, end, time, distance, speed } with start/end in track seconds,
// time in s, distance in m (straight line, entry to exit) and speed in km/h,
// or { error } when the window can't be found.
function scoreWindow(track, top, bottom) {
  if (!(top > bottom)) return { error: "Top must be higher than bottom." };

  const entry = crossing(track, top, highestIndex(track));
  if (!entry) return { error: `The track never descends through ${top} m.` };
  const exit = crossing(track, bottom, entry.i);
  if (!exit) return { error: `The track never descends through ${bottom} m.` };

  const time = exit.t - entry.t;
  const distance = groundDistance(entry.lat, entry.lon, exit.lat, exit.lon);
  return { start: entry.t, end: exit.t, time, distance, speed: (distance / time) * 3.6 };
}

// Finds the jump: from exit to the first time the track descends through 1000 m
// above ground (or the end of the track if it never does).
// Exit: after the top of the climb, the first time vertical speed passes 10 m/s
// (the plane never descends that fast; a jumper reaches it ~1 s after leaving),
// then back to where that acceleration began.
// Also returns the lane start: in FAI wingsuit performance rules (2026, section 2.2)
// the Validation Window, and with it the Designated Lane, starts 9 s after vertical
// speed first reaches 10 m/s.
// Returns { exit, end, laneStart } in track seconds (laneStart is null if the track
// ends first), or { error }.
const EXIT_SPEED = 36; // km/h (10 m/s)
const LANE_DELAY = 9; // s after first reaching EXIT_SPEED
const EXIT_ACCEL = 1; // m/s²; below this the vertical speed is changing at plane-like rates
const JUMP_BOTTOM = 1000; // m above ground

function findJump(track) {
  const { t, vSpeed } = track;
  let i = highestIndex(track);
  while (i < t.length && vSpeed[i] <= EXIT_SPEED) i++;
  if (i === t.length) return { error: "No exit found in this track." };

  // Step back while vertical speed was still building up quickly.
  const accel = (j) => (vSpeed[j] - vSpeed[j - 1]) / 3.6 / (t[j] - t[j - 1]);
  let iExit = i;
  while (iExit > 1 && accel(iExit) >= EXIT_ACCEL) iExit--;

  // Moment vertical speed reached 10 m/s, interpolated between samples i-1 and i.
  const f = i > 0 ? (EXIT_SPEED - vSpeed[i - 1]) / (vSpeed[i] - vSpeed[i - 1]) : 0;
  const reached = i > 0 ? t[i - 1] + f * (t[i] - t[i - 1]) : t[i];
  const laneStart = reached + LANE_DELAY <= t[t.length - 1] ? reached + LANE_DELAY : null;

  const bottom = crossing(track, JUMP_BOTTOM, iExit);
  return { exit: t[iExit], end: bottom ? bottom.t : t[t.length - 1], laneStart };
}

function highestIndex(track) {
  const h = track.alt;
  let top = 0;
  for (let i = 1; i < h.length; i++) if (h[i] > h[top]) top = i;
  return top;
}

// First point at or after index `from` where altitude drops below `alt`,
// interpolated between the two samples either side of it.
function crossing(track, alt, from) {
  const h = track.alt;
  for (let i = Math.max(from, 1); i < h.length; i++) {
    if (h[i - 1] >= alt && h[i] < alt) {
      const f = (h[i - 1] - alt) / (h[i - 1] - h[i]);
      const lerp = (a) => a[i - 1] + f * (a[i] - a[i - 1]);
      return { i, t: lerp(track.t), lat: lerp(track.lat), lon: lerp(track.lon) };
    }
  }
  return null;
}

// Horizontal distance in metres on the WGS84 ellipsoid. Uses the local
// curvature at the mean latitude, accurate to well under a metre over a few km.
function groundDistance(lat1, lon1, lat2, lon2) {
  const a = 6378137;
  const e2 = 6.69437999014e-3;
  const rad = Math.PI / 180;
  const phi = ((lat1 + lat2) / 2) * rad;
  const w = 1 - e2 * Math.sin(phi) ** 2;
  const meridian = (a * (1 - e2)) / w ** 1.5;
  const primeVertical = a / Math.sqrt(w);
  const north = (lat2 - lat1) * rad * meridian;
  const east = (lon2 - lon1) * rad * primeVertical * Math.cos(phi);
  return Math.hypot(north, east);
}

if (typeof module !== "undefined") module.exports = { scoreWindow, findJump };

const fileInput = document.getElementById("file");
const filenameEl = document.getElementById("filename");
const errorEl = document.getElementById("error");
const viewer = document.getElementById("viewer");
const emptyEl = document.getElementById("empty");
const chartEl = document.getElementById("chart");
const fromInput = document.getElementById("from");
const toInput = document.getElementById("to");
const resetButton = document.getElementById("reset");
const findJumpButton = document.getElementById("find-jump");
const entryButton = document.getElementById("entry");
const alarmListEl = document.getElementById("alarm-list");
const alarmReadoutEl = document.getElementById("alarm-readout");
const addAlarmButton = document.getElementById("add-alarm");
const groundInput = document.getElementById("ground");
const topInput = document.getElementById("top");
const bottomInput = document.getElementById("bottom");
const scoreEl = document.getElementById("score");
const scoreErrorEl = document.getElementById("score-error");
const dzHintEl = document.getElementById("dz-hint");
const dzSavedEl = document.getElementById("dz-saved");
const useEstimateButton = document.getElementById("use-estimate");
const resetSettingsButton = document.getElementById("reset-settings");
const mapEl = document.getElementById("map");

let chart = null;
let track = null;
let score = null;
let trackMap = null; // created on the first import, once the map card is visible
let showAlarms = false; // alarms are on the chart only after Entry, until Jump/Reset or a new import

// Settings kept on this device between visits (browser storage, never uploaded):
//   dz      DZ elevation typed by the user, or null to use each track's estimate
//   top     scoring window top (m)
//   bottom  scoring window bottom (m)
//   shown   which measures are shown on the chart
//   alarms  [{ name, alt }] FlySight alarms, alt in m above ground
const SETTINGS_KEY = "flysight-viewer-settings";
const DEFAULTS = {
  dz: null,
  top: 2500,
  bottom: 1500,
  shown: { alt: true, vSpeed: true, hSpeed: true, tSpeed: false, glide: false },
  alarms: [],
};
const settings = loadSettings();

function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {} // storage blocked or corrupt: use defaults
  return { ...DEFAULTS, ...saved, shown: { ...DEFAULTS.shown, ...saved.shown } };
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {} // e.g. private browsing: settings just won't be remembered
}

topInput.value = settings.top;
bottomInput.value = settings.bottom;

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  fileInput.value = ""; // allow re-importing the same file
  if (!file) return;

  // A new import always clears the previous track.
  clearTrack();
  filenameEl.textContent = file.name;
  try {
    track = parseFlySight(await file.text());
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  viewer.hidden = false;
  if (trackMap) trackMap.resize();
  else trackMap = createTrackMap(mapEl);
  setGround();
  updateScore();
  drawChart();
});

// Redraws the map for the current viewing window, at most once per frame.
let mapUpdatePending = false;
function updateMap() {
  if (mapUpdatePending) return;
  mapUpdatePending = true;
  requestAnimationFrame(() => {
    mapUpdatePending = false;
    if (!chart || !trackMap || chart.scales.x.min == null) return;
    trackMap.update(track, chart.scales.x.min, chart.scales.x.max, score, findJump(track));
  });
}

// Uses the saved DZ elevation if there is one, otherwise the track's estimate,
// and recomputes altitude above ground for the chart and scoring.
function setGround() {
  const ground = settings.dz ?? track.ground;
  groundInput.value = ground;
  track.alt = track.hMSL.map((a) => a - ground);
  dzSavedEl.textContent =
    settings.dz == null ? "Estimated from this track" : `Saved · this track suggests ${track.ground} m`;
  useEstimateButton.hidden = settings.dz == null;
}

// After the DZ elevation changes on a loaded track.
function groundChanged() {
  setGround();
  updateScore();
  const { min, max } = chart.scales.x;
  chart.setData(chartData());
  chart.setScale("x", { min, max }); // keep the viewing window
}

groundInput.addEventListener("change", () => {
  const ground = parseFloat(groundInput.value);
  settings.dz = isNaN(ground) ? null : ground; // empty or invalid: back to the estimate
  saveSettings();
  if (track) groundChanged();
});

useEstimateButton.addEventListener("click", () => {
  settings.dz = null;
  saveSettings();
  if (track) groundChanged();
});

function clearTrack() {
  if (trackMap) trackMap.reset();
  if (chart) chart.destroy();
  chart = null;
  track = null;
  score = null;
  showAlarms = false;
  errorEl.hidden = true;
  viewer.hidden = true;
}

// Measures that can be shown on the chart, in legend order.
// Each one's colour is the CSS variable --c-<key> (light and dark versions in style.css).
const MEASURES = [
// `short` and `unit` are for the phone layout, where the pills show live values.
  { key: "alt", label: "Altitude (m)", short: "Alt", unit: " m", scale: "m", width: 2, digits: 0 },
  { key: "vSpeed", label: "Vertical speed (km/h)", short: "Vert", unit: "", scale: "kmh", digits: 0 },
  { key: "hSpeed", label: "Horizontal speed (km/h)", short: "Horiz", unit: "", scale: "kmh", digits: 0 },
  { key: "tSpeed", label: "Total speed (km/h)", short: "Total", unit: "", scale: "kmh", digits: 0 },
  { key: "glide", label: "Glide ratio", short: "Glide", unit: "", scale: "glide", digits: 2 },
];
// `color` names the measure whose colour an axis with a single measure takes.
const AXES = [
  { scale: "m", label: "Altitude (m)", side: 3, color: "alt" },
  { scale: "kmh", label: "Speed (km/h)", side: 1 },
  { scale: "glide", label: "Glide ratio", side: 1, color: "glide" },
];

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
// Below this chart width (phones), axes drop their titles and use smaller text.
const COMPACT_WIDTH = 600;
let chartCompact = false;
// Phone held upright gets the compact layout (keep in sync with style.css).
const PHONE_PORTRAIT = matchMedia("(max-width: 600px) and (orientation: portrait)");
const cursorTimeEl = document.getElementById("cursor-time");
const pillValues = {};
// Which measures are shown (saved in settings).
const shown = settings.shown;
const measureBoxes = {};

function chartData() {
  return [track.t, ...MEASURES.map((m) => track[m.key])];
}

function drawChart() {
  chartCompact = chartEl.clientWidth < COMPACT_WIDTH;
  // Only draw the axes that have a visible measure; the first one gets the grid.
  const axes = AXES.filter((a) => MEASURES.some((m) => m.scale === a.scale && shown[m.key]));
  const opts = {
    width: chartEl.clientWidth,
    height: chartHeight(),
    cursor: { drag: { x: true, y: false } },
    scales: { x: { time: false } },
    series: [
      { label: "Time (s)", value: (u, v) => (v == null ? "-" : v.toFixed(1)) },
      ...MEASURES.map((m) => ({
        label: m.label,
        scale: m.scale,
        stroke: cssVar(`--c-${m.key}`),
        width: m.width || 1.5,
        show: shown[m.key],
        value: (u, v) => fmt(v, m.digits),
      })),
    ],
    axes: [
      // No "Time (s)" title on a phone held upright: the time is shown next to the card title.
      { ...(PHONE_PORTRAIT.matches ? { size: 28 } : { label: "Time (s)" }), ...axisColors(true), ...(chartCompact ? COMPACT_AXIS : {}) },
      ...axes.map((a, i) => (chartCompact ? compactAxis(a, i === 0) : fullAxis(a, i === 0))),
    ],
    hooks: {
      setScale: [(u, key) => { if (key === "x") { syncInputs(u); updateMap(); } }],
      setCursor: [(u) => { if (trackMap) trackMap.setCursor(track, u.cursor.idx); showPillValues(u.cursor.idx); }],
      drawClear: [drawScoringBand],
      draw: [drawAlarms],
    },
  };
  chart = new uPlot(opts, chartData(), chartEl);
  addTouchZoom(chart);
}

const COMPACT_AXIS = { font: "10px system-ui, sans-serif", labelFont: "bold 10px system-ui, sans-serif", gap: 2 };

// Theme colours for an axis: labels in the muted text colour, or in the
// measure's colour when the axis has only one measure.
function axisColors(grid, measure) {
  const line = cssVar("--grid");
  return {
    stroke: measure ? cssVar(`--c-${measure}`) : cssVar("--muted"),
    grid: { show: grid, stroke: line, width: 1 },
    ticks: { stroke: line, width: 1, size: chartCompact ? 4 : 10 },
  };
}

function fullAxis(a, grid) {
  return { scale: a.scale, side: a.side, label: a.label, ...axisColors(grid, a.color) };
}

// Phone-sized axis: no title, narrow, small text, and thousands of metres shortened to "2.5k".
function compactAxis(a, grid) {
  const axis = { scale: a.scale, side: a.side, size: 34, ...axisColors(grid, a.color), ...COMPACT_AXIS };
  if (a.scale === "m") axis.values = (u, vals) => vals.map((v) => (Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v));
  return axis;
}

// Rebuilds the chart (e.g. when axes change) and keeps the viewing window.
function rebuildChart() {
  const { min, max } = chart.scales.x;
  chart.destroy();
  drawChart();
  chart.setScale("x", { min, max });
}

// Toggles to show or hide each measure: checkboxes styled as pills.
for (const m of MEASURES) {
  const label = document.createElement("label");
  label.className = "measure";
  label.style.setProperty("--m", `var(--c-${m.key})`);
  const dot = document.createElement("span");
  dot.className = "dot";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = shown[m.key];
  box.addEventListener("change", () => {
    shown[m.key] = box.checked;
    saveSettings();
    if (chart) rebuildChart(); // axes appear and disappear with their measures
  });
  measureBoxes[m.key] = box;
  const long = document.createElement("span");
  long.className = "long";
  long.textContent = m.label;
  const short = document.createElement("span");
  short.className = "short";
  short.textContent = m.short;
  const value = document.createElement("span");
  value.className = "value";
  pillValues[m.key] = value;
  label.append(box, dot, long, short, value);
  document.getElementById("measures").append(label);
}

// Phone layout: the pills and the card title stand in for the chart legend.
function showPillValues(i) {
  cursorTimeEl.textContent = i == null ? "" : `t = ${track.t[i].toFixed(1)} s`;
  for (const m of MEASURES) {
    const v = i == null ? null : track[m.key][i];
    pillValues[m.key].textContent = v == null ? "" : ` ${v.toLocaleString("en-US", { maximumFractionDigits: m.digits, minimumFractionDigits: m.digits })}${m.unit}`;
  }
}

// uPlot's drag-to-zoom only listens to the mouse. On touch screens, a sideways
// drag selects a range and zooms to it; vertical swipes still scroll the page.
function addTouchZoom(u) {
  const over = u.over;
  over.style.touchAction = "pan-y";
  let startX = null;

  const xOf = (e) => Math.max(0, Math.min(e.clientX - over.getBoundingClientRect().left, over.clientWidth));
  const clear = () => {
    startX = null;
    u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
  };

  over.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    startX = xOf(e);
    try {
      over.setPointerCapture(e.pointerId); // keep tracking if the finger leaves the chart
    } catch {}
  });
  over.addEventListener("pointermove", (e) => {
    if (startX === null) return;
    const x = xOf(e);
    u.setSelect({ left: Math.min(startX, x), top: 0, width: Math.abs(x - startX), height: over.clientHeight }, false);
  });
  over.addEventListener("pointerup", (e) => {
    if (startX === null) return;
    const x = xOf(e);
    const left = Math.min(startX, x);
    const width = Math.abs(x - startX);
    clear();
    if (width < 10) return; // a tap, not a drag
    chart.setScale("x", { min: u.posToVal(left, "x"), max: u.posToVal(left + width, "x") });
  });
  over.addEventListener("pointercancel", clear);
}

// Shades the scoring window behind the chart lines.
function drawScoringBand(u) {
  if (!score || score.error) return;
  const { left, top, width, height } = u.bbox;
  const x1 = Math.max(left, u.valToPos(score.start, "x", true));
  const x2 = Math.min(left + width, u.valToPos(score.end, "x", true));
  if (x2 <= x1) return;
  u.ctx.save();
  u.ctx.fillStyle = cssVar("--band");
  u.ctx.fillRect(x1, top, x2 - x1, height);
  u.ctx.restore();
}

function updateScore() {
  score = scoreWindow(track, parseFloat(topInput.value), parseFloat(bottomInput.value));
  scoreErrorEl.hidden = !score.error;
  scoreEl.hidden = !!score.error;
  if (score.error) {
    scoreErrorEl.textContent = score.error;
  } else {
    document.getElementById("score-time").textContent = `${score.time.toFixed(1)} s`;
    document.getElementById("score-distance").textContent = `${score.distance.toFixed(0)} m`;
    document.getElementById("score-speed").textContent = `${score.speed.toFixed(1)} km/h`;
  }
  if (chart) chart.redraw(false);
  updateMap();
  renderAlarmReadout(); // alarm times depend on the DZ elevation and the scoring window
}

function scoringWindowChanged() {
  const top = parseFloat(topInput.value);
  const bottom = parseFloat(bottomInput.value);
  if (!isNaN(top)) settings.top = top;
  if (!isNaN(bottom)) settings.bottom = bottom;
  saveSettings();
  if (track) updateScore();
}

topInput.addEventListener("change", scoringWindowChanged);
bottomInput.addEventListener("change", scoringWindowChanged);

resetSettingsButton.addEventListener("click", () => {
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {}
  Object.assign(settings, DEFAULTS, { shown: settings.shown, alarms: [] });
  renderAlarmList();
  Object.assign(shown, DEFAULTS.shown);
  for (const key in measureBoxes) measureBoxes[key].checked = shown[key];
  topInput.value = settings.top;
  bottomInput.value = settings.bottom;
  if (!track) return;
  setGround();
  updateScore();
  rebuildChart();
});

function fmt(v, digits) {
  return v == null ? "-" : v.toFixed(digits);
}

function chartHeight() {
  // Phone held upright: leave room for the map underneath.
  if (PHONE_PORTRAIT.matches) return Math.round(Math.max(200, Math.min(320, window.innerHeight * 0.36)));
  return Math.max(300, Math.min(500, window.innerHeight - 200));
}

// Chart zoom -> inputs
function syncInputs(u) {
  if (u.scales.x.min == null) return; // not laid out yet; the setScale hook fills them in
  fromInput.value = u.scales.x.min.toFixed(1);
  toInput.value = u.scales.x.max.toFixed(1);
}

// Inputs -> chart zoom
function applyInputs() {
  if (!chart) return;
  const end = track.t[track.t.length - 1];
  let min = parseFloat(fromInput.value);
  let max = parseFloat(toInput.value);
  if (isNaN(min)) min = 0;
  if (isNaN(max)) max = end;
  min = Math.max(0, Math.min(min, end));
  max = Math.max(0, Math.min(max, end));
  if (max <= min) {
    syncInputs(chart); // invalid range: put back the current window
    return;
  }
  chart.setScale("x", { min, max });
}

fromInput.addEventListener("change", applyInputs);
toInput.addEventListener("change", applyInputs);

// Zooms to the jump: from 2 s before exit to 1000 m above ground.
findJumpButton.addEventListener("click", () => {
  if (!chart) return;
  const jump = findJump(track);
  errorEl.hidden = !jump.error;
  if (jump.error) {
    errorEl.textContent = jump.error;
    return;
  }
  setShowAlarms(false);
  chart.setScale("x", { min: Math.max(track.t[0], jump.exit - 2), max: jump.end });
});

// Analyze entry: from exit to 10 s after entering the scoring window, with the alarms.
entryButton.addEventListener("click", () => {
  if (!chart) return;
  const jump = findJump(track);
  const error = jump.error || (score.error && `No scoring window: ${score.error}`);
  errorEl.hidden = !error;
  if (error) {
    errorEl.textContent = error;
    return;
  }
  setShowAlarms(true);
  chart.setScale("x", { min: jump.exit, max: Math.min(score.start + 10, track.t[track.t.length - 1]) });
});

resetButton.addEventListener("click", () => {
  if (!chart) return;
  setShowAlarms(false);
  chart.setScale("x", { min: track.t[0], max: track.t[track.t.length - 1] });
});

// Alarms

function setShowAlarms(on) {
  showAlarms = on;
  renderAlarmReadout();
  if (chart) chart.redraw(false);
}

// When each alarm went off on the current track, or [] if there's no exit.
function currentAlarms() {
  const jump = findJump(track);
  return jump.error ? [] : alarmCrossings(track, jump, settings.alarms);
}

// Alarm list editor: one row per alarm with a name and an altitude.
function renderAlarmList() {
  alarmListEl.replaceChildren();
  settings.alarms.forEach((alarm, i) => {
    const row = document.createElement("div");
    row.className = "alarm-row";
    const name = document.createElement("input");
    name.type = "text";
    name.placeholder = "Name, e.g. 2800";
    name.setAttribute("aria-label", "Alarm name");
    name.value = alarm.name;
    const alt = document.createElement("input");
    alt.type = "number";
    alt.step = "1";
    alt.placeholder = "Altitude";
    alt.setAttribute("aria-label", "Alarm altitude (m)");
    alt.value = Number.isFinite(alarm.alt) ? alarm.alt : "";
    const unit = document.createElement("span");
    unit.className = "muted";
    unit.textContent = "m";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "link";
    remove.textContent = "Remove";

    const changed = () => {
      alarm.name = name.value.trim();
      alarm.alt = parseFloat(alt.value);
      alarmsChanged();
    };
    name.addEventListener("change", changed);
    alt.addEventListener("change", changed);
    remove.addEventListener("click", () => {
      settings.alarms.splice(i, 1);
      renderAlarmList();
      alarmsChanged();
    });
    row.append(name, alt, unit, remove);
    alarmListEl.append(row);
  });
}

function alarmsChanged() {
  saveSettings();
  renderAlarmReadout();
  if (chart) chart.redraw(false);
}

addAlarmButton.addEventListener("click", () => {
  settings.alarms.push({ name: "", alt: NaN });
  renderAlarmList();
  alarmListEl.lastElementChild.querySelector("input").focus();
});

// After Entry: when each alarm went off, relative to entering the scoring window.
function renderAlarmReadout() {
  alarmReadoutEl.replaceChildren();
  if (!track || !settings.alarms.length) return;
  if (!showAlarms) {
    alarmReadoutEl.innerHTML = '<p class="muted">Press <b>Entry</b> to see when each alarm went off.</p>';
    return;
  }
  const table = document.createElement("table");
  table.className = "alarm-table";
  table.innerHTML = "<thead><tr><th>Alarm</th><th>Altitude</th><th>Timing</th><th>Vert / horiz</th></tr></thead>";
  const body = table.createTBody();
  for (const a of currentAlarms()) {
    const row = body.insertRow();
    const cells = [a.name || "(no name)", `${a.alt} m`];
    if (a.t == null) {
      cells.push("Not reached", "");
    } else {
      cells.push(entryTiming(a.t), `${Math.round(a.vSpeed)} / ${Math.round(a.hSpeed)} km/h`);
    }
    for (const text of cells) row.insertCell().textContent = text;
  }
  alarmReadoutEl.append(table);
}

function entryTiming(t) {
  if (!score || score.error) return `${(t - findJump(track).exit).toFixed(1)} s after exit`;
  const d = t - score.start;
  if (Math.abs(d) < 0.05) return "At entry";
  return d < 0 ? `${(-d).toFixed(1)} s before entry` : `${d.toFixed(1)} s after entry`;
}

// Dashed line and name on the chart where each alarm went off (after Entry only).
function drawAlarms(u) {
  if (!showAlarms) return;
  const { left, top, width, height } = u.bbox;
  const ctx = u.ctx;
  const pr = devicePixelRatio || 1;
  ctx.save();
  ctx.font = `${11 * pr}px system-ui, sans-serif`;
  ctx.textBaseline = "top";
  const rowEnds = []; // right edge of the last label in each row of labels
  currentAlarms()
    .filter((a) => a.t != null)
    .sort((a, b) => a.t - b.t)
    .forEach((a) => {
      const x = Math.round(u.valToPos(a.t, "x", true));
      if (x < left || x > left + width) return;
      ctx.strokeStyle = cssVar("--text");
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = pr;
      ctx.setLineDash([4 * pr, 3 * pr]);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + height);
      ctx.stroke();
      // Label in the first row where it doesn't overlap the previous one (up to 4 rows).
      const label = a.name || `${a.alt} m`;
      const w = ctx.measureText(label).width + 8 * pr;
      const lx = Math.min(x + 3 * pr, left + width - w);
      let row = rowEnds.findIndex((end) => end + 3 * pr <= lx);
      if (row < 0) row = rowEnds.length < 4 ? rowEnds.length : rowEnds.indexOf(Math.min(...rowEnds));
      rowEnds[row] = lx + w;
      const y = top + 4 * pr + row * 17 * pr;
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      ctx.fillStyle = cssVar("--card");
      ctx.fillRect(lx, y, w, 15 * pr);
      ctx.strokeRect(lx, y, w, 15 * pr);
      ctx.fillStyle = cssVar("--text");
      ctx.fillText(label, lx + 4 * pr, y + 2 * pr);
    });
  ctx.restore();
}

renderAlarmList();

// The chart draws on a canvas, so it has to be redrawn when the system switches light/dark.
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (chart) rebuildChart();
});

window.addEventListener("resize", () => {
  if (!chart) return;
  if (chartEl.clientWidth < COMPACT_WIDTH !== chartCompact) rebuildChart(); // e.g. phone rotated
  else chart.setSize({ width: chartEl.clientWidth, height: chartHeight() });
});

// Switching between the phone and full layouts changes the chart's size.
PHONE_PORTRAIT.addEventListener("change", () => {
  if (chart) rebuildChart();
});

// Lets the app be installed and opened offline (needs https or localhost).
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

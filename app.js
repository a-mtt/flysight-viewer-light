const fileInput = document.getElementById("file");
const filenameEl = document.getElementById("filename");
const errorEl = document.getElementById("error");
const viewer = document.getElementById("viewer");
const emptyEl = document.getElementById("empty");
const chartEl = document.getElementById("chart");
const fromInput = document.getElementById("from");
const toInput = document.getElementById("to");
const resetButton = document.getElementById("reset");
const groundInput = document.getElementById("ground");
const topInput = document.getElementById("top");
const bottomInput = document.getElementById("bottom");
const scoreEl = document.getElementById("score");
const scoreErrorEl = document.getElementById("score-error");
const dzHintEl = document.getElementById("dz-hint");
const dzSavedEl = document.getElementById("dz-saved");
const useEstimateButton = document.getElementById("use-estimate");
const resetSettingsButton = document.getElementById("reset-settings");

let chart = null;
let track = null;
let score = null;

// Settings kept on this device between visits (browser storage, never uploaded):
//   dz      DZ elevation typed by the user, or null to use each track's estimate
//   top     scoring window top (m)
//   bottom  scoring window bottom (m)
//   shown   which measures are shown on the chart
const SETTINGS_KEY = "flysight-viewer-settings";
const DEFAULTS = {
  dz: null,
  top: 2500,
  bottom: 1500,
  shown: { alt: true, vSpeed: true, hSpeed: true, tSpeed: false, glide: false },
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
  setGround();
  updateScore();
  drawChart();
});

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
  if (chart) chart.destroy();
  chart = null;
  track = null;
  score = null;
  errorEl.hidden = true;
  viewer.hidden = true;
}

// Measures that can be shown on the chart, in legend order.
// Each one's colour is the CSS variable --c-<key> (light and dark versions in style.css).
const MEASURES = [
  { key: "alt", label: "Altitude (m)", scale: "m", width: 2, digits: 0 },
  { key: "vSpeed", label: "Vertical speed (km/h)", scale: "kmh", digits: 0 },
  { key: "hSpeed", label: "Horizontal speed (km/h)", scale: "kmh", digits: 0 },
  { key: "tSpeed", label: "Total speed (km/h)", scale: "kmh", digits: 0 },
  { key: "glide", label: "Glide ratio", scale: "glide", digits: 2 },
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
      { label: "Time (s)", ...axisColors(true), ...(chartCompact ? COMPACT_AXIS : {}) },
      ...axes.map((a, i) => (chartCompact ? compactAxis(a, i === 0) : fullAxis(a, i === 0))),
    ],
    hooks: {
      setScale: [(u, key) => { if (key === "x") syncInputs(u); }],
      drawClear: [drawScoringBand],
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
  label.append(box, dot, m.label);
  document.getElementById("measures").append(label);
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
  Object.assign(settings, DEFAULTS, { shown: settings.shown });
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

resetButton.addEventListener("click", () => {
  if (!chart) return;
  chart.setScale("x", { min: track.t[0], max: track.t[track.t.length - 1] });
});

// The chart draws on a canvas, so it has to be redrawn when the system switches light/dark.
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (chart) rebuildChart();
});

window.addEventListener("resize", () => {
  if (!chart) return;
  if (chartEl.clientWidth < COMPACT_WIDTH !== chartCompact) rebuildChart(); // e.g. phone rotated
  else chart.setSize({ width: chartEl.clientWidth, height: chartHeight() });
});

// Lets the app be installed and opened offline (needs https or localhost).
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

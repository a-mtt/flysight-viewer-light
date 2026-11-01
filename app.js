const fileInput = document.getElementById("file");
const filenameEl = document.getElementById("filename");
const errorEl = document.getElementById("error");
const viewer = document.getElementById("viewer");
const chartEl = document.getElementById("chart");
const fromInput = document.getElementById("from");
const toInput = document.getElementById("to");
const resetButton = document.getElementById("reset");
const groundInput = document.getElementById("ground");
const topInput = document.getElementById("top");
const bottomInput = document.getElementById("bottom");
const scoreEl = document.getElementById("score");
const scoreErrorEl = document.getElementById("score-error");

let chart = null;
let track = null;
let score = null;

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
    return;
  }
  viewer.hidden = false;
  groundInput.value = track.ground;
  setGround(track.ground);
  updateScore();
  drawChart();
});

// Recomputes altitude above ground for the chart and scoring.
function setGround(ground) {
  track.alt = track.hMSL.map((a) => a - ground);
}

groundInput.addEventListener("change", () => {
  if (!track) return;
  let ground = parseFloat(groundInput.value);
  if (isNaN(ground)) {
    ground = track.ground; // empty or invalid: back to the estimate
    groundInput.value = ground;
  }
  setGround(ground);
  updateScore();
  const { min, max } = chart.scales.x;
  chart.setData(chartData());
  chart.setScale("x", { min, max }); // keep the viewing window
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
const MEASURES = [
  { key: "alt", label: "Altitude (m)", scale: "m", stroke: "#2563eb", width: 2, digits: 0 },
  { key: "vSpeed", label: "Vertical speed (km/h)", scale: "kmh", stroke: "#dc2626", digits: 0 },
  { key: "hSpeed", label: "Horizontal speed (km/h)", scale: "kmh", stroke: "#16a34a", digits: 0 },
  { key: "tSpeed", label: "Total speed (km/h)", scale: "kmh", stroke: "#7c3aed", digits: 0 },
  { key: "glide", label: "Glide ratio", scale: "glide", stroke: "#ea580c", digits: 2 },
];
const AXES = [
  { scale: "m", label: "Altitude (m)", side: 3 },
  { scale: "kmh", label: "Speed (km/h)", side: 1 },
  { scale: "glide", label: "Glide ratio", side: 1 },
];
// Which measures are shown; kept across imports until the page is reloaded.
const shown = { alt: true, vSpeed: true, hSpeed: true, tSpeed: false, glide: false };

function chartData() {
  return [track.t, ...MEASURES.map((m) => track[m.key])];
}

function drawChart() {
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
        stroke: m.stroke,
        width: m.width || 1.5,
        show: shown[m.key],
        value: (u, v) => fmt(v, m.digits),
      })),
    ],
    axes: [{ label: "Time (s)" }, ...axes.map((a, i) => ({ ...a, grid: { show: i === 0 } }))],
    hooks: {
      setScale: [(u, key) => { if (key === "x") syncInputs(u); }],
      drawClear: [drawScoringBand],
    },
  };
  chart = new uPlot(opts, chartData(), chartEl);
  addTouchZoom(chart);
}

// Checkboxes to show or hide each measure.
for (const m of MEASURES) {
  const label = document.createElement("label");
  label.style.color = m.stroke;
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = shown[m.key];
  box.addEventListener("change", () => {
    shown[m.key] = box.checked;
    if (!chart) return;
    // Rebuild so axes appear and disappear with their measures; keep the viewing window.
    const { min, max } = chart.scales.x;
    chart.destroy();
    drawChart();
    chart.setScale("x", { min, max });
  });
  label.append(box, " " + m.label);
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
  u.ctx.fillStyle = "rgba(234, 179, 8, 0.2)";
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

topInput.addEventListener("change", () => { if (track) updateScore(); });
bottomInput.addEventListener("change", () => { if (track) updateScore(); });

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

window.addEventListener("resize", () => {
  if (chart) chart.setSize({ width: chartEl.clientWidth, height: chartHeight() });
});

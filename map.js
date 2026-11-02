// Ground track on an OpenStreetMap background (Leaflet).
// createTrackMap(el) returns { update, setCursor, resize, reset }:
//   update(track, from, to, score, jump)  draw the part of the track between `from` and `to`
//                                         (track seconds), the scoring window and jump markers
//   setCursor(track, i)                   move the dot to sample i, or hide it with null
//   resize()                              call after the map's container is shown again
//   reset()                               forget the framing and hide the dot (new track)
function createTrackMap(el) {
  const map = L.map(el, { preferCanvas: true });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const layers = L.layerGroup().addTo(map);
  const cursor = L.circleMarker([0, 0], { radius: 7, weight: 3, color: "#fff", fillOpacity: 1 });

  const color = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const latLngs = (track, i0, i1) => {
    const pts = [];
    for (let i = i0; i <= i1; i++) pts.push([track.lat[i], track.lon[i]]);
    return pts;
  };
  // Index range of samples between two times.
  const range = (t, from, to) => {
    let i0 = t.findIndex((x) => x >= from);
    let i1 = t.length - 1;
    while (i1 > 0 && t[i1] > to) i1--;
    return i0 < 0 ? [0, -1] : [i0, i1];
  };
  const point = (track, time, label, fill) => {
    const i = Math.max(0, track.t.findIndex((x) => x >= time));
    L.circleMarker([track.lat[i], track.lon[i]], { radius: 6, weight: 2, color: "#fff", fillColor: fill, fillOpacity: 1 })
      .bindTooltip(label)
      .addTo(layers);
  };

  let shownRange = null;

  function update(track, from, to, score, jump) {
    layers.clearLayers();
    const [i0, i1] = range(track.t, from, to);
    if (i1 < i0) return;

    const line = L.polyline(latLngs(track, i0, i1), { color: color("--c-alt"), weight: 3 }).addTo(layers);

    // Scoring window, highlighted where it overlaps the viewing window.
    if (score && !score.error) {
      const [s0, s1] = range(track.t, Math.max(from, score.start), Math.min(to, score.end));
      if (s1 > s0) L.polyline(latLngs(track, s0, s1), { color: "#eab308", weight: 6, opacity: 0.9 }).addTo(layers);
      if (score.start >= from && score.start <= to) point(track, score.start, "Scoring window start", "#eab308");
      if (score.end >= from && score.end <= to) point(track, score.end, "Scoring window end", "#eab308");
    }
    if (jump && !jump.error) {
      if (jump.exit >= from && jump.exit <= to) point(track, jump.exit, "Exit", color("--c-hSpeed"));
      if (jump.end >= from && jump.end <= to) point(track, jump.end, "1000 m", color("--c-vSpeed"));
    }

    // Re-frame only when the viewing window changes, not on every redraw.
    const key = `${from}|${to}`;
    if (key !== shownRange) {
      shownRange = key;
      map.fitBounds(line.getBounds(), { padding: [20, 20], maxZoom: 17 });
    }
    cursor.setStyle({ fillColor: color("--text") });
  }

  function setCursor(track, i) {
    if (i == null) {
      cursor.remove();
      return;
    }
    cursor.setLatLng([track.lat[i], track.lon[i]]);
    if (!map.hasLayer(cursor)) cursor.addTo(map);
  }

  // The map container may have been hidden when Leaflet measured it.
  function resize() {
    map.invalidateSize();
  }

  function reset() {
    shownRange = null;
    cursor.remove();
  }

  return { update, setCursor, resize, reset };
}

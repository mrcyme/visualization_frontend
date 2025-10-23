// Basic utilities
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getFeatureId(feature, index) {
  if (!feature || typeof feature !== 'object') return String(index);
  if (feature.id != null) return String(feature.id);
  const p = feature.properties || {};
  return String(p.id || p.vehicle_id || p.trip_id || p.journey_id || p.segment_id || index);
}

function getLonLat(feature) {
  const g = feature && feature.geometry;
  if (g && g.type === 'Point' && Array.isArray(g.coordinates)) {
    const [lon, lat] = g.coordinates;
    return [lon, lat];
  }
  return [0, 0];
}

function getMode(feature) {
  const p = (feature && feature.properties) || {};
  return p.mode || p.route_type || p.vehicle_type || p.type || 'bus';
}

function colorScale(total) {
  const t = Math.max(0, Math.min(1, total / 1000));
  const r = Math.round(255 * t);
  const g = Math.round(215 * (1 - Math.abs(t - 0.5) * 2));
  const b = Math.round(255 * (1 - t));
  return [r, g, b, 180];
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getByPath(obj, path) {
  try {
    return path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), obj);
  } catch {
    return undefined;
  }
}

const SOURCES = [
  { id: 'stib', name: 'STIB Vehicle position', endpoint: '/api/vehicle-position', details: `
<b>Vehicle position</b><br/>
<small>application/json (GeoJSON FeatureCollection)</small><br/>
The estimated positions of the vehicles based on GTFS feed and proprietary APIs.<br/>
<b>Query</b>: timestamp (seconds since epoch)<br/>
<b>Responses</b>: 200, 404
  `.trim() },
  { id: 'sncb', name: 'SNCB Vehicle position (trains)', endpoint: '/api/sncb/vehicle-position', details: `
<b>Vehicle position</b><br/>
<small>application/json (GeoJSON FeatureCollection)</small><br/>
The estimated positions of the trains based on the GTFS-RT feed combined with the GTFS feed.<br/>
<b>Data</b>: Start 2024-08-21 14:54:59 — End 2025-09-17 11:27:50 — Count 1,501,879<br/>
<b>Auth</b>: Bearer token<br/>
<b>Query</b>: timestamp, start_timestamp, end_timestamp, limit, offset<br/>
<b>Responses</b>: 200, 404
  `.trim() },
  { id: 'bolt', name: 'Bolt Vehicle position', endpoint: '/api/bolt/vehicle-position', details: `
<b>Vehicle position</b><br/>
<small>application/json (GeoJSON FeatureCollection)</small><br/>
The vehicles of Bolt in Brussels<br/>
<b>Data</b>: Start 2024-08-21 14:59:39 — End 2025-09-17 14:26:44 — Count 95,705<br/>
<b>Auth</b>: Bearer token<br/>
<b>Query</b>: timestamp<br/>
<b>Responses</b>: 200, 404
  `.trim() },
  { id: 'dott', name: 'Dott Vehicle position', endpoint: '/api/dott/vehicle-position', details: `
<b>Vehicle position</b><br/>
<small>application/json (GeoJSON FeatureCollection)</small><br/>
The vehicles of Dott in Brussels<br/>
<b>Data</b>: Start 2024-08-21 14:59:39 — End 2025-09-17 11:01:22 — Count 93,966<br/>
<b>Auth</b>: Bearer token<br/>
<b>Query</b>: timestamp<br/>
<b>Responses</b>: 200, 404
  `.trim() },
  { id: 'telraam', name: 'Traffic — Telraam (lines)', endpoint: '/api/traffic/telraam', details: `
<b>TRAFFIC</b><br/>
Telraam hourly vehicles on Brussels road segments.<br/>
<b>Data</b>: Start 2024-08-21 14:59:39 — End 2025-09-17 11:01:21 — Count 95,722<br/>
<b>Auth</b>: Bearer token — <b>Query</b>: timestamp — <b>Responses</b>: 200, 404
  `.trim() },
  { id: 'tunnels', name: 'Traffic — Tunnels (devices)', endpoint: '/api/traffic/tunnels', details: `
<b>Tunnels</b><br/>
Realtime traffic device counts for Brussels tunnels (joined with device positions).<br/>
<b>Auth</b>: Bearer token — <b>Query</b>: timestamp — <b>Responses</b>: 200, 404
  `.trim() },
  { id: 'air', name: 'Environment — Air quality', endpoint: '/api/environment/air-quality', details: `
<b>Air quality</b><br/>
SOS air quality stations in Brussels.<br/>
<b>Auth</b>: Bearer token — <b>Query</b>: timestamp — <b>Responses</b>: 200, 404
  `.trim() }
];

class PerformanceTracker {
  constructor(hudEl, title) {
    this.hudEl = hudEl;
    this.title = title;
    this.samples = [];
    this.lastHud = 0;
    this.drawn = 0;
  }
  tickStart() { this._t0 = performance.now(); }
  tickEnd(drawCount) {
    const now = performance.now();
    const dt = now - (this._t0 || now);
    this.samples.push(dt);
    if (this.samples.length > 120) this.samples.shift();
    this.drawn = drawCount || 0;
    if (now - this.lastHud > 500) { this.renderHud(); this.lastHud = now; }
  }
  get fps() {
    const avg = this.samples.length ? this.samples.reduce((a,b)=>a+b,0)/this.samples.length : 0;
    return avg ? (1000/avg).toFixed(1) : '0.0';
  }
  renderHud(extra = {}) {
    if (!this.hudEl) return;
    const mem = performance && performance.memory ? `${(performance.memory.usedJSHeapSize/1048576).toFixed(0)} MB` : 'n/a';
    const extras = Object.entries(extra).map(([k,v])=>`${k}: ${v}`).join('\n');
    this.hudEl.innerText = `${this.title}\nFPS: ${this.fps}\nDrawn: ${this.drawn}\nMem: ${mem}${extras?`\n${extras}`:''}`;
  }
}

class DataService {
  constructor() {
    this.prev = null;
    this.curr = null;
    this.pollIntervalMs = 20000;
    this.listeners = new Set();
    this._polling = false;
    this.endpoint = '/api/vehicle-position';
  }
  setEndpoint(endpoint) {
    if (this.endpoint !== endpoint) {
      this.endpoint = endpoint;
      this.prev = null;
      this.curr = null;
    }
  }
  onUpdate(cb) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  _emit() { for (const cb of this.listeners) cb(); }

  async start() {
    if (this._polling) return;
    this._polling = true;
    await this._fetchAndRotate();
    await sleep(250);
    await this._fetchAndRotate();
    this._emit();
    this._loop();
  }
  stop() { this._polling = false; }

  async _loop() {
    while (this._polling) {
      const t0 = performance.now();
      await this._fetchAndRotate();
      this._emit();
      const elapsed = performance.now() - t0;
      const waitMs = Math.max(1000, this.pollIntervalMs - elapsed);
      await sleep(waitMs);
    }
  }

  async _fetchAndRotate() {
    try {
      // Tunnels: fuse traffic JSON + devices
      if (this.endpoint === '/api/traffic/tunnels') {
        const [trafficRes, devicesRes] = await Promise.all([
          fetch('/api/traffic/tunnels'),
          fetch('/api/traffic/tunnel-devices')
        ]);
        if (!trafficRes.ok || !devicesRes.ok) throw new Error('Upstream');
        const traffic = await trafficRes.json();
        const devices = await devicesRes.json();
        const byId = traffic && traffic.data ? traffic.data : {};
        const features = Array.isArray(devices.features) ? devices.features : [];
        const time = Date.now();
        const map = new Map();
        features.forEach((f, i) => {
          const id = String((f.properties && (f.properties.traverse_name || f.properties.id)) || f.id || getFeatureId(f, i));
          const reading = byId[id];
          const results = reading && reading.results ? reading.results : {};
          const sixty = results['60m'] || results['60M'] || results['1h'] || results['60min'] || {};
          const hourlyCount = ((sixty.t1 && typeof sixty.t1.count === 'number') ? sixty.t1.count : 0)
                            + ((sixty.t2 && typeof sixty.t2.count === 'number') ? sixty.t2.count : 0);
          const props = Object.assign({}, f.properties || {}, { hourlyCount, results });
          const pos = getLonLat(f);
          map.set(id, { id, pos, mode: 'tunnel', raw: { type: 'Feature', properties: props, geometry: f.geometry } });
        });
        this.prev = this.curr;
        this.curr = { time, map };
        if (!this.prev) this.prev = this.curr;
        return;
      }

      const res = await fetch(this.endpoint);
      if (!res.ok) throw new Error(`Upstream ${res.status}`);
      const data = await res.json();
      console.log(data);
      const features = Array.isArray(data.features) ? data.features : [];
      const time = Date.now();
      const map = new Map();
      features.forEach((f, i) => {
        const id = getFeatureId(f, i);
        const mode = getMode(f);
        if (f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')) {
          map.set(id, { id, mode, raw: f });
        } else {
          const pos = getLonLat(f);
          map.set(id, { id, pos, mode, raw: f });
        }
      });
      this.prev = this.curr;
      this.curr = { time, map };
      if (!this.prev) this.prev = this.curr;
    } catch (e) {
      // Keep previous snapshot if fetch fails
    }
  }

  getInterpolatedPositions() {
    if (!this.curr || !this.prev) return [];
    const tNow = Date.now();
    const t0 = this.prev.time;
    const t1 = this.curr.time;
    const denom = Math.max(1, t1 - t0);
    const r = Math.max(0, Math.min(1, (tNow - t0) / denom));

    const out = [];
    const ids = new Set([...this.prev.map.keys(), ...this.curr.map.keys()]);
    for (const id of ids) {
      const a = this.prev.map.get(id) || this.curr.map.get(id);
      const b = this.curr.map.get(id) || this.prev.map.get(id);
      if (b.raw && b.raw.geometry && (b.raw.geometry.type === 'LineString' || b.raw.geometry.type === 'MultiLineString')) {
        out.push({ id, raw: b.raw, isLine: true });
        continue;
      }
      const [lonA, latA] = a.pos || [0, 0];
      const [lonB, latB] = b.pos || [0, 0];
      const lon = lonA + (lonB - lonA) * r;
      const lat = latA + (latB - latA) * r;
      const props = (b.raw && b.raw.properties) || (a.raw && a.raw.properties) || {};
      out.push({ id, lon, lat, mode: b.mode || a.mode, properties: props, raw: b.raw });
    }
    return out;
  }
}

const appState = { config: null, data: new DataService(), selectedSourceId: null };

function renderSources() {
  const ul = document.getElementById('source-list');
  const details = document.getElementById('source-details');
  if (!ul) return;
  ul.innerHTML = '';
  SOURCES.forEach((src) => {
    const li = document.createElement('li');
    li.textContent = src.name;
    li.dataset.id = src.id;
    if (appState.selectedSourceId === src.id) li.classList.add('active');
    li.addEventListener('click', async () => {
      selectSource(src.id);
      await appState.data._fetchAndRotate();
      appState.data._emit();
    });
    ul.appendChild(li);
  });
  const sel = SOURCES.find((s) => s.id === appState.selectedSourceId) || SOURCES[0];
  if (details) details.innerHTML = sel.details;
}

function selectSource(id) {
  appState.selectedSourceId = id;
  const src = SOURCES.find((s) => s.id === id) || SOURCES[0];
  appState.data.setEndpoint(src.endpoint);
  document.querySelectorAll('#source-list li').forEach((li) => {
    li.classList.toggle('active', li.dataset.id === id);
  });
  const details = document.getElementById('source-details');
  if (details) details.innerHTML = src.details;
  renderSources();
  updateLegendVisibility();
}

function updateLegendVisibility() {
  const legend = document.getElementById('legend');
  if (!legend) return;
  const show = appState.selectedSourceId === 'telraam' || appState.selectedSourceId === 'tunnels' || appState.selectedSourceId === 'air';
  legend.classList.toggle('hidden', !show);
  if (show) {
    legend.innerHTML = `
<b>${appState.selectedSourceId === 'air' ? 'Value' : 'Hourly vehicles'}</b>
<div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
  <span>low</span>
  <div style="width:120px;height:10px;background:linear-gradient(90deg, rgb(0,215,255), rgb(255,215,0), rgb(255,0,0));border:1px solid #cbd5e1;"></div>
  <span>high</span>
</div>`;
  }
}

function initDeck() {
  const container = document.getElementById('deck-container');
  const hud = document.getElementById('hud-deck');
  const popup = document.getElementById('popup');
  const perf = new PerformanceTracker(hud, 'DeckGL');

  const { TileLayer, BitmapLayer, IconLayer, GeoJsonLayer, ScatterplotLayer } = deck;

  const lightTiles = (appState.config && appState.config.tiles && appState.config.tiles.urlTemplate)
    ? appState.config.tiles.urlTemplate
    : 'https://tile.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';

  const osm = new TileLayer({
    id: 'light-tiles',
    data: lightTiles,
    minZoom: 0,
    maxZoom: 19,
    tileSize: 256,
    renderSubLayers: (props) => {
      const bbox = props.tile && props.tile.bbox;
      if (!bbox) return null;
      const { west, south, east, north } = bbox;
      return new BitmapLayer(props, { data: null, image: props.data, bounds: [west, south, east, north] });
    }
  });

  const deckgl = new deck.Deck({
    parent: container,
    initialViewState: { longitude: 4.3517, latitude: 50.8503, zoom: 12 },
    controller: true,
    layers: [osm]
  });

  function showPopup(x, y, html) {
    if (!popup) return;
    popup.innerHTML = html;
    popup.style.left = `${x + 8}px`;
    popup.style.top = `${y + 8}px`;
    popup.classList.remove('hidden');
  }
  function hidePopup() { if (popup) popup.classList.add('hidden'); }

  function fullPropsHtml(p) {
    try {
      return `<pre style="margin:4px 0;max-height:220px;overflow:auto;">${escapeHtml(JSON.stringify(p, null, 2))}</pre>`;
    } catch {
      return '<i>No properties</i>';
    }
  }

  function render() {
    perf.tickStart();
    const pts = appState.data.getInterpolatedPositions();

    const points = pts.filter((d) => !d.isLine);
    const linesRaw = pts.filter((d) => d.isLine).map((d) => d.raw);

    const iconLayer = new IconLayer({
      id: 'vehicles',
      data: points,
      pickable: true,
      onClick: (info) => {
        if (!info || !info.object) return hidePopup();
        const p = info.object.properties || {};
        showPopup(info.x, info.y, fullPropsHtml(p));
      },
      getPosition: (d) => [d.lon, d.lat],
      getIcon: (d) => {
        const mode = (d.mode || 'bus').toLowerCase();
        const url = mode.includes('tram') ? '/icons/tram.svg' : mode.includes('metro') ? '/icons/metro.svg' : '/icons/bus.svg';
        return { url, width: 48, height: 48, anchorY: 24 };
      },
      sizeUnits: 'pixels',
      getSize: 24
    });

    const lineLayer = new GeoJsonLayer({
      id: 'telraam-lines',
      data: { type: 'FeatureCollection', features: linesRaw },
      pickable: true,
      lineWidthUnits: 'pixels',
      getLineWidth: 3,
      getLineColor: (f) => {
        const p = f && f.properties ? f.properties : {};
        const total = (p.bike || 0) + (p.car || 0) + (p.heavy || 0) + (p.pedestrian || 0);
        return colorScale(total);
      },
      onClick: (info) => {
        if (!info || !info.object) return hidePopup();
        const p = info.object.properties || {};
        showPopup(info.x, info.y, fullPropsHtml(p));
      }
    });

    const tunnelsLayer = new ScatterplotLayer({
      id: 'tunnel-devices',
      data: points,
      pickable: true,
      getPosition: (d) => [d.lon, d.lat],
      getFillColor: (d) => colorScale((d.properties && d.properties.hourlyCount) || 0),
      radiusUnits: 'pixels',
      getRadius: 8,
      onClick: (info) => {
        if (!info || !info.object) return hidePopup();
        const p = info.object.properties || {};
        showPopup(info.x, info.y, fullPropsHtml(p));
      }
    });

    const airLayer = new ScatterplotLayer({
      id: 'air-quality',
      data: points,
      pickable: true,
      getPosition: (d) => [d.lon, d.lat],
      getFillColor: (d) => {
        const v = getByPath(d.properties || {}, 'lastValue.value');
        const num = typeof v === 'number' ? v : 0;
        const t = Math.max(0, Math.min(1, num / 100));
        const r = Math.round(255 * t);
        const g = Math.round(215 * (1 - Math.abs(t - 0.5) * 2));
        const b = Math.round(255 * (1 - t));
        return [r, g, b, 200];
      },
      radiusUnits: 'pixels',
      getRadius: 8,
      onClick: (info) => {
        if (!info || !info.object) return hidePopup();
        const p = info.object.properties || {};
        showPopup(info.x, info.y, fullPropsHtml(p));
      }
    });

    const layers = [osm];

    if (appState.selectedSourceId === 'telraam') {
      if (linesRaw.length) layers.push(lineLayer);
    } else if (appState.selectedSourceId === 'tunnels') {
      if (points.length) layers.push(tunnelsLayer);
    } else if (appState.selectedSourceId === 'air') {
      if (points.length) layers.push(airLayer);
    } else {
      if (points.length) layers.push(iconLayer);
    }

    deckgl.setProps({ layers });
    perf.tickEnd(points.length + linesRaw.length);
    requestAnimationFrame(render);
  }
  deckgl.canvas.addEventListener('click', (e) => { /* rely on layer onClick */ });
  if (popup) popup.addEventListener('click', (e) => e.stopPropagation());
  container.addEventListener('click', (e) => { if (!popup || !popup.contains(e.target)) hidePopup(); });
  requestAnimationFrame(render);
}

async function main() {
  const cfgRes = await fetch('/api/config');
  appState.config = await cfgRes.json();
  appState.selectedSourceId = (SOURCES[0] && SOURCES[0].id) || 'stib';
  selectSource(appState.selectedSourceId);
  renderSources();
  initDeck();
  appState.data.start();
}

main().catch(console.error); 
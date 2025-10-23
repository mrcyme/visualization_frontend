<template>
  <div class="map-container">
    <div ref="mapContainer" class="map"></div>
    <LayerControl 
      :layers="layers" 
      :available-wms-layers="availableWmsLayers"
      :selected-wms-layer="selectedWmsLayer"
      @update-wms-layer="(val) => selectedWmsLayer = val"
      @toggle-layer="toggleLayer"
    />
    
    <!-- Shelter Legend -->
    <div v-if="shelterLayerEnabled" class="shelter-legend">
      <h4>🏠 Shelter Status</h4>
      <div class="legend-content">
        <div class="legend-section">
          <div class="legend-title">Fill Level:</div>
          <div class="legend-gradient">
            <div class="gradient-bar shelter-gradient"></div>
            <div class="gradient-labels">
              <span>Empty</span>
              <span>Full</span>
            </div>
          </div>
        </div>
        <div class="legend-section">
          <div class="legend-title">Capacity:</div>
          <div class="legend-sizes">
            <div class="size-item">
              <div class="size-icon small">🏠</div>
              <span>&lt;100</span>
            </div>
            <div class="size-item">
              <div class="size-icon medium">🏠</div>
              <span>100-500</span>
            </div>
            <div class="size-item">
              <div class="size-icon large">🏠</div>
              <span>&gt;1000</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import mapboxgl from 'mapbox-gl'
import LayerControl from './LayerControl.vue'

const mapContainer = ref(null)
const map = ref(null)
const config = ref(null)
let updateInterval = null
let sheltersDataLoaded = false
let sheltersData = null
let camerasDataLoaded = false
let camerasData = null
let emergencyTripsData = null
let emergencyAnimationInterval = null
let emergencyCurrentStep = 0
let policeTripsData = null
let policeAnimationInterval = null
let policeCurrentStep = 0

// Computed property to check if shelter layer is enabled
const shelterLayerEnabled = computed(() => {
  const shelterLayer = layers.value.find(l => l.id === 'shelters')
  return shelterLayer ? shelterLayer.enabled : false
})

// WMS state
const availableWmsLayers = ref([])
const selectedWmsLayer = ref('TRUE_COLOR')
const wmsBaseUrl = 'https://sh.dataspace.copernicus.eu/ogc/wms/84d42b1c-6281-499b-a2f2-a2320455b80b'
const wmsLayerEnabled = computed(() => {
  const wms = layers.value.find(l => l.id === 'wms')
  return wms ? wms.enabled : false
})

const layers = ref([
  {
    id: 'traffic',
    name: 'Traffic',
    icon: '🚦',
    enabled: false,
    type: 'mapbox-traffic'
  },
  {
    id: 'wms',
    name: 'Satellite (WMS)',
    icon: '🛰️',
    enabled: false,
    type: 'raster'
  },
  {
    id: 'telraam',
    name: 'Telraam Traffic Counters',
    icon: '📊',
    enabled: false,
    type: 'geojson'
  },
  {
    id: 'stib',
    name: 'STIB (Metro/Bus/Tram)',
    icon: '🚇',
    enabled: false,
    type: 'geojson'
  },
  {
    id: 'sncb',
    name: 'SNCB (Trains)',
    icon: '🚆',
    enabled: false,
    type: 'geojson'
  },
  {
    id: 'emergency',
    name: 'Emergency Vehicles',
    icon: '🚑',
    enabled: false,
    type: 'geojson'
  },
  {
    id: 'police',
    name: 'Police Vehicles',
    icon: '🚓',
    enabled: false,
    type: 'geojson'
  },
  {
    id: 'shelters',
    name: 'Shelters',
    icon: '🏠',
    enabled: false,
    type: 'geojson'
  },
  {
    id: 'cameras',
    name: 'Traffic Cameras',
    icon: '📷',
    enabled: false,
    type: 'geojson'
  }
])

// STIB Line Type Mapping
const metroLines = ['1', '2', '3', '4', '5', '6', '7']
const tramLines = ['3', '4', '5', '7', '8', '9', '15', '18', '19', '25', '32', '51', '55', '81', '82', '92', '97']
// All other lines are buses

function getVehicleType(lineId) {
  if (!lineId) return 'bus'
  const lineStr = String(lineId)
  if (metroLines.includes(lineStr)) return 'metro'
  if (tramLines.includes(lineStr)) return 'tram'
  return 'bus'
}

// Generate random status: 85% on-time, 10% a-bit-late, 5% late
function getRandomStatus() {
  const random = Math.random()
  if (random < 0.85) return 'on-time'
  if (random < 0.95) return 'a-bit-late'
  return 'late'
}

onMounted(async () => {
  await loadConfig()
  initMap()
  startAutoUpdate()
})

onUnmounted(() => {
  if (updateInterval) {
    clearInterval(updateInterval)
  }
  if (emergencyAnimationInterval) {
    clearInterval(emergencyAnimationInterval)
  }
  if (policeAnimationInterval) {
    clearInterval(policeAnimationInterval)
  }
  if (map.value) {
    map.value.remove()
  }
})

async function loadConfig() {
  try {
    const response = await fetch('/api/config')
    config.value = await response.json()
    mapboxgl.accessToken = config.value.mapboxToken
  } catch (error) {
    console.error('Failed to load config:', error)
  }
}

function initMap() {
  map.value = new mapboxgl.Map({
    container: mapContainer.value,
    style: 'mapbox://styles/mapbox/light-v11',
    center: [4.3517, 50.8503], // Brussels center
    zoom: 11,
    pitch: 0,
    bearing: 0
  })

  map.value.addControl(new mapboxgl.NavigationControl(), 'top-right')
  map.value.addControl(new mapboxgl.FullscreenControl(), 'top-right')

  map.value.on('load', () => {
    loadMapIcons()
    setupLayers()
    preloadData()
  })
}

async function loadMapIcons() {
  // Load transport icons as SDF for recoloring based on status
  const sdfIcons = ['metro', 'tram', 'bus', 'train']
  
  for (const icon of sdfIcons) {
    try {
      const img = new Image(32, 32)
      img.src = `/icons/${icon}.svg`
      await new Promise((resolve, reject) => {
        img.onload = () => {
          if (!map.value.hasImage(icon)) {
            map.value.addImage(icon, img, { sdf: true })
          }
          resolve()
        }
        img.onerror = reject
      })
    } catch (error) {
      console.error(`Failed to load icon: ${icon}`, error)
    }
  }
  
  // Load camera icon (not SDF)
  try {
    const img = new Image(32, 32)
    img.src = '/icons/camera.svg'
    await new Promise((resolve, reject) => {
      img.onload = () => {
        if (!map.value.hasImage('camera')) {
          map.value.addImage('camera', img)
        }
        resolve()
      }
      img.onerror = reject
    })
  } catch (error) {
    console.error('Failed to load camera icon:', error)
  }
  
  // Load home icon as SDF for recoloring
  try {
    const img = new Image(32, 32)
    img.src = '/icons/home.svg'
    await new Promise((resolve, reject) => {
      img.onload = () => {
        if (!map.value.hasImage('home')) {
          map.value.addImage('home', img, { sdf: true })
        }
        resolve()
      }
      img.onerror = reject
    })
  } catch (error) {
    console.error('Failed to load home icon:', error)
  }
  
  // Load ambulance icon (not SDF)
  try {
    const img = new Image(32, 32)
    img.src = '/icons/ambulance.svg'
    await new Promise((resolve, reject) => {
      img.onload = () => {
        if (!map.value.hasImage('ambulance')) {
          map.value.addImage('ambulance', img)
        }
        resolve()
      }
      img.onerror = reject
    })
  } catch (error) {
    console.error('Failed to load ambulance icon:', error)
  }
  
  // Load police icon as SDF for recoloring
  try {
    const img = new Image(32, 32)
    img.src = '/icons/ambulance.svg'
    await new Promise((resolve, reject) => {
      img.onload = () => {
        if (!map.value.hasImage('police')) {
          map.value.addImage('police', img)
        }
        resolve()
      }
      img.onerror = reject
    })
  } catch (error) {
    console.error('Failed to load police icon:', error)
  }
}

function setupLayers() {
  // Add sources for each layer
  map.value.addSource('stib-source', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: []
    }
  })

  map.value.addSource('sncb-source', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: []
    }
  })

  map.value.addSource('emergency-source', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: []
    }
  })

  map.value.addSource('police-source', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: []
    }
  })

  map.value.addSource('shelters-source', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: []
    }
  })

  map.value.addSource('cameras-source', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: []
    }
  })

  map.value.addSource('telraam-source', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: []
    }
  })

  // WMS raster source (initially pointing to selected layer)
  map.value.addSource('wms-source', {
    type: 'raster',
    tiles: [
      `${wmsBaseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${selectedWmsLayer.value}&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`
    ],
    tileSize: 256
  })

  // Add STIB layer with icons
  map.value.addLayer({
    id: 'stib-layer',
    type: 'symbol',
    source: 'stib-source',
    layout: {
      visibility: 'none',
      'icon-image': ['get', 'vehicleType'],
      'icon-size': 0.8,
      'icon-allow-overlap': true,
      'icon-ignore-placement': false
    },
    paint: {
      'icon-color': [
        'match',
        ['get', 'status'],
        'on-time', '#00ff00',     // Green for on time
        'a-bit-late', '#ff8c00',  // Orange for a bit late
        'late', '#ff0000',        // Red for late
        '#00ff00'                 // Default to green
      ]
    }
  })

  // Add SNCB layer with train icons
  map.value.addLayer({
    id: 'sncb-layer',
    type: 'symbol',
    source: 'sncb-source',
    layout: {
      visibility: 'none',
      'icon-image': 'train',
      'icon-size': 0.9,
      'icon-allow-overlap': true,
      'icon-ignore-placement': false
    },
    paint: {
      'icon-color': [
        'match',
        ['get', 'status'],
        'on-time', '#00ff00',     // Green for on time
        'a-bit-late', '#ff8c00',  // Orange for a bit late
        'late', '#ff0000',        // Red for late
        '#00ff00'                 // Default to green
      ]
    }
  })

  // Add emergency vehicles layer with ambulance icons
  map.value.addLayer({
    id: 'emergency-layer',
    type: 'symbol',
    source: 'emergency-source',
    layout: {
      visibility: 'none',
      'icon-image': 'ambulance',
      'icon-size': 0.6,
      'icon-allow-overlap': true
    }
  })

  // Add police vehicles layer with police icons
  map.value.addLayer({
    id: 'police-layer',
    type: 'symbol',
    source: 'police-source',
    layout: {
      visibility: 'none',
      'icon-image': 'police',
      'icon-size': 0.6,
      'icon-allow-overlap': true
    }
  })

  // Add shelters layer with home icons colored by fill_level (green to purple) and sized by capacity
  map.value.addLayer({
    id: 'shelters-layer',
    type: 'symbol',
    source: 'shelters-source',
    layout: {
      visibility: 'none',
      'icon-image': 'home',
      'icon-size': [
        'interpolate',
        ['linear'],
        ['coalesce', ['to-number', ['get', 'Capacité']], 0],
        0, 0.6,        // Small shelters
        100, 0.8,
        300, 1.0,
        500, 1.4,
        1000, 1.8,     // Large shelters
        2000, 2.5
      ],
      'icon-allow-overlap': true,
      'icon-ignore-placement': false
    },
    paint: {
      'icon-color': [
        'interpolate',
        ['linear'],
        ['get', 'fill_level'],
        0, '#00ff00',      // Green when empty (0% full)
        0.25, '#40e0d0',   // Turquoise
        0.5, '#4169e1',    // Royal blue
        0.75, '#8b00ff',   // Violet
        1, '#9400d3'       // Purple when completely full
      ],
      'icon-opacity': 0.9
    }
  })

  // Add cameras layer with camera icons
  map.value.addLayer({
    id: 'cameras-layer',
    type: 'symbol',
    source: 'cameras-source',
    layout: {
      visibility: 'none',
      'icon-image': 'camera',
      'icon-size': 1.0,
      'icon-allow-overlap': true,
      'icon-ignore-placement': false
    },
    paint: {
      'icon-opacity': 0.9
    }
  })

  // Add telraam traffic counter layer (lines colored by traffic count)
  map.value.addLayer({
    id: 'telraam-layer',
    type: 'line',
    source: 'telraam-source',
    layout: {
      visibility: 'none',
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': [
        'interpolate',
        ['linear'],
        ['+', 
          ['coalesce', ['get', 'bike'], 0],
          ['coalesce', ['get', 'car'], 0],
          ['coalesce', ['get', 'heavy'], 0],
          ['coalesce', ['get', 'pedestrian'], 0]
        ],
        0, '#00d7ff',      // Low traffic: cyan
        250, '#00ff00',    // 
        500, '#7fff00',    // 
        750, '#ffd700',    // Medium traffic: yellow
        1000, '#ff8c00',   // 
        1500, '#ff4500',   // 
        2000, '#ff0000'    // High traffic: red
      ],
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        10, 2,
        14, 4,
        18, 8
      ],
      'line-opacity': 0.8
    }
  })

  // Add WMS raster layer (above basemap, below symbols)
  map.value.addLayer({
    id: 'wms-layer',
    type: 'raster',
    source: 'wms-source',
    layout: {
      visibility: 'none'
    },
    paint: {
      'raster-opacity': 1.0
    }
  }, 'stib-layer')

  // Add popups
  addPopupHandlers()
}

// Preload static and initial dynamic data to avoid flicker on first toggle
async function preloadData() {
  try {
    // Preload static datasets
    await Promise.all([
      updateSheltersData(),
      updateCamerasData(),
      fetchWmsCapabilities()
    ])

    // Preload first snapshots of dynamic datasets
    await Promise.all([
      updateSTIBData(),
      updateSNCBData(),
      updateTelraamData()
    ])
  } catch (e) {
    // Best-effort preload; errors are logged inside update functions
  }
}

// Fetch WMS capabilities and populate available layers list
async function fetchWmsCapabilities() {
  try {
    console.log('Fetching WMS capabilities...');
    const url = `${wmsBaseUrl}?SERVICE=WMS&REQUEST=GetCapabilities`;
    const res = await fetch(url);
    
    if (!res.ok) {
      console.error('WMS fetch failed:', res.status, res.statusText);
      return;
    }
    
    const text = await res.text();
    console.log('WMS response received, parsing...');
    
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'application/xml');
    
    // Check for parse errors
    const parseError = xml.querySelector('parsererror');
    if (parseError) {
      console.error('XML parse error:', parseError.textContent);
      return;
    }
    
    const layers = Array.from(xml.getElementsByTagName('Layer'));
    console.log(`Found ${layers.length} layer elements`);
    
    const names = [];
    for (const lyr of layers) {
      const nameEl = lyr.getElementsByTagName('Name')[0];
      const titleEl = lyr.getElementsByTagName('Title')[0];
      if (nameEl && titleEl) {
        const name = nameEl.textContent || '';
        const title = titleEl.textContent || name;
        // skip the root layer with no Name
        if (name.trim().length > 0) names.push({ name, title });
      }
    }
    
    console.log(`Extracted ${names.length} named layers`);
    
    // Deduplicate by name
    const seen = new Set();
    availableWmsLayers.value = names.filter(n => {
      if (seen.has(n.name)) return false;
      seen.add(n.name); return true;
    });
    
    console.log(`After deduplication: ${availableWmsLayers.value.length} layers`, availableWmsLayers.value.map(l => l.name));
    
    // Ensure selected layer is valid
    if (!availableWmsLayers.value.find(l => l.name === selectedWmsLayer.value) && availableWmsLayers.value.length) {
      selectedWmsLayer.value = availableWmsLayers.value.find(l => l.name === 'TRUE_COLOR')?.name || availableWmsLayers.value[0].name;
      console.log('Selected WMS layer:', selectedWmsLayer.value);
    }
  } catch (e) {
    console.error('Failed to fetch WMS capabilities:', e);
  }
}

// Update WMS tiles when selection changes
watch(selectedWmsLayer, (newName) => {
  if (!map.value) return;
  const src = map.value.getSource('wms-source');
  if (!src) return;
  const tiles = [`${wmsBaseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${encodeURIComponent(newName)}&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`];
  try {
    src.setTiles(tiles);
  } catch {
    // Some Mapbox versions don't have setTiles; recreate source
    try {
      if (map.value.getLayer('wms-layer')) map.value.removeLayer('wms-layer');
      map.value.removeSource('wms-source');
    } catch {}
    map.value.addSource('wms-source', { type: 'raster', tiles, tileSize: 256 });
    map.value.addLayer({ id: 'wms-layer', type: 'raster', source: 'wms-source', layout: { visibility: 'none' }, paint: { 'raster-opacity': 1.0 } }, 'stib-layer');
  }
});

function addPopupHandlers() {
  const layerIds = ['stib-layer', 'sncb-layer', 'emergency-layer', 'police-layer', 'shelters-layer']
  
  layerIds.forEach(layerId => {
    map.value.on('click', layerId, (e) => {
      const coordinates = e.features[0].geometry.coordinates.slice()
      const properties = e.features[0].properties
      
      let description = '<div style="padding: 10px;">'
      Object.keys(properties).forEach(key => {
        description += `<strong>${key}:</strong> ${properties[key]}<br>`
      })
      description += '</div>'

      new mapboxgl.Popup()
        .setLngLat(coordinates)
        .setHTML(description)
        .addTo(map.value)
    })

    map.value.on('mouseenter', layerId, () => {
      map.value.getCanvas().style.cursor = 'pointer'
    })

    map.value.on('mouseleave', layerId, () => {
      map.value.getCanvas().style.cursor = ''
    })
  })

  // Special handler for cameras with image display
  map.value.on('click', 'cameras-layer', (e) => {
    const coordinates = e.features[0].geometry.coordinates.slice()
    const properties = e.features[0].properties
    
    let description = `
      <div style="padding: 10px; max-width: 300px;">
        <img src="${properties.src}" 
             alt="Camera View" 
             style="width: 100%; height: auto; border-radius: 8px; margin-bottom: 10px;"
             onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23ddd%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3EImage not available%3C/text%3E%3C/svg%3E';" />
        <div style="font-size: 12px;">
          <strong>Status:</strong> ${properties.active ? '🟢 Active' : '🔴 Inactive'}<br>
          <strong>Time:</strong> ${properties.time}<br>
        </div>
      </div>
    `

    new mapboxgl.Popup({ maxWidth: '320px' })
      .setLngLat(coordinates)
      .setHTML(description)
      .addTo(map.value)
  })

  map.value.on('mouseenter', 'cameras-layer', () => {
    map.value.getCanvas().style.cursor = 'pointer'
  })

  map.value.on('mouseleave', 'cameras-layer', () => {
    map.value.getCanvas().style.cursor = ''
  })

  // Special handler for telraam traffic lines
  map.value.on('click', 'telraam-layer', (e) => {
    const coordinates = e.lngLat
    const properties = e.features[0].properties
    
    const bike = properties.bike || 0
    const car = properties.car || 0
    const heavy = properties.heavy || 0
    const pedestrian = properties.pedestrian || 0
    const total = bike + car + heavy + pedestrian
    
    let description = `
      <div style="padding: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">🚦 Traffic Counter</h3>
        <div style="font-size: 13px; line-height: 1.6;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <strong>🚴 Bikes:</strong> <span>${bike}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <strong>🚗 Cars:</strong> <span>${car}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <strong>🚚 Heavy Vehicles:</strong> <span>${heavy}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <strong>🚶 Pedestrians:</strong> <span>${pedestrian}</span>
          </div>
          <hr style="border: none; border-top: 1px solid #eee; margin: 10px 0;"/>
          <div style="display: flex; justify-content: space-between; font-weight: 600; font-size: 14px;">
            <strong>📊 Total:</strong> <span>${total}</span>
          </div>
        </div>
      </div>
    `

    new mapboxgl.Popup()
      .setLngLat(coordinates)
      .setHTML(description)
      .addTo(map.value)
  })

  map.value.on('mouseenter', 'telraam-layer', () => {
    map.value.getCanvas().style.cursor = 'pointer'
  })

  map.value.on('mouseleave', 'telraam-layer', () => {
    map.value.getCanvas().style.cursor = ''
  })
}

async function toggleLayer(layerId) {
  const layer = layers.value.find(l => l.id === layerId)
  if (!layer) return

  layer.enabled = !layer.enabled

  if (layerId === 'traffic') {
    toggleTrafficLayer(layer.enabled)
  } else {
    const visibility = layer.enabled ? 'visible' : 'none'
    
    if (layerId === 'telraam') {
      map.value.setLayoutProperty('telraam-layer', 'visibility', visibility)
      if (layer.enabled) await updateTelraamData()
    } else if (layerId === 'wms') {
      map.value.setLayoutProperty('wms-layer', 'visibility', visibility)
    } else if (layerId === 'stib') {
      map.value.setLayoutProperty('stib-layer', 'visibility', visibility)
      if (layer.enabled) await updateSTIBData()
    } else if (layerId === 'sncb') {
      map.value.setLayoutProperty('sncb-layer', 'visibility', visibility)
      if (layer.enabled) await updateSNCBData()
    } else if (layerId === 'emergency') {
      map.value.setLayoutProperty('emergency-layer', 'visibility', visibility)
      if (layer.enabled) {
        await updateEmergencyData()
      } else {
        stopEmergencyAnimation()
      }
    } else if (layerId === 'police') {
      map.value.setLayoutProperty('police-layer', 'visibility', visibility)
      if (layer.enabled) {
        await updatePoliceData()
      } else {
        stopPoliceAnimation()
      }
    } else if (layerId === 'shelters') {
      map.value.setLayoutProperty('shelters-layer', 'visibility', visibility)
      if (layer.enabled) await updateSheltersData()
    } else if (layerId === 'cameras') {
      map.value.setLayoutProperty('cameras-layer', 'visibility', visibility)
      if (layer.enabled) await updateCamerasData()
    }
  }
}

function toggleTrafficLayer(enabled) {
  if (enabled) {
    if (!map.value.getLayer('traffic')) {
      map.value.addLayer({
        id: 'traffic',
        type: 'line',
        source: {
          type: 'vector',
          url: 'mapbox://mapbox.mapbox-traffic-v1'
        },
        'source-layer': 'traffic',
        paint: {
          'line-width': 2,
          'line-color': [
            'case',
            ['==', ['get', 'congestion'], 'low'], '#00ff00',
            ['==', ['get', 'congestion'], 'moderate'], '#ffff00',
            ['==', ['get', 'congestion'], 'heavy'], '#ff8c00',
            ['==', ['get', 'congestion'], 'severe'], '#ff0000',
            '#ffffff'
          ]
        }
      })
    } else {
      map.value.setLayoutProperty('traffic', 'visibility', 'visible')
    }
  } else {
    if (map.value.getLayer('traffic')) {
      map.value.setLayoutProperty('traffic', 'visibility', 'none')
    }
  }
}

async function updateSTIBData() {
  try {
    const response = await fetch('/api/vehicle-position')
    const data = await response.json()
    
    // Check if data is already in GeoJSON format
    if (data.type === 'FeatureCollection' && data.features) {
      // Add vehicleType and status to each feature based on lineId
      const enrichedData = {
        ...data,
        features: data.features.map(feature => ({
          ...feature,
          properties: {
            ...feature.properties,
            vehicleType: getVehicleType(feature.properties.lineId),
            status: getRandomStatus()  // 85% on-time, 10% a-bit-late, 5% late
          }
        }))
      }
      map.value.getSource('stib-source').setData(enrichedData)
      console.log(`Loaded ${enrichedData.features.length} STIB vehicles`)
    } else if (data.entity) {
      // Handle GTFS-RT format
      const features = (data.entity || []).map(entity => {
        const position = entity.vehicle?.position
        if (!position) return null
        
        const lineId = entity.vehicle?.trip?.route_id || entity.vehicle?.vehicle?.label
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [position.longitude, position.latitude]
          },
          properties: {
            id: entity.id,
            lineId: lineId,
            type: entity.vehicle?.vehicle?.label || 'unknown',
            vehicleType: getVehicleType(lineId),
            status: getRandomStatus(),  // 85% on-time, 10% a-bit-late, 5% late
            speed: position.speed || 0,
            bearing: position.bearing || 0
          }
        }
      }).filter(f => f !== null)

      map.value.getSource('stib-source').setData({
        type: 'FeatureCollection',
        features
      })
      console.log(`Loaded ${features.length} STIB vehicles`)
    }
  } catch (error) {
    console.error('Failed to update STIB data:', error)
  }
}

async function updateSNCBData() {
  try {
    const response = await fetch('/api/sncb/vehicle-position')
    const data = await response.json()
    
    // Check if data is already in GeoJSON format
    if (data.type === 'FeatureCollection' && data.features) {
      // Add status to each feature
      const enrichedData = {
        ...data,
        features: data.features.map(feature => ({
          ...feature,
          properties: {
            ...feature.properties,
            status: getRandomStatus()  // 85% on-time, 10% a-bit-late, 5% late
          }
        }))
      }
      map.value.getSource('sncb-source').setData(enrichedData)
      console.log(`Loaded ${enrichedData.features.length} SNCB vehicles`)
    } else if (data.entity) {
      // Handle GTFS-RT format
      const features = (data.entity || []).map(entity => {
        const position = entity.vehicle?.position
        if (!position) return null
        
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [position.longitude, position.latitude]
          },
          properties: {
            id: entity.id,
            trip_id: entity.vehicle?.trip?.trip_id || 'unknown',
            speed: position.speed || 0,
            status: getRandomStatus()  // 85% on-time, 10% a-bit-late, 5% late
          }
        }
      }).filter(f => f !== null)

      map.value.getSource('sncb-source').setData({
        type: 'FeatureCollection',
        features
      })
      console.log(`Loaded ${features.length} SNCB vehicles`)
    }
  } catch (error) {
    console.error('Failed to update SNCB data:', error)
  }
}

async function updateEmergencyData() {
  try {
    // Load trips data if not already loaded
    if (!emergencyTripsData) {
      const response = await fetch('/emergency_vehicule/trips.json')
      emergencyTripsData = await response.json()
      console.log(`Loaded ${emergencyTripsData.trips.length} emergency vehicle trips`)
    }
    
    // Reset animation step
    emergencyCurrentStep = 0
    
    // Start animation
    startEmergencyAnimation()
  } catch (error) {
    console.error('Failed to update emergency data:', error)
  }
}

function startEmergencyAnimation() {
  // Clear any existing interval
  stopEmergencyAnimation()
  
  // Initial render
  updateEmergencyPositions()
  
  // Update every 1 second
  emergencyAnimationInterval = setInterval(() => {
    emergencyCurrentStep++
    updateEmergencyPositions()
  }, 1000)
}

function stopEmergencyAnimation() {
  if (emergencyAnimationInterval) {
    clearInterval(emergencyAnimationInterval)
    emergencyAnimationInterval = null
  }
}

function updateEmergencyPositions() {
  if (!emergencyTripsData) return
  
  const currentPositions = []
  
  emergencyTripsData.trips.forEach(trip => {
    const pathLength = trip.path.length
    if (pathLength === 0) return
    
    // Get current position (loop through path)
    const stepIndex = emergencyCurrentStep % pathLength
    const currentPoint = trip.path[stepIndex]
    
    // Add current position
    currentPositions.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [currentPoint[0], currentPoint[1]] // [longitude, latitude]
      },
      properties: {
        id: trip.id,
        type: 'ambulance',
        speed: currentPoint[3],
        heading: currentPoint[5],
        timestamp: currentPoint[2]
      }
    })
  })
  
  // Update map source
    map.value.getSource('emergency-source').setData({
      type: 'FeatureCollection',
    features: currentPositions
    })
}

async function updatePoliceData() {
  try {
    // Load trips data if not already loaded
    if (!policeTripsData) {
      const response = await fetch('/police/trips.json')
      policeTripsData = await response.json()
      console.log(`Loaded ${policeTripsData.trips.length} police vehicle trips`)
    }
    
    // Reset animation step
    policeCurrentStep = 0
    
    // Start animation
    startPoliceAnimation()
  } catch (error) {
    console.error('Failed to update police data:', error)
  }
}

function startPoliceAnimation() {
  // Clear any existing interval
  stopPoliceAnimation()
  
  // Initial render
  updatePolicePositions()
  
  // Update every 1 second
  policeAnimationInterval = setInterval(() => {
    policeCurrentStep++
    updatePolicePositions()
  }, 1000)
}

function stopPoliceAnimation() {
  if (policeAnimationInterval) {
    clearInterval(policeAnimationInterval)
    policeAnimationInterval = null
  }
}

function updatePolicePositions() {
  if (!policeTripsData) return
  
  const currentPositions = []
  
  policeTripsData.trips.forEach(trip => {
    const pathLength = trip.path.length
    if (pathLength === 0) return
    
    // Get current position (loop through path)
    const stepIndex = policeCurrentStep % pathLength
    const currentPoint = trip.path[stepIndex]
    
    // Add current position
    currentPositions.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [currentPoint[0], currentPoint[1]] // [longitude, latitude]
      },
      properties: {
        id: trip.id,
        type: 'police',
        speed: currentPoint[3],
        heading: currentPoint[5],
        timestamp: currentPoint[2]
      }
    })
  })
  
  // Update map source
    map.value.getSource('police-source').setData({
      type: 'FeatureCollection',
    features: currentPositions
    })
}

async function updateSheltersData() {
  try {
    // Only load the data once, then cache it
    if (!sheltersDataLoaded) {
      const response = await fetch('/shelter/CA-CH_combined_lonlat.geojson')
      sheltersData = await response.json()
      sheltersDataLoaded = true
      console.log(`Loaded ${sheltersData.features?.length || 0} shelters`)
    }
    
    // Always set the data (even if already loaded) to ensure it's visible
    if (sheltersData) {
      map.value.getSource('shelters-source').setData(sheltersData)
    }
  } catch (error) {
    console.error('Failed to update shelters data:', error)
  }
}

async function updateCamerasData() {
  try {
    // Only load the data once, then cache it
    if (!camerasDataLoaded) {
      const response = await fetch('/camera/camera.geojson')
      camerasData = await response.json()
      camerasDataLoaded = true
      console.log(`Loaded ${camerasData.features?.length || 0} cameras`)
    }
    
    // Always set the data (even if already loaded) to ensure it's visible
    if (camerasData) {
      map.value.getSource('cameras-source').setData(camerasData)
    }
  } catch (error) {
    console.error('Failed to update cameras data:', error)
  }
}

async function updateTelraamData() {
  try {
    const response = await fetch('/api/traffic/telraam')
    const data = await response.json()
    
    // Check if data is in GeoJSON format
    if (data.type === 'FeatureCollection' && data.features) {
      map.value.getSource('telraam-source').setData(data)
      console.log(`Loaded ${data.features.length} telraam traffic segments`)
    } else {
      console.warn('Unexpected telraam data format:', data)
    }
  } catch (error) {
    console.error('Failed to update telraam data:', error)
  }
}

function startAutoUpdate() {
  updateInterval = setInterval(async () => {
    const enabledLayers = layers.value.filter(l => l.enabled)
    for (const layer of enabledLayers) {
      if (layer.id === 'stib') await updateSTIBData()
      if (layer.id === 'sncb') await updateSNCBData()
      if (layer.id === 'telraam') await updateTelraamData()
      // Emergency and police vehicles use their own animation intervals (1 second updates)
    }
  }, 5000) // Update every 5 seconds
}
</script>

<style scoped>
.map-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.map {
  width: 100%;
  height: 100%;
}

.shelter-legend {
  position: absolute;
  bottom: 20px;
  right: 20px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  padding: 16px 20px;
  z-index: 10;
  min-width: 240px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}

.shelter-legend h4 {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.legend-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.legend-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legend-title {
  font-size: 13px;
  font-weight: 600;
  color: #555;
}

.legend-gradient {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gradient-bar {
  height: 12px;
  border-radius: 6px;
  border: 1px solid #ddd;
}

.shelter-gradient {
  background: linear-gradient(to right, 
    #00ff00 0%,      /* Green */
    #40e0d0 25%,     /* Turquoise */
    #4169e1 50%,     /* Royal blue */
    #8b00ff 75%,     /* Violet */
    #9400d3 100%     /* Purple */
  );
}

.gradient-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #666;
}

.legend-sizes {
  display: flex;
  justify-content: space-around;
  align-items: center;
  gap: 8px;
}

.size-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #666;
}

.size-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.size-icon.small {
  font-size: 16px;
}

.size-icon.medium {
  font-size: 24px;
}

.size-icon.large {
  font-size: 32px;
}

@media (max-width: 768px) {
  .shelter-legend {
    bottom: 10px;
    right: 10px;
    left: 10px;
    min-width: unset;
  }
}
</style>



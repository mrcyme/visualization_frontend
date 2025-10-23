const express = require('express');
const compression = require('compression');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 4002;

app.use(compression());
app.use(cors());
app.use(express.json());

// Config endpoint
app.get('/api/config', (req, res) => {
  res.json({
    mapboxToken: process.env.MAPBOX_TOKEN || '',
    cesiumIonToken: process.env.CESIUM_ION_TOKEN || '',
    hasMobilityToken: Boolean(process.env.MTB_API_TOKEN)
  });
});

// STIB vehicle positions (metro, bus, tram)
app.get('/api/vehicle-position', async (req, res) => {
  try {
    if (!process.env.MTB_API_TOKEN) {
      return res.status(401).json({ error: 'Missing MTB_API_TOKEN' });
    }
    const timestamp = req.query.timestamp;
    const url = new URL('https://api.mobilitytwin.brussels/stib/vehicle-position');
    if (timestamp) {
      url.searchParams.set('timestamp', String(timestamp));
    }
    const response = await axios.get(url.toString(), {
      headers: {
        Authorization: `Bearer ${process.env.MTB_API_TOKEN}`,
        Accept: 'application/json'
      },
      timeout: 15000
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: 'Upstream fetch failed' });
    }
  }
});

// SNCB train positions
app.get('/api/sncb/vehicle-position', async (req, res) => {
  try {
    if (!process.env.MTB_API_TOKEN) {
      return res.status(401).json({ error: 'Missing MTB_API_TOKEN' });
    }
    const { timestamp, start_timestamp, end_timestamp, limit, offset } = req.query;
    const url = new URL('https://api.mobilitytwin.brussels/sncb/vehicle-position');
    if (timestamp) url.searchParams.set('timestamp', String(timestamp));
    if (start_timestamp) url.searchParams.set('start_timestamp', String(start_timestamp));
    if (end_timestamp) url.searchParams.set('end_timestamp', String(end_timestamp));
    if (limit) url.searchParams.set('limit', String(limit));
    if (offset) url.searchParams.set('offset', String(offset));
    const response = await axios.get(url.toString(), {
      headers: {
        Authorization: `Bearer ${process.env.MTB_API_TOKEN}`,
        Accept: 'application/json'
      },
      timeout: 20000
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: 'Upstream fetch failed' });
    }
  }
});

// Telraam traffic counters
app.get('/api/traffic/telraam', async (req, res) => {
  try {
    if (!process.env.MTB_API_TOKEN) {
      return res.status(401).json({ error: 'Missing MTB_API_TOKEN' });
    }
    const { timestamp } = req.query;
    const url = new URL('https://api.mobilitytwin.brussels/traffic/telraam');
    if (timestamp) url.searchParams.set('timestamp', String(timestamp));
    const response = await axios.get(url.toString(), {
      headers: {
        Authorization: `Bearer ${process.env.MTB_API_TOKEN}`,
        Accept: 'application/json'
      },
      timeout: 20000
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: 'Upstream fetch failed' });
    }
  }
});

// Mock emergency vehicles endpoint
app.get('/api/emergency-vehicles', (req, res) => {
  // Generate mock emergency vehicle positions around Brussels
  const brusselsCenter = { lat: 50.8503, lng: 4.3517 };
  const vehicles = [];
  
  for (let i = 0; i < 8; i++) {
    const offsetLat = (Math.random() - 0.5) * 0.1;
    const offsetLng = (Math.random() - 0.5) * 0.1;
    vehicles.push({
      id: `emergency_${i}`,
      type: ['ambulance', 'fire_truck'][Math.floor(Math.random() * 2)],
      latitude: brusselsCenter.lat + offsetLat,
      longitude: brusselsCenter.lng + offsetLng,
      heading: Math.floor(Math.random() * 360),
      speed: Math.floor(Math.random() * 80) + 20,
      status: ['active', 'responding'][Math.floor(Math.random() * 2)],
      timestamp: new Date().toISOString()
    });
  }
  
  res.json({ vehicles, timestamp: new Date().toISOString() });
});

// Mock police vehicles endpoint
app.get('/api/police-vehicles', (req, res) => {
  // Generate mock police vehicle positions around Brussels
  const brusselsCenter = { lat: 50.8503, lng: 4.3517 };
  const vehicles = [];
  
  for (let i = 0; i < 12; i++) {
    const offsetLat = (Math.random() - 0.5) * 0.15;
    const offsetLng = (Math.random() - 0.5) * 0.15;
    vehicles.push({
      id: `police_${i}`,
      type: 'police',
      latitude: brusselsCenter.lat + offsetLat,
      longitude: brusselsCenter.lng + offsetLng,
      heading: Math.floor(Math.random() * 360),
      speed: Math.floor(Math.random() * 60) + 10,
      status: ['patrol', 'responding', 'stationary'][Math.floor(Math.random() * 3)],
      timestamp: new Date().toISOString()
    });
  }
  
  res.json({ vehicles, timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📍 Mapbox Token: ${process.env.MAPBOX_TOKEN ? '✓' : '✗'}`);
  console.log(`📍 MTB API Token: ${process.env.MTB_API_TOKEN ? '✓' : '✗'}`);
});




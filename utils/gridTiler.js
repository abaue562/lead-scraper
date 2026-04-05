'use strict';

/**
 * GPS Grid Tiler — Breaks a geographic area into coordinate cells.
 *
 * WHY THIS EXISTS:
 * Google Maps search returns a maximum of 120 results per query (20 per page × 6 pages).
 * To scrape ALL businesses in a city, you split the city into a grid of smaller areas
 * and run a separate search query for each cell. This is exactly how tools like
 * omkarcloud/google-maps-scraper achieve "unlimited" results.
 *
 * HOW IT WORKS:
 * 1. Get the bounding box for a city (from a geocoding API or predefined bounds)
 * 2. Divide it into N×N grid cells (e.g., 0.05° × 0.05°, ~5km squares)
 * 3. Each cell becomes a search with coordinates @lat,lng
 * 4. Merge + deduplicate results across all cells
 *
 * CELL SIZE GUIDE:
 *   Dense urban (Manhattan, Chicago downtown): 0.01° ~1.1km
 *   Mid-size city (Austin, Nashville):         0.05° ~5.5km
 *   Suburb / spread-out city:                  0.1°  ~11km
 *   Rural area:                                0.25° ~27km
 *
 * EXAMPLE:
 *   Austin, TX bounding box ≈ 0.5° × 0.5° lat/lng
 *   With 0.05° cells → 10×10 = 100 grid cells
 *   100 cells × 120 results = 12,000 max businesses per category
 */

const axios  = require('axios');
const logger = require('../utils/logger');

// ── Known city bounding boxes (fallback when geocoding unavailable) ───────────
// Format: [minLat, maxLat, minLng, maxLng]
const CITY_BOUNDS = {
  'austin, tx':       [30.098, 30.517, -97.938, -97.570],
  'austin':           [30.098, 30.517, -97.938, -97.570],
  'miami, fl':        [25.709, 25.855, -80.320, -80.118],
  'miami':            [25.709, 25.855, -80.320, -80.118],
  'new york, ny':     [40.477, 40.917, -74.259, -73.700],
  'new york':         [40.477, 40.917, -74.259, -73.700],
  'los angeles, ca':  [33.703, 34.337, -118.668, -118.155],
  'los angeles':      [33.703, 34.337, -118.668, -118.155],
  'chicago, il':      [41.644, 42.023, -87.940, -87.524],
  'chicago':          [41.644, 42.023, -87.940, -87.524],
  'houston, tx':      [29.524, 30.110, -95.789, -95.015],
  'houston':          [29.524, 30.110, -95.789, -95.015],
  'dallas, tx':       [32.617, 33.016, -97.015, -96.462],
  'dallas':           [32.617, 33.016, -97.015, -96.462],
  'phoenix, az':      [33.290, 33.812, -112.324, -111.926],
  'phoenix':          [33.290, 33.812, -112.324, -111.926],
  'philadelphia, pa': [39.867, 40.138, -75.280, -74.956],
  'san antonio, tx':  [29.270, 29.700, -98.624, -98.234],
  'san diego, ca':    [32.530, 32.970, -117.282, -116.908],
  'nashville, tn':    [36.004, 36.402, -87.052, -86.516],
  'denver, co':       [39.614, 39.914, -105.110, -104.600],
  'portland, or':     [45.432, 45.653, -122.836, -122.472],
  'seattle, wa':      [47.496, 47.734, -122.459, -122.224],
  'atlanta, ga':      [33.647, 33.888, -84.551, -84.289],
  'charlotte, nc':    [35.033, 35.359, -80.960, -80.669],
  'las vegas, nv':    [36.004, 36.372, -115.373, -115.063],
  'orlando, fl':      [28.342, 28.680, -81.560, -81.234],
  'tampa, fl':        [27.870, 28.170, -82.650, -82.260],
  'raleigh, nc':      [35.721, 35.905, -78.820, -78.546],
  'minneapolis, mn':  [44.890, 45.050, -93.330, -93.193],
  'aiken, sc':        [33.505, 33.630, -81.800, -81.680],
};

// ── Core functions ─────────────────────────────────────────────────────────────

/**
 * Generate a grid of { lat, lng } center points covering a bounding box.
 *
 * @param {[number, number, number, number]} bounds - [minLat, maxLat, minLng, maxLng]
 * @param {number} cellSize - degrees (0.05 = ~5km)
 * @returns Array of { lat, lng } cell centers
 */
function boundsToGrid(bounds, cellSize = 0.05) {
  const [minLat, maxLat, minLng, maxLng] = bounds;
  const cells = [];

  let lat = minLat + cellSize / 2;
  while (lat <= maxLat) {
    let lng = minLng + cellSize / 2;
    while (lng <= maxLng) {
      cells.push({
        lat: Math.round(lat * 10000) / 10000,
        lng: Math.round(lng * 10000) / 10000,
      });
      lng += cellSize;
    }
    lat += cellSize;
  }

  return cells;
}

/**
 * Look up bounds for a city string.
 * Tries predefined lookup first, then optionally queries Nominatim (free geocoding).
 *
 * @param {string} location - e.g. "Austin, TX" or "78701"
 * @param {boolean} fallbackToNominatim - use OpenStreetMap geocoding if not in lookup
 * @returns {[number, number, number, number] | null} bounds or null
 */
async function getBoundsForLocation(location, fallbackToNominatim = true) {
  const key = location.toLowerCase().trim();

  // Predefined lookup
  if (CITY_BOUNDS[key]) {
    logger.debug(`[Grid] Using predefined bounds for "${location}"`);
    return CITY_BOUNDS[key];
  }

  // Try partial match (e.g. "Austin" matches "austin, tx")
  for (const [name, bounds] of Object.entries(CITY_BOUNDS)) {
    if (name.startsWith(key) || key.startsWith(name.split(',')[0])) {
      logger.debug(`[Grid] Partial match "${name}" for "${location}"`);
      return bounds;
    }
  }

  // Nominatim fallback (free, no API key, rate-limited to 1 req/sec)
  if (fallbackToNominatim) {
    return nominatimLookup(location);
  }

  return null;
}

async function nominatimLookup(location) {
  try {
    logger.debug(`[Grid] Looking up bounds via Nominatim for "${location}"`);
    const resp = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q:              location,
        format:         'json',
        limit:          1,
        addressdetails: 1,
      },
      headers: {
        'User-Agent': 'LeadGen-Scraper/2.0 (research tool)',
      },
      timeout: 8000,
    });

    if (!resp.data?.length) return null;
    const r = resp.data[0];

    // Nominatim returns bounding box as [minLat, maxLat, minLng, maxLng]
    const bb = r.boundingbox;
    if (!bb || bb.length < 4) return null;

    const bounds = [
      parseFloat(bb[0]),
      parseFloat(bb[1]),
      parseFloat(bb[2]),
      parseFloat(bb[3]),
    ];

    logger.info(`[Grid] Nominatim bounds for "${location}": ${bounds}`);
    return bounds;

  } catch (err) {
    logger.warn(`[Grid] Nominatim lookup failed: ${err.message}`);
    return null;
  }
}

/**
 * Build a full grid plan for a location + category sweep.
 *
 * @param {string} location
 * @param {string} category
 * @param {object} options
 *   cellSize    - degrees per cell (default 0.05 ~5km)
 *   maxCells    - cap total cells (default 200)
 *
 * @returns {{ cells: Array<{lat,lng}>, totalCells: number, estimatedMax: number }}
 */
async function buildGridPlan(location, category, options = {}) {
  const {
    cellSize = 0.05,
    maxCells = 200,
  } = options;

  const bounds = await getBoundsForLocation(location);

  if (!bounds) {
    logger.warn(`[Grid] No bounds found for "${location}" — using single-point search`);
    return {
      cells:        [null],   // null means use location string, not coordinates
      totalCells:   1,
      estimatedMax: 120,
      bounds:       null,
    };
  }

  const allCells = boundsToGrid(bounds, cellSize);
  const cells    = allCells.slice(0, maxCells);

  const est = cells.length * 120;
  logger.info(`[Grid] "${location}" → ${cells.length} cells (${cellSize}° each), ~${est} max results`);

  return {
    cells,
    totalCells:   cells.length,
    estimatedMax: est,
    bounds,
  };
}

/**
 * Convert a grid plan into BullMQ job payloads.
 * One job per cell, each with coordinates.
 */
function gridToJobs(cells, category, location, source, options = {}) {
  const { maxResultsPerCell = 20, maxReviews = 0, region } = options;

  return cells.map(cell => ({
    type:       source,
    location,
    category,
    maxResults: maxResultsPerCell,
    maxReviews,
    region,
    coordinates: cell,   // null for single-point fallback
  }));
}

/**
 * Deduplication helper for grid results.
 * Uses place name + phone + address as composite key.
 */
function deduplicateGridResults(leads) {
  const seen = new Map();
  for (const lead of leads) {
    const phone  = (lead.phone || '').replace(/\D/g, '');
    const key    = phone.length >= 7
      ? phone
      : (lead.name + lead.address).toLowerCase().replace(/\s+/g, '');
    if (!seen.has(key)) {
      seen.set(key, lead);
    } else {
      // Merge missing fields from duplicate
      const existing = seen.get(key);
      for (const f of ['phone', 'email', 'website', 'hours', 'rating', 'review_count']) {
        if (!existing[f] && lead[f]) existing[f] = lead[f];
      }
    }
  }
  return [...seen.values()];
}

// ── Throughput estimator ──────────────────────────────────────────────────────

function estimateThroughput(workerCount, concurrency, avgRequestMs = 5000) {
  const parallelJobs   = workerCount * concurrency;
  const requestsPerSec = parallelJobs / (avgRequestMs / 1000);
  const requestsPerHr  = Math.round(requestsPerSec * 3600);
  return { parallelJobs, requestsPerHr };
}

module.exports = {
  boundsToGrid,
  getBoundsForLocation,
  buildGridPlan,
  gridToJobs,
  deduplicateGridResults,
  estimateThroughput,
  CITY_BOUNDS,
};

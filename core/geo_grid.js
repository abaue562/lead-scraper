'use strict';

/**
 * GeoGrid
 *
 * Divides city bounding boxes into lat/lng grid cells so each cell can be
 * searched independently on Google Maps. This breaks the "always returns the
 * same top 20" problem by biasing each search to a specific geographic area.
 *
 * Usage:
 *   const GeoGrid = require('./geo_grid');
 *   const cells = GeoGrid.generateCells('Vancouver, BC', 2.5);
 *   const url   = GeoGrid.cellToMapsUrl(cells[0], 'plumber');
 */

// ── Bounding boxes ─────────────────────────────────────────────────────────────
// Format: { minLat, maxLat, minLng, maxLng }

const CITY_BOUNDS = {
  // BC
  'Kelowna, BC':       { minLat: 49.84, maxLat: 49.94, minLng: -119.56, maxLng: -119.38 },
  'Vancouver, BC':     { minLat: 49.19, maxLat: 49.32, minLng: -123.27, maxLng: -122.98 },
  'Surrey, BC':        { minLat: 49.00, maxLat: 49.20, minLng: -122.87, maxLng: -122.68 },
  'Burnaby, BC':       { minLat: 49.20, maxLat: 49.29, minLng: -123.03, maxLng: -122.87 },
  'Richmond, BC':      { minLat: 49.10, maxLat: 49.22, minLng: -123.22, maxLng: -123.06 },
  'Abbotsford, BC':    { minLat: 49.00, maxLat: 49.10, minLng: -122.42, maxLng: -122.18 },
  'Coquitlam, BC':     { minLat: 49.20, maxLat: 49.33, minLng: -122.84, maxLng: -122.68 },
  'Langley, BC':       { minLat: 49.08, maxLat: 49.18, minLng: -122.70, maxLng: -122.52 },
  'Kamloops, BC':      { minLat: 50.60, maxLat: 50.74, minLng: -120.48, maxLng: -120.24 },
  'Vernon, BC':        { minLat: 50.22, maxLat: 50.34, minLng: -119.36, maxLng: -119.22 },
  'Penticton, BC':     { minLat: 49.44, maxLat: 49.53, minLng: -119.64, maxLng: -119.54 },
  'Prince George, BC': { minLat: 53.84, maxLat: 53.96, minLng: -122.87, maxLng: -122.70 },
  'Nanaimo, BC':       { minLat: 49.10, maxLat: 49.22, minLng: -124.04, maxLng: -123.90 },
  'Victoria, BC':      { minLat: 48.40, maxLat: 48.50, minLng: -123.50, maxLng: -123.32 },
  'Chilliwack, BC':    { minLat: 49.12, maxLat: 49.22, minLng: -122.00, maxLng: -121.88 },

  // Alberta
  'Calgary, AB':       { minLat: 50.84, maxLat: 51.20, minLng: -114.32, maxLng: -113.88 },
  'Edmonton, AB':      { minLat: 53.40, maxLat: 53.70, minLng: -113.74, maxLng: -113.32 },
  'Red Deer, AB':      { minLat: 52.22, maxLat: 52.33, minLng: -113.88, maxLng: -113.74 },
  'Lethbridge, AB':    { minLat: 49.64, maxLat: 49.77, minLng: -112.92, maxLng: -112.76 },
  'Medicine Hat, AB':  { minLat: 50.00, maxLat: 50.09, minLng: -110.75, maxLng: -110.62 },

  // Ontario
  'Toronto, ON':       { minLat: 43.58, maxLat: 43.86, minLng: -79.64,  maxLng: -79.12  },
  'Ottawa, ON':        { minLat: 45.25, maxLat: 45.50, minLng: -75.92,  maxLng: -75.55  },
  'Mississauga, ON':   { minLat: 43.46, maxLat: 43.64, minLng: -79.83,  maxLng: -79.55  },
  'Brampton, ON':      { minLat: 43.62, maxLat: 43.78, minLng: -79.86,  maxLng: -79.63  },
  'Hamilton, ON':      { minLat: 43.20, maxLat: 43.32, minLng: -80.05,  maxLng: -79.72  },
  'London, ON':        { minLat: 42.92, maxLat: 43.04, minLng: -81.36,  maxLng: -81.12  },
  'Markham, ON':       { minLat: 43.82, maxLat: 43.94, minLng: -79.42,  maxLng: -79.22  },
  'Vaughan, ON':       { minLat: 43.76, maxLat: 43.88, minLng: -79.68,  maxLng: -79.48  },
  'Kitchener, ON':     { minLat: 43.38, maxLat: 43.48, minLng: -80.57,  maxLng: -80.42  },
  'Windsor, ON':       { minLat: 42.26, maxLat: 42.36, minLng: -83.13,  maxLng: -82.92  },
};

// ── Core functions ─────────────────────────────────────────────────────────────

/**
 * Divide a city bounding box into a grid of lat/lng cells.
 *
 * @param {string} cityName
 * @param {number} cellSizeKm - size of each cell in km (default 2.5)
 * @returns {Array<{ key, city, lat, lng, latDelta, lngDelta, zoom }>}
 */
function generateCells(cityName, cellSizeKm = 2.5) {
  const bounds = CITY_BOUNDS[cityName];

  // Fallback: city has no bounding box — return a single pseudo-cell
  if (!bounds) {
    return [{
      key:      cityName,
      city:     cityName,
      lat:      null,
      lng:      null,
      latDelta: null,
      lngDelta: null,
      zoom:     14,
    }];
  }

  const { minLat, maxLat, minLng, maxLng } = bounds;
  const midLat = (minLat + maxLat) / 2;

  // Convert km to degrees
  const latDelta = cellSizeKm / 111;
  const lngDelta = cellSizeKm / (111 * Math.cos(midLat * Math.PI / 180));

  const cells = [];

  // Walk from minLat to maxLat in latDelta steps
  for (let lat = minLat + latDelta / 2; lat < maxLat; lat += latDelta) {
    // Walk from minLng to maxLng in lngDelta steps
    for (let lng = minLng + lngDelta / 2; lng < maxLng; lng += lngDelta) {
      const roundedLat = Math.round(lat * 10000) / 10000;
      const roundedLng = Math.round(lng * 10000) / 10000;

      cells.push({
        key:      `${roundedLat}:${roundedLng}`,
        city:     cityName,
        lat:      roundedLat,
        lng:      roundedLng,
        latDelta,
        lngDelta,
        zoom:     14,
      });
    }
  }

  return cells;
}

/**
 * Build a Google Maps search URL for a specific grid cell + category.
 *
 * @param {object} cell - from generateCells()
 * @param {string} category - e.g. "plumber"
 * @returns {string} URL
 */
function cellToMapsUrl(cell, category) {
  if (cell.lat != null && cell.lng != null) {
    return `https://www.google.com/maps/search/${encodeURIComponent(category)}/@${cell.lat},${cell.lng},${cell.zoom}z/`;
  }
  // Fallback: city-name-only cell
  return `https://www.google.com/maps/search/${encodeURIComponent(category + ' near ' + cell.city)}/`;
}

/**
 * Returns cell count for a city without generating the full array.
 *
 * @param {string} cityName
 * @param {number} cellSizeKm
 * @returns {{ city, totalCells, cellSizeKm }}
 */
function cityStats(cityName, cellSizeKm = 2.5) {
  const cells = generateCells(cityName, cellSizeKm);
  return {
    city:       cityName,
    totalCells: cells.length,
    cellSizeKm,
  };
}

/**
 * Returns true if the city has a defined bounding box.
 *
 * @param {string} cityName
 * @returns {boolean}
 */
function hasBounds(cityName) {
  return Object.prototype.hasOwnProperty.call(CITY_BOUNDS, cityName);
}

module.exports = {
  CITY_BOUNDS,
  generateCells,
  cellToMapsUrl,
  cityStats,
  hasBounds,
};

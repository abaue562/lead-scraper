'use strict';
require('dotenv').config();
const { searchGoogleMaps } = require('./scrapers/googleMaps');

async function run() {
  console.log('Testing Google Maps scraper for "plumber" in "Vancouver, BC"...');
  try {
    const result = await searchGoogleMaps({
      location: 'Vancouver, BC',
      category: 'plumber',
      maxResults: 5,
      maxReviews: 0,
    });
    console.log('leads found:', result.leads.length);
    if (result.leads.length > 0) {
      console.log('Sample:', JSON.stringify(result.leads[0], null, 2));
    }
  } catch (e) {
    console.error('ERROR:', e.message);
    console.error(e.stack);
  }
  process.exit(0);
}

run();

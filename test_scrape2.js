'use strict';
require('dotenv').config();
const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

  const url = 'https://www.google.com/maps/search/plumber+near+Vancouver+BC';
  console.log('Navigating to:', url);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const title = await page.title();
    const pageUrl = page.url();
    const html = await page.content();

    console.log('Title:', title);
    console.log('URL:', pageUrl);
    console.log('Page length:', html.length);

    // Check for captcha / consent / block signals
    if (html.includes('consent') || html.includes('CONSENT')) console.log('>> CONSENT PAGE detected');
    if (html.includes('captcha') || html.includes('CAPTCHA')) console.log('>> CAPTCHA detected');
    if (html.includes('unusual traffic')) console.log('>> UNUSUAL TRAFFIC block detected');
    if (html.includes('Our systems have detected')) console.log('>> GOOGLE BOT BLOCK detected');

    // Check for listing elements
    const listings = await page.$$('[role="article"]');
    const feedItems = await page.$$('a[href*="/maps/place/"]');
    console.log('Role=article elements:', listings.length);
    console.log('Maps place links:', feedItems.length);

    // Save a snippet of the HTML
    console.log('\nHTML snippet (first 500 chars of body):');
    console.log(html.substring(html.indexOf('<body'), html.indexOf('<body') + 500));

  } catch (e) {
    console.error('Error:', e.message);
  }

  await browser.close();
  process.exit(0);
}

run();

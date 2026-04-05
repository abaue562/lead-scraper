'use strict';

const userAgents = require('./userAgents');

// ── Viewport pool — common real screen resolutions ──────────────────────────
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1680, height: 1050 },
  { width: 1536, height: 864  },
  { width: 1440, height: 900  },
  { width: 1366, height: 768  },
  { width: 1280, height: 800  },
  { width: 1280, height: 720  },
  { width: 1024, height: 768  },
];

// ── Timezone pool — focus on US markets ─────────────────────────────────────
const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Chicago',
];

// ── Locale pool ─────────────────────────────────────────────────────────────
const LOCALES = ['en-US', 'en-US', 'en-US', 'en-GB', 'en-CA'];

function pick(arr)           { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max)   { return Math.floor(Math.random() * (max - min + 1)) + min; }

/**
 * Return a randomised stealth config for a single request context.
 * Call once per context so it stays consistent within a session.
 */
function getConfig() {
  return {
    userAgent:  pick(userAgents),
    viewport:   pick(VIEWPORTS),
    timezoneId: pick(TIMEZONES),
    locale:     pick(LOCALES),
  };
}

/**
 * Script injected into every page to mask automation fingerprints.
 * Runs before any page JS executes.
 */
const INIT_SCRIPT = `
(function () {
  // ── webdriver ─────────────────────────────────────────────────────────
  try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch {}

  // ── plugins (empty = headless tell) ──────────────────────────────────
  const pluginData = [
    { name: 'Chrome PDF Plugin',  filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    { name: 'Chrome PDF Viewer',  filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
    { name: 'Native Client',      filename: 'internal-nacl-plugin',  description: '' },
  ];
  const fakePlugins = Object.create(PluginArray.prototype);
  pluginData.forEach((d, i) => {
    const p = Object.create(Plugin.prototype);
    Object.defineProperty(p, 'name',        { get: () => d.name });
    Object.defineProperty(p, 'filename',    { get: () => d.filename });
    Object.defineProperty(p, 'description', { get: () => d.description });
    fakePlugins[i] = p;
  });
  Object.defineProperty(fakePlugins, 'length', { get: () => pluginData.length });
  fakePlugins.item = (i) => fakePlugins[i];
  fakePlugins.namedItem = (n) => [...pluginData].find(p => p.name === n) || null;
  Object.defineProperty(navigator, 'plugins', { get: () => fakePlugins });

  // ── languages ────────────────────────────────────────────────────────
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

  // ── hardware fingerprint ──────────────────────────────────────────────
  const cores = [4, 6, 8, 8, 12, 16][Math.floor(Math.random() * 6)];
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => cores });
  const mem   = [4, 8, 8, 16][Math.floor(Math.random() * 4)];
  Object.defineProperty(navigator, 'deviceMemory', { get: () => mem });

  // ── chrome object (missing in headless) ──────────────────────────────
  window.chrome = {
    app:          { isInstalled: false, InstallState: {}, RunningState: {} },
    csi:          function() {},
    loadTimes:    function() {},
    runtime:      {
      OnInstalledReason: {},
      OnRestartRequiredReason: {},
      PlatformArch: {},
      PlatformNaclArch: {},
      PlatformOs: {},
      RequestUpdateCheckStatus: {},
    },
  };

  // ── permissions (headless returns 'denied' for notifications) ────────
  const origQuery = window.navigator.permissions.query.bind(navigator.permissions);
  window.navigator.permissions.query = (params) =>
    params.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : origQuery(params);

  // ── canvas fingerprint noise ──────────────────────────────────────────
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(type, ...args) {
    const ctx = this.getContext('2d');
    if (ctx) {
      const pixel = ctx.getImageData(0, 0, 1, 1);
      pixel.data[0] ^= 1;
      ctx.putImageData(pixel, 0, 0);
    }
    return origToDataURL.call(this, type, ...args);
  };

  // ── WebGL vendor/renderer spoofing ────────────────────────────────────
  const origGetParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(param) {
    if (param === 37445) return 'Intel Inc.';           // VENDOR
    if (param === 37446) return 'Intel Iris OpenGL Engine'; // RENDERER
    return origGetParameter.call(this, param);
  };
  if (typeof WebGL2RenderingContext !== 'undefined') {
    const origGet2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(param) {
      if (param === 37445) return 'Intel Inc.';
      if (param === 37446) return 'Intel Iris OpenGL Engine';
      return origGet2.call(this, param);
    };
  }

  // ── connection object ─────────────────────────────────────────────────
  Object.defineProperty(navigator, 'connection', {
    get: () => ({ rtt: 50, downlink: 10, effectiveType: '4g', saveData: false }),
  });
})();
`;

/**
 * Apply the stealth init script to a browser context.
 * Must be called BEFORE any page.goto() on that context.
 */
async function applyToContext(context) {
  await context.addInitScript(INIT_SCRIPT);
}

/**
 * Apply extra stealth behaviours to a page after navigation.
 */
async function applyToPage(page) {
  // Override navigator at page level as extra insurance
  await page.evaluate(() => {
    try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch {}
  });
}

/**
 * Wait a random amount of milliseconds. Simulates human think time.
 */
async function randomDelay(min = 400, max = 1800) {
  const ms = randInt(min, max);
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Simulate human-like scrolling on a page.
 */
async function humanScroll(page, steps = 3) {
  for (let i = 0; i < steps; i++) {
    const amount = randInt(200, 700);
    await page.evaluate((amt) => window.scrollBy(0, amt), amount);
    await randomDelay(200, 600);
  }
}

/**
 * Move mouse to a random position with jitter to simulate human movement.
 */
async function humanMouseMove(page) {
  const x = randInt(80, 1200);
  const y = randInt(80, 700);
  await page.mouse.move(x, y, { steps: randInt(8, 20) });
}

module.exports = {
  getConfig,
  applyToContext,
  applyToPage,
  randomDelay,
  humanScroll,
  humanMouseMove,
  INIT_SCRIPT,
};

import { useState, useEffect, useRef, useCallback } from "react";

const CATS = [
  // Trades & Home Services
  { id: "dentist", label: "Dentists", icon: "🦷" },
  { id: "plumber", label: "Plumbers", icon: "🔧" },
  { id: "electrician", label: "Electricians", icon: "⚡" },
  { id: "HVAC contractor", label: "HVAC", icon: "❄️" },
  { id: "roofing contractor", label: "Roofers", icon: "🏠" },
  { id: "landscaping", label: "Landscaping", icon: "🌿" },
  { id: "handyman", label: "Handyman", icon: "🪛" },
  { id: "junk removal", label: "Junk Removal", icon: "🗑️" },
  { id: "painter", label: "Painters", icon: "🎨" },
  { id: "tree removal", label: "Tree Removal", icon: "🌲" },
  { id: "stump grinding", label: "Stump Grinding", icon: "🪓" },
  { id: "concrete contractor", label: "Concrete", icon: "🧱" },
  { id: "fence installation", label: "Fence Install", icon: "🪧" },
  { id: "pressure washing", label: "Pressure Wash", icon: "💦" },
  { id: "septic tank service", label: "Septic", icon: "🚽" },
  { id: "well pump repair", label: "Well Pump", icon: "⛽" },
  { id: "gutter installation", label: "Gutters", icon: "🏚️" },
  { id: "garage door repair", label: "Garage Door", icon: "🚪" },
  { id: "appliance repair", label: "Appliance Repair", icon: "🔌" },
  { id: "locksmith", label: "Locksmiths", icon: "🔑" },
  { id: "cleaning service", label: "Cleaning", icon: "🧹" },
  { id: "pest control", label: "Pest Control", icon: "🪲" },
  { id: "pool cleaning", label: "Pool Cleaning", icon: "🏊" },
  { id: "water damage restoration", label: "Water Damage", icon: "🌊" },
  { id: "fire damage restoration", label: "Fire Damage", icon: "🔥" },
  { id: "mold remediation", label: "Mold Removal", icon: "🦠" },
  { id: "demolition contractor", label: "Demolition", icon: "🏗️" },
  { id: "mobile welder", label: "Mobile Welder", icon: "⚙️" },
  { id: "boat lift repair", label: "Boat Lift Repair", icon: "⛵" },
  // Automotive
  { id: "auto repair", label: "Auto Repair", icon: "🚗" },
  { id: "mechanic", label: "Mechanics", icon: "🔩" },
  { id: "mobile mechanic", label: "Mobile Mechanic", icon: "🛻" },
  { id: "mobile car detailer", label: "Car Detailing", icon: "✨" },
  { id: "roadside assistance", label: "Roadside Assist", icon: "🚨" },
  { id: "used tire shop", label: "Used Tires", icon: "🛞" },
  { id: "auto body shop", label: "Auto Body", icon: "🔨" },
  { id: "window tinting", label: "Window Tint", icon: "🪟" },
  // Beauty & Wellness
  { id: "hair salon", label: "Hair Salons", icon: "✂️" },
  { id: "nail salon", label: "Nail Techs", icon: "💅" },
  { id: "barber", label: "Barbers", icon: "💈" },
  { id: "hair braider", label: "Hair Braiders", icon: "🪢" },
  { id: "eyelash technician", label: "Lash Techs", icon: "👁️" },
  { id: "massage therapist", label: "Massage", icon: "💆" },
  { id: "makeup artist", label: "Makeup Artists", icon: "💄" },
  { id: "personal trainer", label: "Personal Trainers", icon: "💪" },
  { id: "gym", label: "Gyms", icon: "🏋️" },
  { id: "med spa", label: "Med Spas", icon: "🧖" },
  { id: "botox clinic", label: "Botox Clinics", icon: "💉" },
  { id: "laser hair removal", label: "Laser Hair", icon: "🔆" },
  { id: "cosmetic injector", label: "Injectors", icon: "🩺" },
  // Events & Media
  { id: "DJ", label: "DJs", icon: "🎧" },
  { id: "party rentals", label: "Party Rentals", icon: "🎉" },
  { id: "bounce house rental", label: "Bounce Houses", icon: "🏠" },
  { id: "photographer", label: "Photographers", icon: "📸" },
  { id: "videographer", label: "Videographers", icon: "🎬" },
  // Rural & Agricultural
  { id: "farrier", label: "Farriers", icon: "🐴" },
  { id: "livestock services", label: "Livestock", icon: "🐄" },
  { id: "land clearing", label: "Land Clearing", icon: "🚜" },
  { id: "firewood delivery", label: "Firewood", icon: "🪵" },
  { id: "gravel delivery", label: "Gravel Delivery", icon: "🪨" },
  // Professional & Other
  { id: "restaurant", label: "Restaurants", icon: "🍽️" },
  { id: "real estate agent", label: "Real Estate", icon: "🏡" },
  { id: "attorney", label: "Attorneys", icon: "⚖️" },
  { id: "accountant", label: "Accountants", icon: "📊" },
  { id: "veterinarian", label: "Vets", icon: "🐾" },
  { id: "dog daycare", label: "Dog Daycare", icon: "🐶" },
  { id: "babysitter", label: "Babysitters", icon: "👶" },
];

const SOURCES = [
  { id: "leads", label: "Multi-Source (All)", note: "GMaps + GSearch + Yelp + YP" },
  { id: "google_maps", label: "Google Maps", note: "Browser, free" },
  { id: "google_search", label: "Google Search", note: "Local pack + websites, free" },
  { id: "yelp", label: "Yelp", note: "Browser, free" },
  { id: "yellow_pages", label: "Yellow Pages", note: "Browser, free" },
  { id: "scrapingdog", label: "Scrapingdog API", note: "Fast, needs key" },
  { id: "serpapi", label: "SerpAPI", note: "Fast, needs key" },
];

const C = {
  bg: "#050709", surface: "#0a0f14", panel: "#0d141c",
  border: "#162030", border2: "#1e3040",
  teal: "#00d4aa", amber: "#f5a623", red: "#ff4757",
  blue: "#4a9eff", green: "#2ecc71", purple: "#c084fc",
  text: "#c8d8e8", muted: "#4a6070", dim: "#7a9aaa",
};

const dl = (content, name, type) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
};

const toCSV = rows => {
  const H = ["Name","Category","Has Website","Phone","Email","Website","Address","Rating","Reviews","Hours","Source","Maps URL"];
  const e = v => `"${(v||"").replace(/"/g,'""')}"`;
  return [H.join(","), ...rows.map(r =>
    [r.name,r.category,r.has_website,r.phone,r.email,r.website,r.address,r.rating,r.review_count,r.hours,r.source,r.maps_url].map(e).join(",")
  )].join("\n");
};

const toTSV = rows => {
  const H = ["Name","Category","Has Website","Phone","Email","Website","Address","Rating","Reviews","Source"];
  return [H.join("\t"), ...rows.map(r =>
    [r.name,r.category,r.has_website,r.phone,r.email,r.website,r.address,r.rating,r.review_count,r.source].join("\t")
  )].join("\n");
};

const genEnv = cfg => `# LeadGen Pro — .env\n# Generated from dashboard\n\nREDIS_URL=redis://localhost:6379\nPORT=3000\n\n# Worker\nWORKER_CONCURRENCY=${cfg.concurrency}\nMAX_RETRIES=${cfg.maxRetries}\nHEADLESS=true\nSCRAPE_TIMEOUT=30000\nBLOCK_RESOURCES=true\n\n# Proxies\nPROXIES=${cfg.proxies.split(/\n+/).filter(Boolean).join(",")}\n\n# ── Free CAPTCHA solvers ──\nFLARE_SOLVERR_URL=${cfg.flareSolverrUrl}\nAUDIO_CAPTCHA_ENABLED=${cfg.enableAudio}\nAUDIO_BACKEND=${cfg.audioBackend}\nNOPECHA_KEY=${cfg.nopechaKey}\n\n# ── Paid CAPTCHA (last resort) ──\nCAPTCHA_SERVICE=${cfg.captchaService}\nCAPTCHA_API_KEY=${cfg.captchaKey}\n\n# ── Paid scraping APIs ──\nSCRAPINGDOG_API_KEY=${cfg.scrapingdog}\nSERPAPI_KEY=${cfg.serpapi}\n\n# ── CRM Integrations ──\nHUBSPOT_TOKEN=${cfg.hubspotToken}\nGHL_API_KEY=${cfg.ghlApiKey}\nGHL_LOCATION_ID=${cfg.ghlLocationId}\n`;

// ── Shared UI pieces ──────────────────────────────────────────────────────────
const Label = ({ children, color }) => (
  <div style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.12em", color: color || C.muted, marginBottom: "5px", textTransform: "uppercase" }}>
    {children}
  </div>
);

const IS = (extra = {}) => ({
  width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: "3px",
  padding: "7px 9px", color: C.text, fontSize: "11px", outline: "none",
  boxSizing: "border-box", fontFamily: "inherit", ...extra,
});

const TinyBtn = ({ onClick, color, children }) => (
  <button onClick={onClick} style={{ fontSize: "10px", color, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
    {children}
  </button>
);

const Toggle = ({ on, onToggle, label, color, compact }) => (
  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
    <div onClick={onToggle} style={{ width: compact ? 28 : 32, height: compact ? 16 : 18, background: on ? color + "33" : "#1a2634", border: `1px solid ${on ? color : "#1e3040"}`, borderRadius: "9px", position: "relative", transition: "all .15s", flexShrink: 0 }}>
      <div style={{ width: compact ? 10 : 12, height: compact ? 10 : 12, background: on ? color : "#4a6070", borderRadius: "50%", position: "absolute", top: 2, left: on ? (compact ? 15 : 17) : 2, transition: "left .15s" }} />
    </div>
    <span style={{ fontSize: compact ? "10px" : "11px", color: on ? color : C.muted }}>{label}</span>
  </label>
);

const ExBtn = ({ onClick, color, text, children }) => (
  <button onClick={onClick} style={{ width: "100%", padding: "7px 10px", background: color, color: text, border: "none", borderRadius: "3px", fontSize: "11px", fontWeight: 600, cursor: "pointer", textAlign: "left", fontFamily: "inherit", letterSpacing: "0.05em" }}>
    {children}
  </button>
);

const MetricCard = ({ title, data, fields }) => (
  <div style={{ padding: "14px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: "4px" }}>
    <div style={{ fontSize: "10px", color: C.muted, letterSpacing: "0.1em", marginBottom: "10px" }}>{title.toUpperCase()}</div>
    {data
      ? fields.map(([k, l, c]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px", fontSize: "12px" }}>
          <span style={{ color: C.muted }}>{l}</span>
          <span style={{ color: c, fontWeight: 700 }}>{data[k] ?? "—"}</span>
        </div>
      ))
      : <div style={{ color: C.muted, fontSize: "11px" }}>No data yet — start a search</div>}
  </div>
);

const ConfigBadge = ({ label, color }) => (
  <div style={{ fontSize: "9px", padding: "2px 7px", background: color + "18", color, border: `1px solid ${color}44`, borderRadius: "3px", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
    {label}
  </div>
);

const EmptyState = ({ apiStatus }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "16px", padding: "40px" }}>
    <div style={{ fontSize: "52px" }}>📡</div>
    {apiStatus === "offline" ? (
      <>
        <div style={{ fontSize: "15px", fontWeight: 700, color: C.red }}>Node.js API Offline</div>
        <div style={{ fontSize: "11px", color: C.muted, textAlign: "center", lineHeight: 1.8 }}>
          Start the scraper system first:<br />
          <span style={{ color: C.teal }}>cd scraper && npm run start:api</span><br />
          <span style={{ color: C.teal }}>npm run start:worker</span><br /><br />
          One-time setup:<br />
          <span style={{ color: C.amber }}>bash scraper/scripts/setup.sh</span>
        </div>
      </>
    ) : (
      <>
        <div style={{ fontSize: "15px", fontWeight: 700, color: C.muted }}>Ready to scan</div>
        <div style={{ fontSize: "12px", color: C.muted, textAlign: "center", maxWidth: "360px", lineHeight: 1.7 }}>
          Enter a location, select business types, pick a source, and hit SCAN.<br />
          Use the <span style={{ color: C.teal }}>⚙</span> button to add API keys, proxies, and CAPTCHA settings.
        </div>
      </>
    )}
  </div>
);

// ── Settings Drawer ───────────────────────────────────────────────────────────
function SettingsDrawer({ open, onClose, cfg, onChange, apiUrl, onApply }) {
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [proxyTestMsg, setProxyTestMsg] = useState(null);

  const apply = async () => {
    setApplying(true);
    await onApply();
    setApplying(false);
    setApplied(true);
    setTimeout(() => setApplied(false), 2500);
  };

  const testProxies = async () => {
    const count = cfg.proxies.split(/\n+/).filter(Boolean).length;
    if (!count) { setProxyTestMsg({ msg: "No proxies entered", color: C.red }); return; }
    setProxyTestMsg({ msg: `Testing ${count} proxies…`, color: C.amber });
    try {
      const r = await fetch(`${apiUrl}/proxies`).then(r => r.json());
      setProxyTestMsg({ msg: `${r.total || count} loaded, ${r.active || "??"} healthy`, color: C.green });
    } catch {
      setProxyTestMsg({ msg: "API offline — proxies will apply on next start", color: C.amber });
    }
  };

  const proxyCount = cfg.proxies.split(/\n+/).filter(Boolean).length;

  const parallelJobs = cfg.concurrency;
  const rph = Math.round(parallelJobs * 3600 / Math.max(cfg.requestDelay / 1000, 3));
  const per10k = Math.round(10000 / (rph / 60));

  if (!open) return null;

  const SecTitle = ({ children, icon }) => (
    <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em", color: C.teal, borderBottom: `1px solid ${C.border}`, paddingBottom: "7px", marginBottom: "13px", display: "flex", alignItems: "center", gap: "7px" }}>
      <span>{icon}</span> {children}
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 100 }} />

      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "420px",
        background: C.panel, borderLeft: `2px solid ${C.border2}`,
        zIndex: 101, display: "flex", flexDirection: "column",
        boxShadow: "-8px 0 40px rgba(0,0,0,0.6)",
        animation: "slideIn .18s ease-out",
      }}>

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, background: C.surface }}>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: C.text, letterSpacing: "0.1em" }}>⚙ CONFIGURATION</div>
            <div style={{ fontSize: "9px", color: C.muted, marginTop: "3px", letterSpacing: "0.06em" }}>Settings apply to the running server in real-time</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, fontSize: "16px", cursor: "pointer", lineHeight: 1, padding: "6px 10px", borderRadius: "4px", fontFamily: "inherit" }}>✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>

          {/* ── Paid API Keys ── */}
          <section style={{ marginBottom: "26px" }}>
            <SecTitle icon="⚡">PAID API KEYS</SecTitle>

            <div style={{ marginBottom: "12px" }}>
              <Label>Scrapingdog API Key</Label>
              <input type="password" placeholder="sd_xxxxxxxxxxxxxxxxxxxxxxxx"
                value={cfg.scrapingdog} onChange={e => onChange("scrapingdog", e.target.value)}
                style={IS()} />
              <div style={{ fontSize: "9px", color: C.muted, marginTop: "4px", lineHeight: 1.6 }}>
                scrapingdog.com · 1,000 free/month · $0.00033/req · Fastest option
              </div>
            </div>

            <div>
              <Label>SerpAPI Key</Label>
              <input type="password" placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={cfg.serpapi} onChange={e => onChange("serpapi", e.target.value)}
                style={IS()} />
              <div style={{ fontSize: "9px", color: C.muted, marginTop: "4px", lineHeight: 1.6 }}>
                serpapi.com · 100 free/month · $0.0091/req · Supports pagination
              </div>
            </div>
          </section>

          {/* ── CAPTCHA Solver ── */}
          <section style={{ marginBottom: "26px" }}>
            <SecTitle icon="🤖">CAPTCHA SOLVER CHAIN</SecTitle>

            {/* Chain overview */}
            <div style={{ padding: "10px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: "4px", marginBottom: "14px" }}>
              <div style={{ fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "8px" }}>SOLVE ORDER (cheapest first)</div>
              {[
                ["1", "playwright-stealth",  "Always active — prevents most triggers",          C.green,  true ],
                ["2", "FlareSolverr",         "Cloudflare bypass — free local Docker container", C.teal,   cfg.flareSolverrUrl !== "" ],
                ["3", "Audio bypass",         "reCAPTCHA audio + Whisper STT — 100% free",      C.blue,   cfg.enableAudio    ],
                ["4", "NopeCHA",              "Open-source API — 10,000 free solves / month",   C.purple, cfg.nopechaKey !== "" ],
                ["5", "Paid service",         "Last resort — burns credits only if all else fails", C.amber, cfg.captchaKey !== "" ],
              ].map(([n, name, desc, color, active]) => (
                <div key={n} style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "6px", opacity: active ? 1 : 0.4 }}>
                  <div style={{ width: 18, height: 18, background: active ? color + "22" : "transparent", border: `1px solid ${active ? color : C.border}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", color: active ? color : C.muted, flexShrink: 0, marginTop: 1 }}>{n}</div>
                  <div>
                    <div style={{ fontSize: "10px", color: active ? color : C.muted, fontWeight: 600 }}>{name}</div>
                    <div style={{ fontSize: "9px", color: C.muted, lineHeight: 1.5 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* FlareSolverr */}
            <div style={{ marginBottom: "12px" }}>
              <Label color={C.teal}>🐋 FlareSolverr URL</Label>
              <input placeholder="http://localhost:8191"
                value={cfg.flareSolverrUrl} onChange={e => onChange("flareSolverrUrl", e.target.value)}
                style={IS()} />
              <div style={{ fontSize: "9px", color: C.muted, marginTop: "4px", lineHeight: 1.6 }}>
                Run locally: <span style={{ color: C.teal }}>docker run -d -p 8191:8191 flaresolverr/flaresolverr</span><br/>
                github.com/FlareSolverr/FlareSolverr — handles Cloudflare JS challenges for free
              </div>
            </div>

            {/* Audio bypass */}
            <div style={{ marginBottom: "12px", padding: "10px 12px", background: C.blue + "0a", border: `1px solid ${C.blue}33`, borderRadius: "4px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <Label color={C.blue}>🎙 Audio reCAPTCHA Bypass</Label>
                <Toggle on={cfg.enableAudio} onToggle={() => onChange("enableAudio", !cfg.enableAudio)} label="" color={C.blue} compact />
              </div>
              <div style={{ marginBottom: "8px" }}>
                <Label>STT Backend</Label>
                <select value={cfg.audioBackend} onChange={e => onChange("audioBackend", e.target.value)}
                  style={IS({ cursor: "pointer" })}>
                  <option value="auto">Auto-detect (tries Whisper first)</option>
                  <option value="faster-whisper">faster-whisper (recommended — 4x faster)</option>
                  <option value="whisper">openai-whisper (standard)</option>
                  <option value="google">Google STT (needs API key below)</option>
                </select>
              </div>
              <div style={{ fontSize: "9px", color: C.muted, lineHeight: 1.7 }}>
                Install: <span style={{ color: C.blue }}>pip install faster-whisper</span><br/>
                <span style={{ color: C.muted }}>Downloads audio challenge MP3 → transcribes locally → submits answer. ~75% success rate on reCAPTCHA v2.</span>
              </div>
              {cfg.audioBackend === "google" && (
                <div style={{ marginTop: "8px" }}>
                  <Label>Google STT API Key</Label>
                  <input type="password" placeholder="AIza..."
                    value={cfg.googleSttKey || ""} onChange={e => onChange("googleSttKey", e.target.value)}
                    style={IS()} />
                </div>
              )}
            </div>

            {/* NopeCHA */}
            <div style={{ marginBottom: "12px" }}>
              <Label color={C.purple}>🔓 NopeCHA Key (10k free / month)</Label>
              <input type="password" placeholder="nopecha key"
                value={cfg.nopechaKey} onChange={e => onChange("nopechaKey", e.target.value)}
                style={IS()} />
              <div style={{ fontSize: "9px", color: C.muted, marginTop: "4px", lineHeight: 1.6 }}>
                nopecha.com — open-source SDK, generous free tier, $0.0001/req after<br/>
                Handles reCAPTCHA v2/v3, hCaptcha, Turnstile, FunCaptcha
              </div>
            </div>

            {/* Paid fallback */}
            <div style={{ padding: "10px 12px", background: C.amber + "08", border: `1px solid ${C.amber}22`, borderRadius: "4px" }}>
              <Label color={C.amber}>⚠ Paid Fallback (last resort only)</Label>
              <div style={{ marginBottom: "8px" }}>
                <select value={cfg.captchaService} onChange={e => onChange("captchaService", e.target.value)}
                  style={IS({ cursor: "pointer" })}>
                  <option value="capsolver">CapSolver — $0.80 / 1,000 (cheapest)</option>
                  <option value="2captcha">2Captcha — $3.00 / 1,000</option>
                  <option value="anticaptcha">Anti-Captcha — $2.00 / 1,000</option>
                  <option value="deathbycaptcha">DeathByCaptcha — $1.39 / 1,000</option>
                </select>
              </div>
              <input type="password" placeholder="API key — only used if all free methods fail"
                value={cfg.captchaKey} onChange={e => onChange("captchaKey", e.target.value)}
                style={IS()} />
              <div style={{ fontSize: "9px", color: C.muted, marginTop: "4px" }}>
                Credits consumed only when stealth + FlareSolverr + audio + NopeCHA all fail
              </div>
            </div>
          </section>

          {/* ── Proxies ── */}
          <section style={{ marginBottom: "26px" }}>
            <SecTitle icon="🌐">PROXY LIST</SecTitle>

            <Label>One proxy per line</Label>
            <textarea
              value={cfg.proxies}
              onChange={e => onChange("proxies", e.target.value)}
              placeholder={"http://user:pass@host:8080\nhttp://user:pass@host:8081\nsocks5://user:pass@host:1080"}
              rows={6}
              style={{ ...IS(), resize: "vertical", lineHeight: 1.7 }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
              <div>
                <span style={{ fontSize: "10px", color: proxyCount > 0 ? C.green : C.muted }}>{proxyCount} proxies entered</span>
                {proxyTestMsg && <span style={{ fontSize: "10px", color: proxyTestMsg.color, marginLeft: "10px" }}>{proxyTestMsg.msg}</span>}
              </div>
              <button onClick={testProxies}
                style={{ fontSize: "10px", color: C.blue, background: "none", border: `1px solid ${C.border}`, borderRadius: "3px", padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                Test
              </button>
            </div>
            <div style={{ fontSize: "9px", color: C.muted, marginTop: "6px", lineHeight: 1.6 }}>
              Supports HTTP, HTTPS, SOCKS5 · Providers: Geonode, BrightData, Smartproxy, Oxylabs<br />
              Proxies rotate automatically — failed ones are blacklisted for 5 minutes
            </div>
          </section>

          {/* ── Worker Settings ── */}
          <section style={{ marginBottom: "26px" }}>
            <SecTitle icon="⚙">WORKER SETTINGS</SecTitle>

            <div style={{ marginBottom: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                <Label>Concurrency — parallel jobs per worker</Label>
                <span style={{ fontSize: "12px", color: C.teal, fontWeight: 700 }}>{cfg.concurrency}</span>
              </div>
              <input type="range" min={5} max={100} step={5} value={cfg.concurrency}
                onChange={e => onChange("concurrency", +e.target.value)}
                style={{ width: "100%", accentColor: C.teal }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: C.muted, marginTop: "2px" }}>
                <span>5 (safe)</span><span>50 (recommended)</span><span>100 (max)</span>
              </div>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                <Label>Max retries per failed job</Label>
                <span style={{ fontSize: "12px", color: C.amber, fontWeight: 700 }}>{cfg.maxRetries}</span>
              </div>
              <input type="range" min={1} max={5} step={1} value={cfg.maxRetries}
                onChange={e => onChange("maxRetries", +e.target.value)}
                style={{ width: "100%", accentColor: C.amber }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: C.muted, marginTop: "2px" }}>
                <span>1 (fast fail)</span><span>3 (default)</span><span>5</span>
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                <Label>Request delay between pages</Label>
                <span style={{ fontSize: "12px", color: C.blue, fontWeight: 700 }}>{cfg.requestDelay}ms</span>
              </div>
              <input type="range" min={0} max={5000} step={250} value={cfg.requestDelay}
                onChange={e => onChange("requestDelay", +e.target.value)}
                style={{ width: "100%", accentColor: C.blue }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: C.muted, marginTop: "2px" }}>
                <span>0ms (max speed)</span><span>human-like: 2500+</span>
              </div>
            </div>
          </section>

          {/* ── Throughput estimate ── */}
          <div style={{ padding: "14px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: "4px", marginBottom: "6px" }}>
            <div style={{ fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "10px" }}>THROUGHPUT ESTIMATE WITH CURRENT SETTINGS</div>
            {[
              ["Parallel browser sessions", parallelJobs, C.teal],
              ["Estimated requests / hour", rph.toLocaleString(), C.teal],
              ["Time to reach 10k leads", `~${per10k} min`, C.amber],
            ].map(([l, v, c]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px", fontSize: "11px" }}>
                <span style={{ color: C.muted }}>{l}</span>
                <span style={{ color: c, fontWeight: 700 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

          {/* ── CRM Integrations ── */}
          <section style={{ marginBottom: "26px" }}>
            <SecTitle icon="🔗">CRM INTEGRATIONS</SecTitle>

            {/* HubSpot */}
            <div style={{ marginBottom: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <Label color="#ff7a59">HubSpot CRM</Label>
                <span style={{ fontSize: "9px", color: C.muted }}>Free tier available</span>
              </div>
              <input type="password" placeholder="Private App Access Token"
                value={cfg.hubspotToken} onChange={e => onChange("hubspotToken", e.target.value)}
                style={IS()} />
              <div style={{ fontSize: "9px", color: C.muted, marginTop: "4px", lineHeight: 1.6 }}>
                app.hubspot.com → Settings → Integrations → Private Apps<br/>
                Pushes leads as Contacts + Companies with notes and optional Deals
              </div>
            </div>

            {/* GoHighLevel */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <Label color="#00bfff">GoHighLevel</Label>
                <span style={{ fontSize: "9px", color: C.muted }}>Agency CRM</span>
              </div>
              <input type="password" placeholder="GHL API Key"
                value={cfg.ghlApiKey} onChange={e => onChange("ghlApiKey", e.target.value)}
                style={{ ...IS(), marginBottom: "5px" }} />
              <input placeholder="Location / Sub-Account ID"
                value={cfg.ghlLocationId} onChange={e => onChange("ghlLocationId", e.target.value)}
                style={IS()} />
              <div style={{ fontSize: "9px", color: C.muted, marginTop: "4px", lineHeight: 1.6 }}>
                app.gohighlevel.com → Settings → API Keys<br/>
                Pushes leads as Contacts with custom fields, tags, and pipeline opportunities
              </div>
            </div>
          </section>

        {/* Footer */}
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: "8px", flexShrink: 0, background: C.surface }}>

          <button onClick={apply} style={{
            width: "100%", padding: "12px",
            background: applied ? C.green + "22" : C.teal + "22",
            color: applied ? C.green : C.teal,
            border: `1px solid ${applied ? C.green : C.teal}`,
            borderRadius: "4px", fontSize: "12px", fontWeight: 700, cursor: "pointer",
            letterSpacing: "0.12em", fontFamily: "inherit", transition: "all .2s",
          }}>
            {applying ? "APPLYING…" : applied ? "✓ APPLIED TO SERVER" : "▶  APPLY TO SERVER"}
          </button>

          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => dl(genEnv(cfg), ".env", "text/plain")}
              style={{ flex: 1, padding: "9px", background: "#0d1a24", color: C.dim, border: `1px solid ${C.border}`, borderRadius: "3px", fontSize: "10px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              ⬇ Download .env
            </button>
            <button onClick={() => { navigator.clipboard.writeText(genEnv(cfg)); }}
              style={{ flex: 1, padding: "9px", background: "#0d1a24", color: C.dim, border: `1px solid ${C.border}`, borderRadius: "3px", fontSize: "10px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              📋 Copy .env
            </button>
          </div>

          <div style={{ fontSize: "9px", color: C.muted, textAlign: "center", lineHeight: 1.6 }}>
            "Apply" updates the running server live in memory.<br />
            Download .env to persist settings across restarts.
          </div>
        </div>
      </div>
    </>
  );
}

// ── Dedup key — module level so it's available before component mounts ────────
const isRealPhone = raw => {
  // Extract digits only
  const digits = (raw || "").replace(/\D/g, "");
  // Must be 7-15 digits and NOT look like a rating/review count
  // Ratings: "4.5", "4.8 (1,234)" → digits short or start with 1-5 + short
  // Real phones (NA): 10 digits; intl: 7-15
  if (digits.length < 7 || digits.length > 15) return false;
  // If the original string contains "star", "review", "rating" it's not a phone
  const lower = (raw || "").toLowerCase();
  if (/star|review|rating|\bk\b|km/i.test(lower)) return false;
  // Digits < 7 chars after stripping non-digits is caught above
  // Extra guard: real NA numbers are 10 digits; if < 10 and looks like a short number, allow only if has formatting clues
  if (digits.length < 10 && !/[\(\)\-\+\.\s]/.test(raw || "")) return false;
  return true;
};

const dedupKey = l => {
  const phoneRaw = l.phone || "";
  const phone    = isRealPhone(phoneRaw) ? phoneRaw.replace(/\D/g, "").slice(-10) : "";
  const web      = (l.website || "").replace(/^https?:\/\/(www\.)?/, "").split("/")[0].toLowerCase().replace(/\/$/, "");
  const name     = (l.name || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30);
  return phone.length >= 7 ? phone : (web.length > 4 ? web : name);
};

const deduplicateLeads = (arr) => {
  const seen = new Map();
  for (const l of arr) {
    const k = dedupKey(l);
    if (!seen.has(k)) seen.set(k, l);
  }
  return [...seen.values()];
};

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  // Auto-detect API URL: on VPS the API is proxied at /leadscan/api, locally at localhost:3001
  const defaultApiUrl = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : `${window.location.origin}/leadscan/api`;
  const [apiUrl, setApiUrl] = useState(defaultApiUrl);
  const syncApiUrl = defaultApiUrl;
  const [apiStatus, setApiStatus] = useState("checking");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [cfg, setCfg] = useState({
    scrapingdog: "", serpapi: "",
    captchaKey: "", captchaService: "capsolver",
    nopechaKey: "",
    flareSolverrUrl: "http://localhost:8191",
    enableAudio: true,
    audioBackend: "auto",
    googleSttKey: "",
    proxies: "",
    concurrency: 20, maxRetries: 3, requestDelay: 1000,
    hubspotToken: "",
    ghlApiKey: "", ghlLocationId: "",
  });

  const [location, setLocation] = useState("");
  const [selCats, setSelCats] = useState([]);
  const [source, setSource] = useState("leads");
  const [maxResults, setMaxResults] = useState(20);
  const [enableRevs, setEnableRevs] = useState(false);
  const [gridMode, setGridMode] = useState(false);
  const [cellSize, setCellSize] = useState(0.05);
  const [noWebOnly, setNoWebOnly] = useState(false);
  const [filterCountry, setFilterCountry] = useState(""); // "" | "CA" | "US"
  const [filterCity, setFilterCity] = useState("");
  const [filterType, setFilterType] = useState("");
  const [leads, setLeads] = useState(() => {
    try {
      const s = localStorage.getItem("leadgen-leads");
      if (!s) return [];
      const deduped = deduplicateLeads(JSON.parse(s));
      localStorage.setItem("leadgen-leads", JSON.stringify(deduped));
      return deduped;
    } catch { return []; }
  });
  const [reviewers, setReviewers] = useState([]);
  const [activeJobs, setActiveJobs] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [qStats, setQStats] = useState(null);
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState("leads");
  const [filter, setFilter] = useState("");
  const [sortK, setSortK] = useState("name");
  const [sortD, setSortD] = useState("asc");
  const [toast, setToast] = useState("");
  const [copiedCell, setCopiedCell] = useState(null);
  const abortRef = useRef(null);
  const pollRef = useRef(null);

  // ── Persist settings ──────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const saved = await window.storage.get("leadgen-cfg");
        if (saved?.value) setCfg(JSON.parse(saved.value));
      } catch {}
    })();
  }, []);

  const saveCfg = useCallback(async newCfg => {
    try { await window.storage.set("leadgen-cfg", JSON.stringify(newCfg)); } catch {}
  }, []);

  const updateCfg = useCallback((key, val) => {
    setCfg(prev => { const n = { ...prev, [key]: val }; saveCfg(n); return n; });
  }, [saveCfg]);

  // ── API helpers ───────────────────────────────────────────────────────────
  const api = useCallback(async (method, path, body) => {
    const opts = { method, headers: { "Content-Type": "application/json" } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(`${apiUrl}${path}`, opts);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }, [apiUrl]);

  const notify = useCallback(msg => { setToast(msg); setTimeout(() => setToast(""), 3200); }, []);

  const copyCell = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCell(id);
      setTimeout(() => setCopiedCell(null), 1500);
    });
  };

  // ── Apply settings to server ──────────────────────────────────────────────
  const applySettings = useCallback(async () => {
    try {
      await api("POST", "/admin/config", {
        scrapingdog: cfg.scrapingdog,
        serpapi: cfg.serpapi,
        captchaKey: cfg.captchaKey,
        captchaService: cfg.captchaService,
        nopechaKey: cfg.nopechaKey,
        flareSolverrUrl: cfg.flareSolverrUrl,
        enableAudio: cfg.enableAudio,
        audioBackend: cfg.audioBackend,
        proxies: cfg.proxies.split(/\n+/).filter(Boolean).join(","),
        concurrency: cfg.concurrency,
        maxRetries: cfg.maxRetries,
      });
      notify("✓ Settings applied to server");
    } catch {
      notify("⚠ API offline — settings saved locally");
    }
  }, [api, cfg, notify]);

  // ── Health check ──────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(3000) });
        if (mounted) setApiStatus("online");
      } catch { if (mounted) setApiStatus("offline"); }
    };
    check();
    const t = setInterval(check, 8000);
    return () => { mounted = false; clearInterval(t); };
  }, [apiUrl]);

  // ── Auto-sync: pull leads from all background/autorun jobs every 15s ────────
  const lastSyncJobId = useRef(0);
  useEffect(() => {
    const sync = async () => {
      try {
        const r = await fetch(`${syncApiUrl}/leads/recent?limit=200&since=${lastSyncJobId.current}`);
        if (!r.ok) return;
        const data = await r.json();
        if (data.leads?.length) {
          mergeLeads(data.leads);
          lastSyncJobId.current = data.maxJobId;
        }
      } catch {}
    };
    sync();
    const t = setInterval(sync, 15000);
    return () => clearInterval(t);
  }, []);

  // ── Poll metrics ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) return;
    const poll = async () => {
      try {
        const [m, q] = await Promise.all([api("GET", "/metrics"), api("GET", "/queue/stats")]);
        setMetrics(m); setQStats(q);
      } catch {}
    };
    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => clearInterval(pollRef.current);
  }, [running, api]);

  // ── Search ────────────────────────────────────────────────────────────────
  const pollJobSync = async (jobId, signal) => {
    for (let i = 0; i < 150; i++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      await new Promise(r => setTimeout(r, 2000));
      try {
        const job = await api("GET", `/jobs/${jobId}`);
        if (job.state === "completed") return job.result;
        if (job.state === "failed") return null;
      } catch {}
    }
    return null;
  };

  const mergeLeads = (newOnes) => setLeads(prev => {
    const merged = deduplicateLeads([...prev, ...newOnes]);
    try { localStorage.setItem("leadgen-leads", JSON.stringify(merged)); } catch {}
    return merged;
  });

  const clearLeads = () => {
    setLeads([]);
    try { localStorage.removeItem("leadgen-leads"); } catch {}
  };

  const runSearch = async () => {
    if (!location.trim() || !selCats.length) return;
    setRunning(true);
    setReviewers([]); setActiveJobs([]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    for (const cat of selCats) {
      if (ctrl.signal.aborted) break;
      try {
        if (gridMode) {
          const gr = await api("POST", "/grid", { location, category: cat, source, cellSize, maxCells: 100, maxPerCell: maxResults });
          setActiveJobs(prev => [...prev, ...gr.jobIds.slice(0, 5).map(id => ({ id, cat, status: "queued" }))]);
          gr.jobIds.slice(0, 12).forEach(jobId => {
            pollJobSync(jobId, null).then(r => { if (r?.leads?.length) mergeLeads(r.leads); });
          });
          notify(`Grid: ${gr.queued} cells queued for ${cat}`);
        } else {
          const jr = await api("POST", "/leads", { location, category: cat, source, maxResults, maxReviews: enableRevs ? 20 : 0, async: true });
          setActiveJobs(prev => [...prev, { id: jr.jobId, cat, status: "active" }]);
          const result = await pollJobSync(jr.jobId, ctrl.signal);
          if (result) {
            if (result.leads?.length) mergeLeads(result.leads);
            if (result.reviewers?.length) setReviewers(prev => [...prev, ...result.reviewers]);
            setActiveJobs(prev => prev.map(j => j.id === jr.jobId ? { ...j, status: "done", count: result.leads?.length } : j));
          }
        }
      } catch (e) { if (e.name !== "AbortError") console.error(cat, e.message); }
    }
    setRunning(false);
  };

  const stopSearch = () => { abortRef.current?.abort(); setRunning(false); };

  // ── Table ────────────────────────────────────────────────────────────────
  const sortBy = key => { setSortD(key === sortK && sortD === "asc" ? "desc" : "asc"); setSortK(key); };

  // Derive city from address field — take the city portion before the province/state
  const extractCity = l => {
    const addr = l.address || "";
    // Try to match "City, Province" pattern
    const m = addr.match(/,\s*([^,]+),\s*[A-Z]{2}/);
    if (m) return m[1].trim();
    // Fallback: second comma-segment
    const parts = addr.split(",");
    return parts.length >= 2 ? parts[parts.length - 2].trim() : "";
  };

  const allCities = [...new Set(leads.map(extractCity).filter(Boolean))].sort();
  const allTypes  = [...new Set(leads.map(l => l.category).filter(Boolean))].sort();

  const detectCountry = l => {
    const addr = l.address || "";
    const CA_PROVINCES = ["BC","AB","ON","QC","MB","SK","NS","NB","NL","PE","YT","NT","NU"];
    const US_STATES    = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];
    if (l.country) return l.country; // use server-tagged value if present
    const codes = addr.match(/\b([A-Z]{2})\b/g) || [];
    for (const c of codes) {
      if (CA_PROVINCES.includes(c)) return "CA";
      if (US_STATES.includes(c))    return "US";
    }
    return "";
  };

  const caCount = leads.filter(l => detectCountry(l) === "CA").length;
  const usCount = leads.filter(l => detectCountry(l) === "US").length;

  const filteredLeads = leads
    .filter(l => noWebOnly ? l.has_website !== "Yes" : true)
    .filter(l => !filterCountry || detectCountry(l) === filterCountry)
    .filter(l => !filterCity || extractCity(l) === filterCity)
    .filter(l => !filterType || l.category === filterType)
    .filter(l => !filter || [l.name, l.category, l.phone, l.email, l.address].join(" ").toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => {
      const [va, vb] = [a[sortK] || "", b[sortK] || ""];
      return sortD === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });

  const noWebCount = leads.filter(l => l.has_website !== "Yes").length;
  const emailCount = leads.filter(l => l.email).length;
  const phoneCount = leads.filter(l => l.phone).length;
  const proxyCount = cfg.proxies.split(/\n+/).filter(Boolean).length;
  const statusColor = apiStatus === "online" ? C.green : apiStatus === "offline" ? C.red : C.amber;

  return (
    <div style={{ fontFamily: "'DM Mono','Fira Code','Courier New',monospace", background: C.bg, color: C.text, height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── HEADER ── */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border2}`, padding: "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: "20px", fontWeight: 700, letterSpacing: "0.12em", color: C.teal, whiteSpace: "nowrap" }}>
            LEADGEN<span style={{ color: C.amber }}>://</span>PRO
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
            <span style={{ fontSize: "10px", color: statusColor, letterSpacing: "0.1em" }}>{apiStatus === "online" ? "ONLINE" : apiStatus === "offline" ? "OFFLINE" : "…"}</span>
          </div>
          {proxyCount > 0 && <ConfigBadge label={`${proxyCount} proxies`} color={C.green} />}
          {cfg.scrapingdog && <ConfigBadge label="Scrapingdog ✓" color={C.teal} />}
          {cfg.serpapi && <ConfigBadge label="SerpAPI ✓" color={C.teal} />}
          {cfg.captchaKey && <ConfigBadge label={`CAPTCHA: ${cfg.captchaService}`} color={C.amber} />}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "9px", color: C.muted }}>API</span>
            <input value={apiUrl} onChange={e => setApiUrl(e.target.value)}
              style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: "3px", padding: "4px 8px", color: C.dim, fontSize: "10px", width: "180px", outline: "none", fontFamily: "inherit" }} />
          </div>

          {[["LEADS", leads.length, C.teal], ["NO SITE", noWebCount, C.red], ["EMAILS", emailCount, C.green], ["PHONES", phoneCount, C.blue]].map(([l, v, c]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "15px", fontWeight: 700, color: c, lineHeight: 1 }}>{v}</div>
              <div style={{ fontSize: "8px", color: C.muted, letterSpacing: "0.1em", marginTop: "2px" }}>{l}</div>
            </div>
          ))}

          {/* ⚙ Settings button */}
          <button
            onClick={() => setSettingsOpen(o => !o)}
            title="Configuration — API keys, proxies, CAPTCHA, worker settings"
            style={{
              width: "38px", height: "38px",
              background: settingsOpen ? C.teal + "22" : C.panel,
              border: `1px solid ${settingsOpen ? C.teal : C.border2}`,
              borderRadius: "6px", color: settingsOpen ? C.teal : C.muted,
              fontSize: "17px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all .15s",
            }}>
            ⚙
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── LEFT PANEL ── */}
        <div style={{ width: "255px", minWidth: "255px", background: C.panel, borderRight: `1px solid ${C.border}`, padding: "14px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "14px" }}>

          <div>
            <Label>📍 Location</Label>
            <input value={location} onChange={e => setLocation(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !running && runSearch()}
              placeholder="City, State or ZIP"
              style={IS()} />
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "7px" }}>
              <Label>🏢 Business Types</Label>
              <div style={{ display: "flex", gap: "8px" }}>
                <TinyBtn onClick={() => setSelCats(CATS.map(c => c.id))} color={C.teal}>All</TinyBtn>
                <TinyBtn onClick={() => setSelCats([])} color={C.muted}>None</TinyBtn>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {CATS.map(c => {
                const on = selCats.includes(c.id);
                return (
                  <button key={c.id}
                    onClick={() => setSelCats(s => on ? s.filter(x => x !== c.id) : [...s, c.id])}
                    style={{ display: "flex", alignItems: "center", gap: "3px", padding: "3px 6px", background: on ? C.teal + "22" : "transparent", color: on ? C.teal : C.muted, border: `1px solid ${on ? C.teal : C.border}`, borderRadius: "3px", fontSize: "10px", cursor: "pointer", fontFamily: "inherit" }}>
                    <span style={{ fontSize: "11px" }}>{c.icon}</span><span>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>⚡ Source</Label>
            <select value={source} onChange={e => setSource(e.target.value)}
              style={IS({ cursor: "pointer" })}>
              {SOURCES.map(s => <option key={s.id} value={s.id}>{s.label} — {s.note}</option>)}
            </select>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
              <Label>📦 Max / Category</Label>
              <span style={{ fontSize: "11px", color: C.teal, fontWeight: 700 }}>{maxResults}</span>
            </div>
            <input type="range" min={5} max={120} step={5} value={maxResults}
              onChange={e => setMaxResults(+e.target.value)}
              style={{ width: "100%", accentColor: C.teal }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Toggle on={enableRevs} onToggle={() => setEnableRevs(v => !v)} label="Scrape Reviewer Profiles" color={C.amber} />
            <Toggle on={gridMode} onToggle={() => setGridMode(v => !v)} label="City Grid Mode (unlimited)" color={C.blue} />
          </div>

          {gridMode && (
            <div style={{ padding: "10px", background: C.blue + "11", border: `1px solid ${C.blue}33`, borderRadius: "4px" }}>
              <div style={{ fontSize: "10px", color: C.blue, marginBottom: "7px" }}>GRID CELL SIZE</div>
              {[[0.01, "Dense urban ~1km"], [0.05, "Mid-city    ~5km"], [0.10, "Suburbs    ~11km"], [0.25, "Rural      ~27km"]].map(([v, l]) => (
                <label key={v} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", color: cellSize === v ? C.blue : C.muted, cursor: "pointer", marginBottom: "4px" }}>
                  <input type="radio" value={v} checked={cellSize === v} onChange={() => setCellSize(v)} style={{ accentColor: C.blue }} />
                  {l}
                </label>
              ))}
              <div style={{ fontSize: "9px", color: C.muted, marginTop: "6px" }}>100 cells × 120 results = ~12,000 max/category</div>
            </div>
          )}

          {/* Load all leads from server — enriched archive + recent live scans */}
          <button onClick={async () => {
            try {
              notify("Loading leads...");
              // Pull enriched archive
              const r1 = await fetch(`${apiUrl}/leads/enriched`);
              const d1 = r1.ok ? await r1.json() : {};
              const archive = Array.isArray(d1) ? d1 : (d1.leads || []);
              // Pull recent live scan results
              const r2 = await fetch(`${apiUrl}/leads/recent?limit=500`);
              const d2 = r2.ok ? await r2.json() : {};
              const recent = d2.leads || [];
              const all = [...archive, ...recent];
              mergeLeads(all);
              notify(`✓ Loaded ${archive.length} archived + ${recent.length} recent leads`);
            } catch (e) { notify(`⚠ Load failed: ${e.message}`); }
          }} style={{
            width: "100%", padding: "9px",
            background: C.green + "18",
            color: C.green,
            border: `1px solid ${C.green}55`,
            borderRadius: "4px", fontSize: "11px", fontWeight: 700,
            cursor: "pointer", letterSpacing: "0.1em", fontFamily: "inherit",
          }}>
            ⬇ LOAD ALL LEADS ({leads.length > 0 ? `${leads.length} loaded` : "9,630 ready"})
          </button>

          <button onClick={running ? stopSearch : runSearch}
            disabled={!running && (!location.trim() || !selCats.length || apiStatus !== "online")}
            style={{
              width: "100%", padding: "11px",
              background: running ? "#3a0a0a" : apiStatus !== "online" ? C.border : C.teal + "22",
              color: running ? C.red : apiStatus !== "online" ? C.muted : C.teal,
              border: `1px solid ${running ? C.red : apiStatus !== "online" ? C.border : C.teal}`,
              borderRadius: "4px", fontSize: "12px", fontWeight: 700,
              cursor: "pointer", letterSpacing: "0.12em", fontFamily: "inherit",
            }}>
            {running ? "■  ABORT" : apiStatus !== "online" ? "API OFFLINE" : "▶  SCAN"}
          </button>

          {activeJobs.length > 0 && (
            <div>
              <Label>🔄 Job Queue</Label>
              <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                {activeJobs.slice(-7).map((j, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", padding: "3px 6px", background: C.bg, borderRadius: "3px" }}>
                    <span style={{ color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "140px" }}>{j.cat}</span>
                    <span style={{ color: j.status === "done" ? C.green : j.status === "active" ? C.amber : C.muted, flexShrink: 0 }}>
                      {j.status === "done" ? `✓ ${j.count || 0}` : j.status === "active" ? "scanning…" : "queued"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {leads.length > 0 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}>
                <Label>⬇ Export ({filteredLeads.length} rows)</Label>
                <TinyBtn onClick={() => { if (window.confirm("Clear all saved leads?")) clearLeads(); }} color={C.red}>✕ Clear</TinyBtn>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <ExBtn onClick={async () => {
                  try {
                    const r = await api("POST", "/integrations/score", { leads: filteredLeads });
                    setLeads(prev => {
                      const scoreMap = new Map(r.leads.map(l => [l.name + (l.phone||""), l]));
                      return prev.map(l => scoreMap.get(l.name + (l.phone||"")) || l);
                    });
                    notify(`✓ Scored ${r.leads.length} leads — sorted by score`);
                  } catch { notify("⚠ Score failed — is API online?"); }
                }} color="#1a2634" text={C.amber}>⭐ Score &amp; Rank Leads</ExBtn>
                <ExBtn onClick={() => { dl(toCSV(filteredLeads), "leads.csv", "text/csv"); notify("✓ CSV downloaded"); }} color="#052e16" text={C.green}>📄 Export CSV</ExBtn>
                <ExBtn onClick={() => { dl(JSON.stringify(filteredLeads, null, 2), "leads.json", "application/json"); notify("✓ JSON downloaded"); }} color="#1e3a5f" text={C.blue}>{"{}"} Export JSON</ExBtn>
                <ExBtn onClick={() => { navigator.clipboard.writeText(toTSV(filteredLeads)); notify("✓ Copied — paste into Google Sheets"); }} color="#2d1b69" text={C.purple}>📋 Copy for Sheets</ExBtn>
                {cfg.hubspotToken && (
                  <ExBtn onClick={async () => {
                    if (!window.confirm(`Push ${filteredLeads.length} leads to HubSpot?`)) return;
                    try {
                      const r = await api("POST", "/integrations/hubspot", { leads: filteredLeads, accessToken: cfg.hubspotToken });
                      notify(`✓ HubSpot: ${r.stats.created} created, ${r.stats.updated} updated`);
                    } catch { notify("⚠ HubSpot push failed"); }
                  }} color="#ff7a5922" text="#ff7a59">🔗 Push to HubSpot</ExBtn>
                )}
                {cfg.ghlApiKey && cfg.ghlLocationId && (
                  <ExBtn onClick={async () => {
                    if (!window.confirm(`Push ${filteredLeads.length} leads to GoHighLevel?`)) return;
                    try {
                      const r = await api("POST", "/integrations/gohighlevel", { leads: filteredLeads, apiKey: cfg.ghlApiKey, locationId: cfg.ghlLocationId });
                      notify(`✓ GHL: ${r.stats.created} created`);
                    } catch { notify("⚠ GHL push failed"); }
                  }} color="#00bfff22" text="#00bfff">🔗 Push to GoHighLevel</ExBtn>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Tabs */}
          <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "0 16px", display: "flex", alignItems: "center", flexShrink: 0 }}>
            {[["leads", `Leads (${leads.length})`, C.teal], ["reviewers", `Reviewers (${reviewers.length})`, C.amber], ["outreach", "Outreach", C.green], ["monitor", "Monitor", C.blue], ["freight", "🚛 Freight", C.purple]].map(([id, label, color]) => (
              <button key={id} onClick={() => setActiveTab(id)}
                style={{ padding: "12px 15px", background: "transparent", border: "none", borderBottom: `2px solid ${activeTab === id ? color : "transparent"}`, color: activeTab === id ? color : C.muted, fontSize: "11px", cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.06em" }}>
                {label}
              </button>
            ))}
            {activeTab === "leads" && (
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px", padding: "5px 0", flexWrap: "wrap" }}>
                <Toggle on={noWebOnly} onToggle={() => setNoWebOnly(v => !v)} label={`No-Website (${noWebCount})`} color={C.red} compact />

                {/* Country toggle */}
                {[["", "All"], ["CA", `🍁 CA (${caCount})`], ["US", `🦅 US (${usCount})`]].map(([val, label]) => (
                  <button key={val} onClick={() => { setFilterCountry(val); setFilterCity(""); }}
                    style={{ fontSize: "10px", padding: "4px 8px", borderRadius: "3px", cursor: "pointer", fontFamily: "inherit", background: filterCountry === val ? (val === "CA" ? C.teal : val === "US" ? C.red : C.border2) : C.bg, color: filterCountry === val ? C.bg : C.muted, border: `1px solid ${filterCountry === val ? (val === "CA" ? C.teal : val === "US" ? C.red : C.border2) : C.border}` }}>
                    {label}
                  </button>
                ))}

                {/* City filter */}
                <select value={filterCity} onChange={e => setFilterCity(e.target.value)}
                  style={{ background: C.bg, border: `1px solid ${filterCity ? C.teal : C.border}`, borderRadius: "3px", padding: "4px 7px", color: filterCity ? C.teal : C.muted, fontSize: "10px", outline: "none", cursor: "pointer", fontFamily: "inherit", maxWidth: "140px" }}>
                  <option value="">All Cities ({allCities.length})</option>
                  {allCities.map(city => {
                    const count = leads.filter(l => extractCity(l) === city).length;
                    return <option key={city} value={city}>{city} ({count})</option>;
                  })}
                </select>

                {/* Type filter */}
                <select value={filterType} onChange={e => setFilterType(e.target.value)}
                  style={{ background: C.bg, border: `1px solid ${filterType ? C.amber : C.border}`, borderRadius: "3px", padding: "4px 7px", color: filterType ? C.amber : C.muted, fontSize: "10px", outline: "none", cursor: "pointer", fontFamily: "inherit", maxWidth: "130px" }}>
                  <option value="">All Types ({allTypes.length})</option>
                  {allTypes.map(type => {
                    const count = leads.filter(l => l.category === type).length;
                    return <option key={type} value={type}>{type} ({count})</option>;
                  })}
                </select>

                {/* Clear filters */}
                {(filterCity || filterType || filterCountry) && (
                  <button onClick={() => { setFilterCity(""); setFilterType(""); setFilterCountry(""); }}
                    style={{ fontSize: "10px", color: C.muted, background: "none", border: `1px solid ${C.border}`, borderRadius: "3px", padding: "4px 8px", cursor: "pointer", fontFamily: "inherit" }}>
                    ✕ Clear
                  </button>
                )}

                <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search…"
                  style={IS({ width: "130px", padding: "5px 9px", fontSize: "11px" })} />
              </div>
            )}
          </div>

          {/* Results */}
          <div style={{ flex: 1, overflowY: "auto" }}>

            {activeTab === "leads" && (
              leads.length === 0 && !running
                ? <EmptyState apiStatus={apiStatus} />
                : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                    <thead>
                      <tr>
                        {[["name","Business","185px"],["category","Type","85px"],["has_website","Web","48px"],["score","Score","55px"],["phone","Phone","125px"],["email","Email","170px"],["website","Website","130px"],["address","Address","auto"],["rating","⭐","48px"]].map(([k, l, w]) => (
                          <th key={k} onClick={() => sortBy(k)}
                            style={{ padding: "8px 10px", textAlign: "left", fontSize: "9px", letterSpacing: "0.1em", color: sortK === k ? C.teal : C.muted, background: C.panel, position: "sticky", top: 0, cursor: "pointer", userSelect: "none", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", width: w }}>
                            {l}{sortK === k ? (sortD === "asc" ? " ↑" : " ↓") : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeads.map((lead, i) => {
                        const noWeb = lead.has_website !== "Yes";
                        return (
                          <tr key={i}
                            style={{ background: noWeb ? C.red + "08" : i % 2 === 0 ? "transparent" : C.panel + "80", borderBottom: `1px solid ${C.border}` }}
                            onMouseEnter={e => e.currentTarget.style.background = noWeb ? C.red + "18" : C.border}
                            onMouseLeave={e => e.currentTarget.style.background = noWeb ? C.red + "08" : i % 2 === 0 ? "transparent" : C.panel + "80"}>
                            <td style={{ padding: "7px 10px", color: noWeb ? "#ffcdd2" : C.text, fontWeight: 500, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.name || "—"}</td>
                            <td style={{ padding: "7px 10px" }}>{lead.category && <span style={{ background: C.teal + "15", color: C.teal, padding: "1px 5px", borderRadius: "2px", fontSize: "9px" }}>{lead.category}</span>}</td>
                            <td style={{ padding: "7px 10px", textAlign: "center", fontSize: "13px" }}>{lead.has_website === "Yes" ? "✓" : "✗"}</td>
                            <td style={{ padding: "7px 10px", textAlign: "center" }}>
                              {lead.score != null && (
                                <span style={{ fontSize: "10px", fontWeight: 700, color: lead.score >= 75 ? C.green : lead.score >= 55 ? C.amber : C.muted, background: (lead.score >= 75 ? C.green : lead.score >= 55 ? C.amber : C.muted) + "18", padding: "1px 5px", borderRadius: "3px" }}>
                                  {lead.score}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "7px 10px", cursor: "pointer" }} onClick={() => lead.phone && copyCell(lead.phone, `ph-${i}`)}>
                              <span style={{ color: copiedCell === `ph-${i}` ? C.green : C.blue, fontSize: "10px" }}>{copiedCell === `ph-${i}` ? "copied!" : lead.phone || <span style={{ color: C.muted }}>—</span>}</span>
                            </td>
                            <td style={{ padding: "7px 10px", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }} onClick={() => lead.email && copyCell(lead.email, `em-${i}`)}>
                              {lead.email ? <span style={{ color: copiedCell === `em-${i}` ? C.green : C.green + "cc", fontSize: "10px" }}>{copiedCell === `em-${i}` ? "copied!" : lead.email}</span> : <span style={{ color: C.muted }}>—</span>}
                            </td>
                            <td style={{ padding: "7px 10px", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {lead.website ? <a href={lead.website} target="_blank" rel="noopener noreferrer" style={{ color: C.blue + "99", fontSize: "10px", textDecoration: "none" }}>{lead.website.replace(/^https?:\/\/(www\.)?/, "").slice(0, 28)}</a> : <span style={{ color: C.muted }}>—</span>}
                            </td>
                            <td style={{ padding: "7px 10px", color: C.dim, fontSize: "10px", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.address || "—"}</td>
                            <td style={{ padding: "7px 10px", color: C.amber, fontWeight: 700, fontSize: "10px", textAlign: "center" }}>{lead.rating || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )
            )}

            {activeTab === "reviewers" && (
              reviewers.length === 0
                ? <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "10px" }}>
                  <div style={{ fontSize: "36px" }}>👥</div>
                  <div style={{ color: C.muted, fontSize: "12px" }}>Enable "Scrape Reviewer Profiles" and run a search</div>
                </div>
                : <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                  <thead>
                    <tr>{[["reviewer_name","Reviewer"],["business_name","Business"],["rating_given","★"],["reviewer_review_count","Reviews"],["is_local_guide","Guide"],["review_date","Date"],["review_text","Review"]].map(([k,l]) => (
                      <th key={k} style={{ padding: "8px 10px", textAlign: "left", fontSize: "9px", letterSpacing: "0.1em", color: C.muted, background: C.panel, position: "sticky", top: 0, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{l}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {reviewers.map((r, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? "transparent" : C.panel + "80" }}>
                        <td style={{ padding: "7px 10px", fontWeight: 500, whiteSpace: "nowrap" }}>
                          {r.reviewer_profile_url ? <a href={r.reviewer_profile_url} target="_blank" rel="noopener noreferrer" style={{ color: C.amber, textDecoration: "none" }}>{r.reviewer_name}</a> : r.reviewer_name}
                        </td>
                        <td style={{ padding: "7px 10px", color: C.dim, whiteSpace: "nowrap" }}>{r.business_name}</td>
                        <td style={{ padding: "7px 10px", color: C.amber, textAlign: "center" }}>{r.rating_given || "—"}</td>
                        <td style={{ padding: "7px 10px", color: C.teal, textAlign: "center" }}>{r.reviewer_review_count || 0}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center" }}>{r.is_local_guide === "Yes" && <span style={{ background: C.blue + "22", color: C.blue, padding: "1px 5px", borderRadius: "2px", fontSize: "9px" }}>LG</span>}</td>
                        <td style={{ padding: "7px 10px", color: C.muted, fontSize: "10px", whiteSpace: "nowrap" }}>{r.review_date}</td>
                        <td style={{ padding: "7px 10px", color: C.dim, fontSize: "10px", maxWidth: "280px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.review_text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            )}

            {activeTab === "monitor" && (
              <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <MetricCard title="Queue Status" data={qStats} fields={[["waiting","Waiting",C.amber],["active","Active",C.teal],["completed","Completed",C.green],["failed","Failed",C.red]]} />
                <MetricCard title="Performance" data={metrics} fields={[["successRate","Success Rate",C.green],["requestsPerHour","Req/Hour",C.teal],["active","Active Jobs",C.amber]]} />
                <div style={{ padding: "14px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: "4px" }}>
                  <div style={{ fontSize: "10px", color: C.muted, letterSpacing: "0.1em", marginBottom: "10px" }}>ACTIVE CONFIG</div>
                  {[
                    ["Concurrency", cfg.concurrency, C.teal],
                    ["Max Retries", cfg.maxRetries, C.amber],
                    ["Proxies", proxyCount > 0 ? `${proxyCount} loaded` : "None", proxyCount > 0 ? C.green : C.muted],
                    ["Scrapingdog", cfg.scrapingdog ? "✓" : "—", cfg.scrapingdog ? C.teal : C.muted],
                    ["SerpAPI", cfg.serpapi ? "✓" : "—", cfg.serpapi ? C.teal : C.muted],
                    ["CAPTCHA", cfg.captchaKey ? `✓ ${cfg.captchaService}` : "—", cfg.captchaKey ? C.amber : C.muted],
                  ].map(([k, v, c]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px", fontSize: "11px" }}>
                      <span style={{ color: C.muted }}>{k}</span>
                      <span style={{ color: c, fontWeight: 700 }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "14px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: "4px" }}>
                  <div style={{ fontSize: "10px", color: C.muted, letterSpacing: "0.1em", marginBottom: "10px" }}>QUICK COMMANDS</div>
                  {[
                    [`curl ${apiUrl}/health`, "Health check"],
                    [`curl ${apiUrl}/queue/stats`, "Queue depth"],
                    [`bash scraper/scripts/scale.sh 5 30`, "Scale workers"],
                  ].map(([cmd, label]) => (
                    <div key={label} style={{ marginBottom: "9px" }}>
                      <div style={{ fontSize: "9px", color: C.muted, marginBottom: "2px" }}>{label}</div>
                      <code onClick={() => { navigator.clipboard.writeText(cmd); notify(`Copied`); }}
                        style={{ fontSize: "9px", color: C.teal, cursor: "pointer", display: "block", wordBreak: "break-all" }}>
                        {cmd}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── OUTREACH TAB ── */}
            {activeTab === "outreach" && (
              <OutreachTab leads={leads} apiUrl={apiUrl} cfg={cfg} notify={notify} api={api} />
            )}

            {/* ── FREIGHT TAB ── */}
            {activeTab === "freight" && (
              <FreightTab apiUrl={apiUrl} cfg={cfg} notify={notify} api={api} />
            )}

          </div>
        </div>
      </div>

      {/* Settings Drawer */}
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        cfg={cfg}
        onChange={updateCfg}
        apiUrl={apiUrl}
        onApply={applySettings}
      />

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: "20px", right: "20px", background: C.teal, color: "#000", padding: "10px 18px", borderRadius: "4px", fontSize: "12px", fontWeight: 700, fontFamily: "inherit", letterSpacing: "0.06em", zIndex: 9999, boxShadow: "0 4px 20px rgba(0,212,170,0.3)" }}>
          {toast}
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Barlow+Condensed:wght@600;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #0a0f14; }
        ::-webkit-scrollbar-thumb { background: #1e3040; border-radius: 2px; }
        input::placeholder, textarea::placeholder { color: #4a6070; }
        select option { background: #0d141c; color: #c8d8e8; }
        @keyframes slideIn { from { transform: translateX(30px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </div>
  );
}

// ── Outreach Tab ──────────────────────────────────────────────────────────────
function OutreachTab({ leads, apiUrl, cfg, notify, api }) {
  const [campaignName,   setCampaignName]   = useState("My Campaign");
  const [emailTemplate,  setEmailTemplate]  = useState("no_website_outreach");
  const [channels,       setChannels]       = useState(["email"]);
  const [targetFilter,   setTargetFilter]   = useState("no_website");
  const [enriching,      setEnriching]      = useState(false);
  const [enrichStats,    setEnrichStats]    = useState(null);
  const [campaigns,      setCampaigns]      = useState([]);
  const [preview,        setPreview]        = useState(null);
  const [creating,       setCreating]       = useState(false);
  const [jobRunning,     setJobRunning]     = useState(null);

  const [senderName,     setSenderName]     = useState("");
  const [senderCompany,  setSenderCompany]  = useState("");
  const [senderPhone,    setSenderPhone]    = useState("");
  const [senderEmail,    setSenderEmail]    = useState("");
  const [emailProvider,  setEmailProvider]  = useState("smtp");
  const [smtpHost,       setSmtpHost]       = useState("smtp.gmail.com");
  const [smtpUser,       setSmtpUser]       = useState("");
  const [smtpPass,       setSmtpPass]       = useState("");
  const [sendgridKey,    setSendgridKey]    = useState("");
  const [twilioSid,      setTwilioSid]      = useState("");
  const [twilioToken,    setTwilioToken]    = useState("");
  const [twilioFrom,     setTwilioFrom]     = useState("");

  const targetLeads  = leads.filter(l => {
    if (targetFilter === "no_website") return l.has_website !== "Yes";
    if (targetFilter === "no_email")   return !l.email;
    return true;
  });
  const emailTargets = targetLeads.filter(l => l.email).length;
  const smsTargets   = targetLeads.filter(l => l.phone).length;

  const TEMPLATES = [
    { id: "no_website_outreach", label: "No Website Pitch"    },
    { id: "review_outreach",     label: "Review Building"     },
    { id: "seo_outreach",        label: "Google Ranking / SEO" },
  ];

  const loadPreview = async () => {
    if (!leads.length) { notify("⚠ No leads loaded yet"); return; }
    try {
      const sample = targetLeads[0] || leads[0];
      const resp   = await api("POST", "/outreach/preview", {
        templateId: emailTemplate, channel: "email", lead: sample,
        sender: { name: senderName, company: senderCompany, phone: senderPhone, email: senderEmail },
      });
      setPreview(resp);
    } catch { notify("⚠ Could not load preview"); }
  };

  const enrichLeads = async () => {
    setEnriching(true);
    try {
      const resp = await api("POST", "/outreach/enrich", { leads: targetLeads });
      setEnrichStats(resp);
      notify(`✓ Found ${resp.newEmailsFound} new emails`);
    } catch { notify("⚠ Enrichment failed — is API online?"); }
    setEnriching(false);
  };

  const loadCampaigns = async () => {
    try { const r = await api("GET", "/outreach/campaigns"); setCampaigns(r.campaigns || []); } catch {}
  };

  const createCampaign = async () => {
    if (!targetLeads.length) { notify("⚠ No leads match the target filter"); return; }
    setCreating(true);
    try {
      await api("POST", "/outreach/campaigns", {
        name: campaignName, leads: targetLeads, emailTemplate, channels,
        senderInfo: { name: senderName, company: senderCompany, phone: senderPhone, email: senderEmail },
      });
      await loadCampaigns();
      notify(`✓ Campaign "${campaignName}" created`);
    } catch { notify("⚠ Campaign creation failed"); }
    setCreating(false);
  };

  const runStep = async (id, step) => {
    setJobRunning(id + step);
    try {
      const r = await api("POST", `/outreach/campaigns/${id}/run`, { step });
      notify(`✓ Step ${step + 1}: ${r.sent || 0} sent, ${r.failed || 0} failed`);
      await loadCampaigns();
    } catch { notify("⚠ Run failed"); }
    setJobRunning(null);
  };

  const testEmail = async () => {
    const config = emailProvider === "sendgrid"
      ? { provider: "sendgrid", apiKey: sendgridKey }
      : { provider: "smtp", host: smtpHost, user: smtpUser, pass: smtpPass };
    try {
      const r = await api("POST", "/outreach/test", config);
      notify(r.ok ? "✓ Email connection OK" : `⚠ ${r.error}`);
    } catch { notify("⚠ Test failed — is API online?"); }
  };

  const IS2 = (extra = {}) => ({
    width: "100%", background: "#050709", border: "1px solid #162030", borderRadius: "3px",
    padding: "7px 9px", color: "#c8d8e8", fontSize: "11px", outline: "none",
    boxSizing: "border-box", fontFamily: "inherit", marginBottom: "5px", ...extra,
  });

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* ── Left Config Panel ── */}
      <div style={{ width: "320px", minWidth: "320px", borderRight: `1px solid ${C.border}`, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>

        <div>
          <div style={{ fontSize: "9px", color: C.muted, letterSpacing: "0.12em", marginBottom: "5px" }}>🎯 TARGET LEADS</div>
          <select value={targetFilter} onChange={e => setTargetFilter(e.target.value)} style={IS2({ cursor: "pointer" })}>
            <option value="no_website">No Website ({leads.filter(l => l.has_website !== "Yes").length} leads)</option>
            <option value="no_email">Missing Email ({leads.filter(l => !l.email).length} leads)</option>
            <option value="all">All Leads ({leads.length})</option>
          </select>
          <div style={{ fontSize: "9px", color: C.muted }}>{emailTargets} with email · {smsTargets} with phone</div>
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
            <div style={{ fontSize: "9px", color: C.muted, letterSpacing: "0.12em" }}>📝 EMAIL TEMPLATE</div>
            <button onClick={loadPreview} style={{ fontSize: "9px", color: "#4a9eff", background: "none", border: "1px solid #162030", borderRadius: "3px", padding: "2px 7px", cursor: "pointer", fontFamily: "inherit" }}>Preview</button>
          </div>
          <select value={emailTemplate} onChange={e => setEmailTemplate(e.target.value)} style={IS2({ cursor: "pointer" })}>
            {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>

        <div>
          <div style={{ fontSize: "9px", color: C.muted, letterSpacing: "0.12em", marginBottom: "6px" }}>📡 CHANNELS</div>
          <div style={{ display: "flex", gap: "6px" }}>
            {[["email","📧 Email"],["sms","💬 SMS"]].map(([ch, label]) => {
              const on = channels.includes(ch);
              return (
                <button key={ch} onClick={() => setChannels(p => on ? p.filter(c => c !== ch) : [...p, ch])}
                  style={{ flex: 1, padding: "6px", background: on ? "#2ecc7122" : "transparent", color: on ? "#2ecc71" : "#4a6070", border: `1px solid ${on ? "#2ecc71" : "#162030"}`, borderRadius: "3px", fontSize: "10px", cursor: "pointer", fontFamily: "inherit" }}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ fontSize: "9px", color: C.muted, letterSpacing: "0.12em", marginBottom: "6px" }}>👤 YOUR INFO</div>
          {[["Your name", senderName, setSenderName], ["Your company", senderCompany, setSenderCompany], ["Your phone", senderPhone, setSenderPhone], ["Your reply email", senderEmail, setSenderEmail]].map(([ph, val, setter]) => (
            <input key={ph} placeholder={ph} value={val} onChange={e => setter(e.target.value)} style={IS2()} />
          ))}
        </div>

        {channels.includes("email") && (
          <div style={{ padding: "10px", background: "#0d141c", border: "1px solid #162030", borderRadius: "4px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div style={{ fontSize: "9px", color: C.muted, letterSpacing: "0.12em" }}>📬 EMAIL PROVIDER</div>
              <button onClick={testEmail} style={{ fontSize: "9px", color: "#00d4aa", background: "none", border: "1px solid #162030", borderRadius: "3px", padding: "2px 7px", cursor: "pointer", fontFamily: "inherit" }}>Test</button>
            </div>
            <select value={emailProvider} onChange={e => setEmailProvider(e.target.value)} style={IS2({ cursor: "pointer" })}>
              <option value="smtp">SMTP (Gmail / Outlook)</option>
              <option value="sendgrid">SendGrid (100 free/day)</option>
            </select>
            {emailProvider === "smtp" ? (
              <>
                <input placeholder="smtp.gmail.com" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} style={IS2()} />
                <input placeholder="you@gmail.com" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} style={IS2()} />
                <input type="password" placeholder="App password" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} style={IS2()} />
                <div style={{ fontSize: "9px", color: "#4a6070", lineHeight: 1.5 }}>
                  Gmail: myaccount.google.com → Security → App Passwords
                </div>
              </>
            ) : (
              <input type="password" placeholder="SG.xxxxxxxx (SendGrid API key)" value={sendgridKey} onChange={e => setSendgridKey(e.target.value)} style={IS2()} />
            )}
          </div>
        )}

        {channels.includes("sms") && (
          <div style={{ padding: "10px", background: "#0d141c", border: "1px solid #162030", borderRadius: "4px" }}>
            <div style={{ fontSize: "9px", color: C.muted, letterSpacing: "0.12em", marginBottom: "8px" }}>💬 TWILIO</div>
            <input placeholder="Account SID (ACxxxxxxxx)" value={twilioSid} onChange={e => setTwilioSid(e.target.value)} style={IS2()} />
            <input type="password" placeholder="Auth Token" value={twilioToken} onChange={e => setTwilioToken(e.target.value)} style={IS2()} />
            <input placeholder="+1XXXXXXXXXX" value={twilioFrom} onChange={e => setTwilioFrom(e.target.value)} style={IS2()} />
          </div>
        )}

        <div style={{ padding: "10px", background: "#2ecc7108", border: "1px solid #2ecc7133", borderRadius: "4px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
            <div style={{ fontSize: "9px", color: "#2ecc71", letterSpacing: "0.1em" }}>🔍 EMAIL ENRICHMENT</div>
            <span style={{ fontSize: "9px", color: C.muted }}>{leads.filter(l => !l.email && l.website).length} missing</span>
          </div>
          <button onClick={enrichLeads} disabled={enriching || !leads.length}
            style={{ width: "100%", padding: "7px", background: "#2ecc7122", color: "#2ecc71", border: "1px solid #2ecc71", borderRadius: "3px", fontSize: "10px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            {enriching ? "Scanning websites for emails…" : "Find Missing Emails (Free)"}
          </button>
          {enrichStats && <div style={{ fontSize: "9px", color: "#2ecc71", marginTop: "4px" }}>✓ {enrichStats.newEmailsFound} emails found</div>}
        </div>

        <div>
          <div style={{ fontSize: "9px", color: C.muted, letterSpacing: "0.12em", marginBottom: "5px" }}>🚀 CAMPAIGN NAME</div>
          <input value={campaignName} onChange={e => setCampaignName(e.target.value)} style={IS2()} />
          <button onClick={createCampaign} disabled={creating || !targetLeads.length}
            style={{ width: "100%", padding: "10px", background: "#00d4aa22", color: "#00d4aa", border: "1px solid #00d4aa", borderRadius: "4px", fontSize: "11px", fontWeight: 700, cursor: "pointer", letterSpacing: "0.1em", fontFamily: "inherit" }}>
            {creating ? "CREATING…" : `▶ CREATE CAMPAIGN  (${targetLeads.length} leads)`}
          </button>
        </div>

        <button onClick={loadCampaigns} style={{ padding: "6px", background: "transparent", color: C.muted, border: "1px solid #162030", borderRadius: "3px", fontSize: "10px", cursor: "pointer", fontFamily: "inherit" }}>
          ↻ Refresh Campaigns
        </button>
      </div>

      {/* ── Right: Preview + Campaign List ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>

        {preview && (
          <div style={{ padding: "16px", background: "#0d141c", border: "1px solid #1e3040", borderRadius: "4px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
              <div style={{ fontSize: "9px", color: C.muted, letterSpacing: "0.1em" }}>EMAIL PREVIEW — sample lead</div>
              <button onClick={() => setPreview(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "14px", padding: 0 }}>✕</button>
            </div>
            <div style={{ fontSize: "11px", color: "#f5a623", marginBottom: "10px", fontWeight: 600 }}>Subject: {preview.subject}</div>
            <pre style={{ fontSize: "10px", color: "#c8d8e8", whiteSpace: "pre-wrap", lineHeight: 1.8, margin: 0, fontFamily: "inherit" }}>{preview.body}</pre>
          </div>
        )}

        {campaigns.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: "12px", color: C.muted }}>
            <div style={{ fontSize: "44px" }}>📬</div>
            <div style={{ fontSize: "13px", fontWeight: 600 }}>No campaigns yet</div>
            <div style={{ fontSize: "10px", textAlign: "center", maxWidth: "320px", lineHeight: 1.8 }}>
              1. Scan for leads using the Leads tab<br/>
              2. Click "Find Missing Emails" to enrich contacts<br/>
              3. Configure your email provider (Gmail works great)<br/>
              4. Create a campaign and click Run Step 1<br/>
              5. Run Follow-up 3–7 days later
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: "10px", color: C.muted, letterSpacing: "0.1em" }}>CAMPAIGNS</div>
            {campaigns.map(c => (
              <div key={c.id} style={{ padding: "14px", background: "#0d141c", border: "1px solid #162030", borderRadius: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#c8d8e8" }}>{c.name}</div>
                    <div style={{ fontSize: "9px", color: C.muted, marginTop: "2px" }}>{new Date(c.createdAt).toLocaleDateString()} · {c.stats?.total || 0} leads</div>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={() => runStep(c.id, 0)} disabled={jobRunning === c.id + "0"}
                      style={{ padding: "5px 10px", background: "#00d4aa22", color: "#00d4aa", border: "1px solid #00d4aa", borderRadius: "3px", fontSize: "10px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                      {jobRunning === c.id + "0" ? "Running…" : "▶ Run Step 1"}
                    </button>
                    <button onClick={() => runStep(c.id, 1)} disabled={jobRunning === c.id + "1"}
                      style={{ padding: "5px 10px", background: "transparent", color: "#f5a623", border: "1px solid #f5a62344", borderRadius: "3px", fontSize: "10px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                      {jobRunning === c.id + "1" ? "Sending…" : "Follow-up"}
                    </button>
                  </div>
                </div>
                {c.stats && (
                  <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                    {[["Total", c.stats.total, "#7a9aaa"], ["Sent", c.stats.sent, "#00d4aa"], ["Replied", c.stats.replied, "#2ecc71"], ["Converted", c.stats.converted, "#f5a623"], ["Failed", c.stats.failed, "#ff4757"]].map(([l, v, color]) => (
                      <div key={l}>
                        <div style={{ fontSize: "16px", fontWeight: 700, color, lineHeight: 1 }}>{v || 0}</div>
                        <div style={{ fontSize: "8px", color: C.muted, letterSpacing: "0.08em", marginTop: "2px" }}>{l.toUpperCase()}</div>
                      </div>
                    ))}
                    {(c.stats.sent || 0) > 0 && (
                      <div style={{ marginLeft: "auto", textAlign: "right", alignSelf: "center" }}>
                        <div style={{ fontSize: "11px", color: "#2ecc71", fontWeight: 600 }}>
                          {Math.round(((c.stats.replied || 0) / c.stats.sent) * 100)}% reply rate
                        </div>
                        {(c.stats.replied || 0) > 0 && (
                          <div style={{ fontSize: "10px", color: "#f5a623" }}>
                            {Math.round(((c.stats.converted || 0) / c.stats.replied) * 100)}% conversion
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── Freight Leads Tab ─────────────────────────────────────────────────────────
const FREIGHT_NICHES = [
  // Warehousing — 3 query variants
  { id: "warehouse",       label: "Warehouses",          icon: "🏭", query: "warehouse",                weight: 3 },
  { id: "warehousing2",    label: "Storage Facilities",  icon: "🏭", query: "storage facility",         weight: 3 },
  { id: "warehousing3",    label: "Logistics Centres",   icon: "🏭", query: "logistics centre",         weight: 3 },
  // Manufacturing — 3 variants
  { id: "manufacturer",    label: "Manufacturers",       icon: "⚙️",  query: "manufacturer",             weight: 4 },
  { id: "manufacturer2",   label: "Fabrication Shops",   icon: "⚙️",  query: "fabrication shop",         weight: 4 },
  { id: "manufacturer3",   label: "Industrial Suppliers",icon: "⚙️",  query: "industrial supplier",      weight: 4 },
  // Distribution
  { id: "distribution",    label: "Distribution",        icon: "📦", query: "distribution center",      weight: 3 },
  { id: "distribution2",   label: "Wholesale Distributors",icon:"📦", query: "wholesale distributor",   weight: 3 },
  // 3PL / Freight Brokers — 3 variants
  { id: "3pl",             label: "3PL / Brokers",       icon: "🚛", query: "freight broker",           weight: 3 },
  { id: "3pl2",            label: "Logistics Companies",  icon: "🚛", query: "logistics company",        weight: 3 },
  { id: "3pl3",            label: "Trucking Companies",   icon: "🚛", query: "trucking company",         weight: 3 },
  // Oilfield — highest priority, 3 variants
  { id: "oilfield",        label: "Oilfield Services",   icon: "⛽", query: "oilfield services",        weight: 5 },
  { id: "oilfield2",       label: "Energy Services",     icon: "⛽", query: "energy services",          weight: 5 },
  { id: "oilfield3",       label: "Oil & Gas Contractors",icon:"⛽", query: "oil gas contractor",       weight: 5 },
  // Construction — 3 variants
  { id: "construction",    label: "General Contractors",  icon: "🏗️", query: "general contractor",      weight: 4 },
  { id: "construction2",   label: "Civil Contractors",    icon: "🏗️", query: "civil contractor",        weight: 4 },
  { id: "construction3",   label: "Heavy Equipment",      icon: "🏗️", query: "heavy equipment rental",  weight: 4 },
  // Cold Storage
  { id: "cold_storage",    label: "Cold Storage",         icon: "❄️",  query: "cold storage",            weight: 3 },
  { id: "cold_storage2",   label: "Refrigerated Freight", icon: "❄️",  query: "refrigerated transport",  weight: 3 },
  // Import / Export — 2 variants
  { id: "import_export",   label: "Import / Export",      icon: "🚢", query: "import export",           weight: 4 },
  { id: "import_export2",  label: "Customs Brokers",      icon: "🚢", query: "customs broker",          weight: 4 },
  // Agriculture — 2 variants
  { id: "agriculture",     label: "Agriculture",           icon: "🌾", query: "agriculture",             weight: 3 },
  { id: "agriculture2",    label: "Grain Elevators",       icon: "🌾", query: "grain elevator",          weight: 3 },
  // Scrap / Recycling
  { id: "scrap",           label: "Scrap / Recycling",    icon: "♻️", query: "scrap metal",             weight: 2 },
  { id: "scrap2",          label: "Demolition",           icon: "♻️", query: "demolition contractor",   weight: 2 },
  // E-Commerce
  { id: "ecommerce",       label: "E-Commerce / Shopify", icon: "🛒", query: "ecommerce",               weight: 2 },
  { id: "ecommerce2",      label: "Fulfillment Centres",  icon: "🛒", query: "fulfillment centre",      weight: 2 },
];

const FREIGHT_CITIES_PRESET = {
  AB: ["Calgary", "Edmonton", "Red Deer", "Lethbridge", "Fort McMurray", "Grande Prairie", "Airdrie", "Medicine Hat", "Leduc", "Nisku", "Spruce Grove", "St. Albert"],
  BC: ["Vancouver", "Surrey", "Burnaby", "Richmond", "Delta", "Langley", "Abbotsford", "Kelowna", "Kamloops", "Prince George", "Chilliwack", "Nanaimo"],
};

// Keywords that indicate a non-freight business — matched against name + category
const FREIGHT_BLOCKLIST = [
  // Self storage / moving
  "self storage","self-storage","mini storage","public storage","storage unit","storage locker",
  "u-haul","uhaul","u haul","moving company","moving & storage","moving and storage","pods ",
  // Auto parts / repair (not fleet/commercial)
  "auto parts","car parts","napa auto","o'reilly","autozone","lordco","pick n pull","pull-a-part",
  "auto body","auto repair","mechanic","tire shop","tire store","muffler","oil change","car wash",
  "car detailing","auto glass","windshield","transmission shop","brake shop",
  // Retail / grocery
  "grocery","supermarket","food store","convenience store","dollar store","pharmacy","drug store",
  "liquor store","beer store","wine store","clothing store","furniture store","mattress","hardware store",
  "home depot","canadian tire","rona","ikea","costco","walmart","best buy","staples",
  // Food & beverage
  "restaurant","café","cafe","coffee","bakery","pizza","sushi","fast food","bar & grill","pub ",
  "diner","catering","food truck","brewery","winery","distillery",
  // Personal services
  "hair salon","nail salon","barber","spa ","day spa","massage","tattoo","tanning","laundromat",
  "dry cleaning","alterations","pet grooming","dog grooming","vet clinic","veterinary",
  // Medical / dental
  "dental","dentist","orthodont","medical clinic","walk-in clinic","chiropract","physiotherapy",
  "optometrist","optician","pharmacy","hospital","clinic",
  // Real estate / property
  "real estate","realty","property management","strata","condo","apartment","storage condo",
  // Education / finance
  "school","college","university","daycare","bank ","credit union","insurance broker","tax ",
  // Recreation
  "gym","fitness","yoga","crossfit","bowling","golf","curling","arena","pool ","rec centre",
  // Hotels / hospitality
  "hotel","motel","inn ","airbnb","resort","lodge","campground",
];

const isFreightRelevant = (name = "", category = "") => {
  const hay = (name + " " + category).toLowerCase();
  return !FREIGHT_BLOCKLIST.some(kw => hay.includes(kw));
};

const FREIGHT_LANES = [
  "Vancouver ↔ Edmonton",   // ⭐ preferred
  "Calgary ↔ Edmonton",
  "Vancouver ↔ Calgary",
  "Vancouver ↔ Kelowna",
  "Vancouver ↔ Seattle",
];

const PREFERRED_LANE = "Vancouver ↔ Edmonton";

const AB_CITIES = ["calgary", "edmonton", "red deer", "lethbridge", "fort mcmurray", "grande prairie", "airdrie", "medicine hat", "brooks", "lloyminster"];

const freightLane = (city = "") => {
  const c = city.toLowerCase();
  // BC cities — all feed the Van↔Edmonton preferred lane
  if (c.includes("vancouver") || c.includes("surrey") || c.includes("burnaby") || c.includes("richmond") ||
      c.includes("delta") || c.includes("langley") || c.includes("abbotsford") || c.includes("chilliwack") ||
      c.includes("nanaimo") || c.includes("prince george") || c.includes("kamloops")) return "Vancouver ↔ Edmonton";
  // BC interior — Kelowna corridor
  if (c.includes("kelowna") || c.includes("penticton") || c.includes("vernon")) return "Vancouver ↔ Kelowna";
  // AB cities — all feed the Van↔Edmonton preferred lane
  if (c.includes("edmonton") || c.includes("fort mcmurray") || c.includes("grande prairie") ||
      c.includes("lloydminster") || c.includes("leduc") || c.includes("nisku") ||
      c.includes("spruce grove") || c.includes("st. albert")) return "Vancouver ↔ Edmonton";
  // Calgary area — Calgary↔Edmonton first, then Van↔Calgary for shippers moving west
  if (c.includes("calgary") || c.includes("red deer") || c.includes("airdrie") || c.includes("lethbridge") ||
      c.includes("medicine hat")) return "Calgary ↔ Edmonton";
  return "Vancouver ↔ Edmonton";
};

const freightProvince = (city = "") => {
  const c = city.toLowerCase();
  return AB_CITIES.some(ac => c.includes(ac)) ? "AB" : "BC";
};

const freightScore = (lead, nicheWeight = 3) => {
  const has_contact = lead.contact_name ? 1 : 0;
  const pain_signal = lead.pain_signal || 0;
  const loc_density = ["calgary", "edmonton", "vancouver", "surrey"].some(c =>
    (lead.city || "").toLowerCase().includes(c)) ? 2 : 1;
  return (nicheWeight * 2) + loc_density + (has_contact * 3) + (pain_signal * 2);
};

function FreightTab({ apiUrl, cfg, notify }) {
  const [freightLeads, setFreightLeads] = useState(() => {
    try { const s = localStorage.getItem("leadgen-freight-leads"); return s ? JSON.parse(s) : []; }
    catch { return []; }
  });
  const [scanning, setScanning]     = useState(false);
  const [progress, setProgress]     = useState({ done: 0, total: 0 });
  const [selNiches, setSelNiches]   = useState(FREIGHT_NICHES.map(n => n.id));
  const [maxPerQuery, setMaxPerQuery] = useState(60);
  const [cityInput, setCityInput]   = useState("Calgary, Edmonton, Vancouver");
  const [filterNiche, setFilterNiche] = useState("");
  const [filterLane, setFilterLane]   = useState("");
  const [minScore, setMinScore]       = useState(0);
  const [searchText, setSearchText]   = useState("");
  const [sortKey, setSortKey]         = useState("score");
  const [sortDir, setSortDir]         = useState("desc");
  const [copiedCell, setCopiedCell]   = useState(null);
  const abortRef = useRef(false);

  const saveLeads = (arr) => {
    localStorage.setItem("leadgen-freight-leads", JSON.stringify(arr));
    setFreightLeads(arr);
  };

  const toggleNiche = (id) =>
    setSelNiches(prev => prev.includes(id) ? prev.filter(n => n !== id) : [...prev, id]);

  const copyCell = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCell(id);
      setTimeout(() => setCopiedCell(null), 1500);
    });
  };

  const scan = async () => {
    if (!selNiches.length) { notify("Select at least one niche"); return; }
    const cities = cityInput.split(/[,\n]+/).map(c => c.trim()).filter(Boolean);
    if (!cities.length) { notify("Enter at least one city"); return; }

    setScanning(true);
    abortRef.current = false;

    const queries = [];
    for (const nicheId of selNiches) {
      const niche = FREIGHT_NICHES.find(n => n.id === nicheId);
      if (!niche) continue;
      for (const city of cities) {
        queries.push({ niche, city, q: `${niche.query} ${city} Canada` });
      }
    }
    setProgress({ done: 0, total: queries.length });

    let pool = [...freightLeads];
    const seen = new Set(pool.map(l => l.phone || l.website || (l.company_name || "").toLowerCase().slice(0, 24)).filter(Boolean));
    let doneCount = 0;

    const runQuery = async ({ niche, city }) => {
      if (abortRef.current) return;
      try {
        const jr = await fetch(`${apiUrl}/leads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ location: city, category: niche.query, source: "google_maps", maxResults: maxPerQuery, async: true }),
        }).then(r => r.json());

        let res = null;
        if (jr.jobId) {
          for (let p = 0; p < 120; p++) {
            if (abortRef.current) break;
            await new Promise(r => setTimeout(r, 2500));
            try {
              const job = await fetch(`${apiUrl}/jobs/${jr.jobId}`).then(r => r.json());
              if (job.state === "completed") { res = job.result; break; }
              if (job.state === "failed")    { break; }
            } catch {}
          }
        }

        for (const item of (res?.leads || res?.results || [])) {
          if (!isFreightRelevant(item.name || item.company_name, item.category)) continue;
          const province = freightProvince(item.address || city);
          const lead = {
            id:           `fr-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            company_name: item.name || item.company_name || "",
            niche:        niche.id,
            niche_label:  niche.label,
            city,
            province,
            phone:        item.phone || "",
            email:        item.email || "",
            website:      item.website || "",
            contact_name: item.contact_name || "",
            contact_role: item.contact_role || "",
            source:       "Google Maps",
            lane:         freightLane(city),
            pain_signal:  0,
            notes:        item.category || "",
            address:      item.address || "",
            rating:       item.rating || "",
          };
          lead.score = freightScore(lead, niche.weight);
          const key = lead.phone || lead.website || lead.company_name.toLowerCase().slice(0, 24);
          if (key && seen.has(key)) continue;
          if (key) seen.add(key);
          pool.push(lead);
        }
      } catch { /* skip on error */ }

      doneCount++;
      setProgress({ done: doneCount, total: queries.length });
      saveLeads([...pool]);
    };

    // Run 3 queries concurrently
    const CONCURRENCY = 3;
    for (let i = 0; i < queries.length; i += CONCURRENCY) {
      if (abortRef.current) break;
      await Promise.all(queries.slice(i, i + CONCURRENCY).map(runQuery));
    }

    setScanning(false);
    notify(`Scan complete — ${pool.length} freight leads total`);
  };

  const exportCSV = (rows, filename) => {
    const H = ["Company","Niche","City","Province","Phone","Email","Website","Contact","Role","Lane","Score","Source","Notes"];
    const e = v => `"${(v || "").toString().replace(/"/g, '""')}"`;
    const csv = [H.join(","), ...rows.map(r =>
      [r.company_name, r.niche_label || r.niche, r.city, r.province, r.phone, r.email, r.website,
       r.contact_name, r.contact_role, r.lane, r.score, r.source, r.notes].map(e).join(",")
    )].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: filename }).click();
    URL.revokeObjectURL(url);
  };

  // Filtered + sorted view
  const displayed = (() => {
    let arr = freightLeads.filter(l => {
      if (filterNiche && l.niche !== filterNiche) return false;
      if (filterLane  && l.lane  !== filterLane)  return false;
      if (minScore    && (l.score || 0) < minScore) return false;
      if (searchText) {
        const s = searchText.toLowerCase();
        return (l.company_name || "").toLowerCase().includes(s) ||
               (l.city         || "").toLowerCase().includes(s) ||
               (l.niche_label  || "").toLowerCase().includes(s) ||
               (l.phone        || "").includes(s) ||
               (l.email        || "").toLowerCase().includes(s);
      }
      return true;
    });
    arr.sort((a, b) => {
      const av = a[sortKey] ?? ""; const bv = b[sortKey] ?? "";
      const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  })();

  const abCount  = freightLeads.filter(l => l.province === "AB").length;
  const bcCount  = freightLeads.filter(l => l.province === "BC").length;
  const avgScore = freightLeads.length
    ? Math.round(freightLeads.reduce((s, l) => s + (l.score || 0), 0) / freightLeads.length)
    : 0;
  const topLane  = (() => {
    const cnt = {};
    freightLeads.forEach(l => { cnt[l.lane] = (cnt[l.lane] || 0) + 1; });
    return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  })();

  const scoreColor = s => s >= 14 ? C.green : s >= 10 ? C.amber : C.muted;

  const Th = ({ k, label }) => (
    <th onClick={() => {
      if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
      else { setSortKey(k); setSortDir("desc"); }
    }} style={{
      padding: "8px 10px", textAlign: "left", fontSize: "9px", fontWeight: 700,
      letterSpacing: "0.1em", color: sortKey === k ? C.teal : C.muted,
      cursor: "pointer", whiteSpace: "nowrap", background: C.panel,
      position: "sticky", top: 0, borderBottom: `1px solid ${C.border}`, userSelect: "none",
    }}>
      {label}{sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* ── Left Control Panel ── */}
      <div style={{ width: "236px", flexShrink: 0, background: C.panel, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflowY: "auto", padding: "14px", gap: "14px" }}>

        {/* Niche selector */}
        <div>
          <Label color={C.purple}>FREIGHT NICHES</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            {FREIGHT_NICHES.map(n => (
              <label key={n.id} style={{ display: "flex", alignItems: "center", gap: "7px", cursor: "pointer", padding: "4px 6px", borderRadius: "3px", background: selNiches.includes(n.id) ? C.purple + "14" : "transparent", border: `1px solid ${selNiches.includes(n.id) ? C.purple + "40" : "transparent"}` }}>
                <input type="checkbox" checked={selNiches.includes(n.id)} onChange={() => toggleNiche(n.id)} style={{ accentColor: C.purple, cursor: "pointer" }} />
                <span style={{ fontSize: "10px", color: selNiches.includes(n.id) ? C.purple : C.dim, flex: 1 }}>{n.icon} {n.label}</span>
                <span style={{ fontSize: "9px", color: C.muted }}>w{n.weight}</span>
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: "5px", marginTop: "7px" }}>
            <button onClick={() => setSelNiches(FREIGHT_NICHES.map(n => n.id))} style={{ flex: 1, fontSize: "9px", padding: "4px", background: "none", border: `1px solid ${C.border}`, borderRadius: "3px", color: C.muted, cursor: "pointer", fontFamily: "inherit" }}>All</button>
            <button onClick={() => setSelNiches([])} style={{ flex: 1, fontSize: "9px", padding: "4px", background: "none", border: `1px solid ${C.border}`, borderRadius: "3px", color: C.muted, cursor: "pointer", fontFamily: "inherit" }}>None</button>
          </div>
        </div>

        {/* Cities input */}
        <div>
          <Label>TARGET CITIES</Label>
          <textarea value={cityInput} onChange={e => setCityInput(e.target.value)} rows={4}
            style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: "3px", padding: "7px 9px", color: C.text, fontSize: "10px", outline: "none", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }}
            placeholder={"Calgary\nEdmonton\nVancouver"} />
          <div style={{ marginTop: "6px" }}>
            <Label color={C.muted}>QUICK PRESETS</Label>
            <div style={{ display: "flex", gap: "4px" }}>
              {[
                ["Alberta", FREIGHT_CITIES_PRESET.AB.join(", ")],
                ["BC",      FREIGHT_CITIES_PRESET.BC.join(", ")],
                ["Both",    [...FREIGHT_CITIES_PRESET.AB, ...FREIGHT_CITIES_PRESET.BC].join(", ")],
              ].map(([lbl, val]) => (
                <button key={lbl} onClick={() => setCityInput(val)}
                  style={{ flex: 1, fontSize: "9px", padding: "3px 4px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: "3px", color: C.dim, cursor: "pointer", fontFamily: "inherit" }}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results per query */}
        <div>
          <Label>RESULTS PER QUERY</Label>
          <select value={maxPerQuery} onChange={e => setMaxPerQuery(Number(e.target.value))}
            style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: "3px", padding: "6px 8px", color: C.text, fontSize: "11px", outline: "none", fontFamily: "inherit" }}>
            <option value={20}>20 — Quick test</option>
            <option value={40}>40 — Light scan</option>
            <option value={60}>60 — Recommended</option>
            <option value={100}>100 — Deep scan</option>
          </select>
          <div style={{ fontSize: "9px", color: C.muted, marginTop: "4px" }}>
            Est. leads: ~{(selNiches.length * cityInput.split(/[,\n]+/).filter(s => s.trim()).length * maxPerQuery * 0.4).toFixed(0)} unique (after dedup)
          </div>
        </div>

        {/* Scan / Stop */}
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <button
            onClick={scanning ? () => { abortRef.current = true; } : scan}
            style={{ width: "100%", padding: "10px", background: scanning ? C.red + "22" : C.purple, color: scanning ? C.red : "#fff", border: `1px solid ${scanning ? C.red : C.purple}`, borderRadius: "3px", fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.05em" }}>
            {scanning ? `⏹ STOP  (${progress.done}/${progress.total})` : "🚛  SCAN FREIGHT LEADS"}
          </button>
          {scanning && (
            <div style={{ height: "3px", background: C.border, borderRadius: "2px" }}>
              <div style={{ height: "100%", width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`, background: C.purple, borderRadius: "2px", transition: "width 0.3s" }} />
            </div>
          )}
        </div>

        {/* Stats box */}
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: "4px", padding: "11px" }}>
          <Label color={C.blue}>PIPELINE STATS</Label>
          {[
            ["Total Leads",  freightLeads.length,  C.teal],
            ["Alberta",      abCount,              C.amber],
            ["BC",           bcCount,              C.blue],
            ["Avg Score",    avgScore,             C.green],
            ["Top Lane",     topLane.length > 20 ? topLane.slice(0, 18) + "…" : topLane, C.purple],
          ].map(([lbl, val, color]) => (
            <div key={lbl} style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px", fontSize: "11px" }}>
              <span style={{ color: C.muted }}>{lbl}</span>
              <span style={{ color, fontWeight: 700 }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Export buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <button onClick={() => exportCSV(displayed, `freight-leads-${Date.now()}.csv`)} disabled={!displayed.length}
            style={{ width: "100%", padding: "7px", background: C.green + "22", color: C.green, border: `1px solid ${C.green}44`, borderRadius: "3px", fontSize: "10px", fontWeight: 700, cursor: displayed.length ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
            ↓ Export CSV ({displayed.length} rows)
          </button>
          <button onClick={() => exportCSV([...freightLeads].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 50), `freight-top50-${Date.now()}.csv`)} disabled={!freightLeads.length}
            style={{ width: "100%", padding: "7px", background: C.amber + "22", color: C.amber, border: `1px solid ${C.amber}44`, borderRadius: "3px", fontSize: "10px", fontWeight: 700, cursor: freightLeads.length ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
            ↓ Top 50 by Score
          </button>
          <button onClick={() => { if (window.confirm("Clear all freight leads?")) saveLeads([]); }}
            style={{ width: "100%", padding: "7px", background: "none", color: C.muted, border: `1px solid ${C.border}`, borderRadius: "3px", fontSize: "10px", cursor: "pointer", fontFamily: "inherit" }}>
            ✕ Clear All
          </button>
        </div>

        {/* Scoring legend */}
        <div style={{ background: C.bg, border: `1px solid ${C.amber}44`, borderRadius: "4px", padding: "11px" }}>
          <Label color={C.amber}>⭐ PREFERRED LANE</Label>
          <div style={{ fontSize: "11px", color: C.amber, fontWeight: 700, marginBottom: "4px" }}>Vancouver ↔ Edmonton</div>
          <div style={{ fontSize: "9px", color: C.muted, lineHeight: 1.6 }}>All BC + Edmonton-area leads are assigned to this lane. Filter by lane to see them.</div>
        </div>

        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: "4px", padding: "11px" }}>
          <Label color={C.muted}>SCORING FORMULA</Label>
          <div style={{ fontSize: "9px", color: C.dim, lineHeight: 1.9 }}>
            <div style={{ color: C.text }}>score = (weight×2) + density + (contact×3) + (pain×2)</div>
            <div>Oilfield w5 · Construction w4</div>
            <div>Mfg w4 · Import/Export w4</div>
            <div>Warehouse w3 · Cold w3 · Agri w3</div>
            <div>3PL w3 · Scrap w2 · Ecom w2</div>
            <div style={{ marginTop: "4px" }}>
              <span style={{ color: C.green }}>■</span> ≥14 Hot &nbsp;
              <span style={{ color: C.amber }}>■</span> ≥10 Warm &nbsp;
              <span style={{ color: C.muted }}>■</span> &lt;10 Cold
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Table Area ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Filter bar */}
        <div style={{ padding: "7px 14px", background: C.panel, borderBottom: `1px solid ${C.border}`, display: "flex", gap: "7px", alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>

          <select value={filterNiche} onChange={e => setFilterNiche(e.target.value)}
            style={{ background: C.bg, border: `1px solid ${filterNiche ? C.purple : C.border}`, borderRadius: "3px", padding: "4px 7px", color: filterNiche ? C.purple : C.muted, fontSize: "10px", outline: "none", fontFamily: "inherit" }}>
            <option value="">All Niches</option>
            {FREIGHT_NICHES.map(n => <option key={n.id} value={n.id}>{n.icon} {n.label}</option>)}
          </select>

          <select value={filterLane} onChange={e => setFilterLane(e.target.value)}
            style={{ background: C.bg, border: `1px solid ${filterLane ? C.purple : C.border}`, borderRadius: "3px", padding: "4px 7px", color: filterLane ? C.purple : C.muted, fontSize: "10px", outline: "none", fontFamily: "inherit" }}>
            <option value="">All Lanes</option>
            {FREIGHT_LANES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>

          <select value={minScore} onChange={e => setMinScore(Number(e.target.value))}
            style={{ background: C.bg, border: `1px solid ${minScore ? C.green : C.border}`, borderRadius: "3px", padding: "4px 7px", color: minScore ? C.green : C.muted, fontSize: "10px", outline: "none", fontFamily: "inherit" }}>
            <option value={0}>Any Score</option>
            <option value={8}>Score ≥ 8</option>
            <option value={10}>Score ≥ 10</option>
            <option value={12}>Score ≥ 12</option>
            <option value={14}>Score ≥ 14 (Hot)</option>
          </select>

          <input value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="Search company, city…"
            style={{ background: C.bg, border: `1px solid ${searchText ? C.teal : C.border}`, borderRadius: "3px", padding: "4px 9px", color: C.text, fontSize: "10px", outline: "none", fontFamily: "inherit", width: "160px" }} />

          {(filterNiche || filterLane || minScore || searchText) && (
            <button onClick={() => { setFilterNiche(""); setFilterLane(""); setMinScore(0); setSearchText(""); }}
              style={{ fontSize: "10px", color: C.muted, background: "none", border: `1px solid ${C.border}`, borderRadius: "3px", padding: "4px 8px", cursor: "pointer", fontFamily: "inherit" }}>
              ✕ Clear
            </button>
          )}

          <div style={{ marginLeft: "auto", fontSize: "10px", color: C.muted }}>
            Showing <span style={{ color: C.teal, fontWeight: 700 }}>{displayed.length}</span> of {freightLeads.length} leads
          </div>
        </div>

        {/* Results table */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {freightLeads.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "14px", padding: "40px" }}>
              <div style={{ fontSize: "52px" }}>🚛</div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: C.muted }}>No freight leads yet</div>
              <div style={{ fontSize: "12px", color: C.muted, textAlign: "center", maxWidth: "380px", lineHeight: 1.8 }}>
                Select niches on the left, enter target cities (Calgary, Edmonton, Vancouver…),<br />
                and click <span style={{ color: C.purple, fontWeight: 700 }}>🚛 SCAN FREIGHT LEADS</span>.
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center", marginTop: "6px" }}>
                {["Oilfield ⛽", "Construction 🏗️", "3PL 🚛", "Import/Export 🚢", "Warehouse 🏭"].map(tag => (
                  <span key={tag} style={{ fontSize: "10px", padding: "3px 10px", background: C.purple + "18", color: C.purple, border: `1px solid ${C.purple}33`, borderRadius: "20px" }}>{tag}</span>
                ))}
              </div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
              <thead>
                <tr>
                  <Th k="score"        label="Score" />
                  <Th k="company_name" label="Company" />
                  <Th k="niche_label"  label="Niche" />
                  <Th k="city"         label="City" />
                  <Th k="province"     label="Prov" />
                  <Th k="phone"        label="Phone" />
                  <Th k="email"        label="Email" />
                  <Th k="website"      label="Website" />
                  <Th k="contact_name" label="Contact" />
                  <Th k="lane"         label="Lane" />
                  <Th k="source"       label="Source" />
                </tr>
              </thead>
              <tbody>
                {displayed.map((lead, i) => (
                  <tr key={lead.id || i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? "transparent" : C.surface + "88" }}>

                    {/* Score badge */}
                    <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-block", padding: "2px 8px", borderRadius: "3px", fontSize: "10px", fontWeight: 700, background: scoreColor(lead.score) + "22", color: scoreColor(lead.score), border: `1px solid ${scoreColor(lead.score)}44` }}>
                        {lead.score || 0}
                      </div>
                    </td>

                    {/* Company */}
                    <td onClick={() => copyCell(lead.company_name, `${lead.id}-name`)}
                      style={{ padding: "7px 10px", color: copiedCell === `${lead.id}-name` ? C.green : C.text, maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}>
                      {lead.company_name || "—"}
                    </td>

                    {/* Niche badge */}
                    <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
                      <span style={{ fontSize: "9px", padding: "2px 6px", borderRadius: "3px", background: C.purple + "20", color: C.purple, border: `1px solid ${C.purple}40` }}>
                        {lead.niche_label || lead.niche}
                      </span>
                    </td>

                    {/* City */}
                    <td style={{ padding: "7px 10px", color: C.dim, whiteSpace: "nowrap" }}>{lead.city || "—"}</td>

                    {/* Province badge */}
                    <td style={{ padding: "7px 10px" }}>
                      <span style={{ fontSize: "9px", padding: "2px 6px", borderRadius: "2px", background: lead.province === "AB" ? C.amber + "22" : C.blue + "22", color: lead.province === "AB" ? C.amber : C.blue, border: `1px solid ${lead.province === "AB" ? C.amber + "44" : C.blue + "44"}`, fontWeight: 700 }}>
                        {lead.province}
                      </span>
                    </td>

                    {/* Phone */}
                    <td onClick={() => copyCell(lead.phone, `${lead.id}-phone`)}
                      style={{ padding: "7px 10px", color: copiedCell === `${lead.id}-phone` ? C.green : lead.phone ? C.teal : C.muted, maxWidth: "130px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: lead.phone ? "pointer" : "default" }}>
                      {lead.phone || "—"}
                    </td>

                    {/* Email */}
                    <td onClick={() => copyCell(lead.email, `${lead.id}-email`)}
                      style={{ padding: "7px 10px", color: copiedCell === `${lead.id}-email` ? C.green : lead.email ? C.teal : C.muted, maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: lead.email ? "pointer" : "default" }}>
                      {lead.email || "—"}
                    </td>

                    {/* Website */}
                    <td style={{ padding: "7px 10px", maxWidth: "130px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {lead.website
                        ? <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" style={{ color: C.blue, textDecoration: "none", fontSize: "10px" }}>{lead.website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}</a>
                        : <span style={{ color: C.muted }}>—</span>}
                    </td>

                    {/* Contact */}
                    <td style={{ padding: "7px 10px", color: lead.contact_name ? C.green : C.muted, whiteSpace: "nowrap", fontSize: "10px" }}>
                      {lead.contact_name ? `${lead.contact_name}${lead.contact_role ? ` · ${lead.contact_role}` : ""}` : "—"}
                    </td>

                    {/* Lane */}
                    <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
                      <span style={{ fontSize: "9px", color: lead.lane === PREFERRED_LANE ? C.amber : C.purple, fontWeight: lead.lane === PREFERRED_LANE ? 700 : 400, letterSpacing: "0.02em" }}>
                        {lead.lane === PREFERRED_LANE ? "⭐ " : ""}{lead.lane || "—"}
                      </span>
                    </td>

                    {/* Source */}
                    <td style={{ padding: "7px 10px", color: C.muted, fontSize: "10px", whiteSpace: "nowrap" }}>{lead.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

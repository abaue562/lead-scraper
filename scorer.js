'use strict';

/**
 * Lead Scorer
 *
 * Assigns a 0–100 score to each lead based on multiple signals.
 * Higher score = better prospect for outreach.
 *
 * Scoring model (configurable):
 *
 *   CONTACT DATA                          max 40 pts
 *   ─────────────────────────────────────
 *   Has phone number             +15
 *   Has email address            +15
 *   Has physical address         +10
 *
 *   WEBSITE STATUS                         max 20 pts
 *   ─────────────────────────────────────
 *   No website                   +20   ← highest priority for website pitch
 *   Has website but no SSL       +10
 *   Has website                   +0
 *
 *   SOCIAL PROOF                           max 20 pts
 *   ─────────────────────────────────────
 *   Rating 4.5–5.0               +20   ← happy customers, likely to convert
 *   Rating 4.0–4.5               +15
 *   Rating 3.5–4.0               +10
 *   Rating < 3.5                  +5
 *   No rating                     +8
 *   Review count > 50             +5
 *   Review count 10–50            +3
 *   Review count < 10             +0   ← may be new, harder sell
 *
 *   CATEGORY VALUE                         max 10 pts
 *   ─────────────────────────────────────
 *   High-value categories        +10   (dentists, lawyers, HVAC, roofers)
 *   Mid-value categories          +7   (restaurants, salons, gyms)
 *   Other                         +5
 *
 *   PENALIZERS
 *   ─────────────────────────────────────
 *   No phone AND no email        -10
 *   Name too short/generic        -5
 */

// ── Category value tiers ──────────────────────────────────────────────────────

const HIGH_VALUE = [
  'dentist', 'attorney', 'HVAC contractor', 'roofing contractor',
  'real estate agent', 'accountant', 'plastic surgeon', 'orthodontist',
  'electrician', 'plumber',
];
const MID_VALUE = [
  'restaurant', 'hair salon', 'nail salon', 'gym', 'auto repair',
  'mechanic', 'cleaning service', 'landscaping', 'veterinarian',
];

// ── Main scorer ───────────────────────────────────────────────────────────────

/**
 * Score a single lead.
 * @returns {{ score: number, tier: 'A'|'B'|'C'|'D', breakdown: object }}
 */
function scoreLead(lead, weights = {}) {
  const W = {
    hasPhone:     15,
    hasEmail:     15,
    hasAddress:   10,
    noWebsite:    20,
    noSsl:        10,
    ratingHigh:   20,
    ratingMid:    15,
    ratingLow:    10,
    ratingBasic:   5,
    noRating:      8,
    manyReviews:   5,
    someReviews:   3,
    highCategory: 10,
    midCategory:   7,
    baseCategory:  5,
    ...weights,
  };

  const breakdown = {};
  let score = 0;

  // ── Contact data ──────────────────────────────────────────────────────────
  if (lead.phone && lead.phone.trim()) {
    score += W.hasPhone;
    breakdown.phone = `+${W.hasPhone} (has phone)`;
  }
  if (lead.email && lead.email.trim()) {
    score += W.hasEmail;
    breakdown.email = `+${W.hasEmail} (has email)`;
  }
  if (lead.address && lead.address.trim()) {
    score += W.hasAddress;
    breakdown.address = `+${W.hasAddress} (has address)`;
  }

  // ── Website status ────────────────────────────────────────────────────────
  const hasWebsite = lead.website || lead.has_website === 'Yes';
  if (!hasWebsite) {
    score += W.noWebsite;
    breakdown.website = `+${W.noWebsite} (no website — prime target)`;
  } else if (lead.website && !lead.website.startsWith('https://')) {
    score += W.noSsl;
    breakdown.website = `+${W.noSsl} (has site but no SSL)`;
  }

  // ── Rating ────────────────────────────────────────────────────────────────
  const rating = parseFloat(lead.rating);
  if (!isNaN(rating)) {
    if (rating >= 4.5) {
      score += W.ratingHigh;
      breakdown.rating = `+${W.ratingHigh} (rating ${rating} — excellent)`;
    } else if (rating >= 4.0) {
      score += W.ratingMid;
      breakdown.rating = `+${W.ratingMid} (rating ${rating} — good)`;
    } else if (rating >= 3.5) {
      score += W.ratingLow;
      breakdown.rating = `+${W.ratingLow} (rating ${rating} — average)`;
    } else {
      score += W.ratingBasic;
      breakdown.rating = `+${W.ratingBasic} (rating ${rating} — below average)`;
    }
  } else {
    score += W.noRating;
    breakdown.rating = `+${W.noRating} (no rating — unknown)`;
  }

  // ── Review count ──────────────────────────────────────────────────────────
  const reviews = parseInt((lead.review_count || '0').replace(/,/g, ''), 10);
  if (reviews > 50) {
    score += W.manyReviews;
    breakdown.reviews = `+${W.manyReviews} (${reviews} reviews — established)`;
  } else if (reviews >= 10) {
    score += W.someReviews;
    breakdown.reviews = `+${W.someReviews} (${reviews} reviews)`;
  }

  // ── Category value ────────────────────────────────────────────────────────
  const cat = (lead.category || '').toLowerCase();
  if (HIGH_VALUE.some(c => cat.includes(c.toLowerCase()))) {
    score += W.highCategory;
    breakdown.category = `+${W.highCategory} (high-value category)`;
  } else if (MID_VALUE.some(c => cat.includes(c.toLowerCase()))) {
    score += W.midCategory;
    breakdown.category = `+${W.midCategory} (mid-value category)`;
  } else {
    score += W.baseCategory;
    breakdown.category = `+${W.baseCategory} (standard category)`;
  }

  // ── Penalizers ────────────────────────────────────────────────────────────
  if (!lead.phone && !lead.email) {
    score -= 10;
    breakdown.noContact = '-10 (no phone or email)';
  }
  const name = lead.name || '';
  if (name.length < 3 || /^(business|company|store|shop)$/i.test(name)) {
    score -= 5;
    breakdown.badName = '-5 (generic/short name)';
  }

  // ── Final score ───────────────────────────────────────────────────────────
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    tier:      getTier(score),
    grade:     getGrade(score),
    breakdown,
    priority:  getPriority(lead),
  };
}

/**
 * Score an entire leads array and return sorted results.
 * Adds score, tier, and grade fields to each lead.
 */
function scoreLeads(leads, weights = {}) {
  return leads
    .map(lead => ({ ...lead, ...scoreLead(lead, weights) }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Get top N leads by score.
 */
function topLeads(leads, n = 50, weights = {}) {
  return scoreLeads(leads, weights).slice(0, n);
}

/**
 * Segment leads by tier.
 * Returns { A: [], B: [], C: [], D: [] }
 */
function segmentByTier(leads, weights = {}) {
  const scored = scoreLeads(leads, weights);
  return {
    A: scored.filter(l => l.tier === 'A'),
    B: scored.filter(l => l.tier === 'B'),
    C: scored.filter(l => l.tier === 'C'),
    D: scored.filter(l => l.tier === 'D'),
  };
}

// ── Tier / grade helpers ──────────────────────────────────────────────────────

function getTier(score) {
  if (score >= 75) return 'A';
  if (score >= 55) return 'B';
  if (score >= 35) return 'C';
  return 'D';
}

function getGrade(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'A-';
  if (score >= 65) return 'B+';
  if (score >= 55) return 'B';
  if (score >= 45) return 'B-';
  if (score >= 35) return 'C';
  return 'D';
}

function getPriority(lead) {
  // Special high-priority conditions
  if (lead.has_website !== 'Yes' && lead.phone && lead.email) return 'HOT';
  if (lead.has_website !== 'Yes' && (lead.phone || lead.email)) return 'WARM';
  if (lead.has_website === 'Yes' && lead.email) return 'NURTURE';
  return 'COLD';
}

/**
 * Get score stats for a leads array.
 */
function getScoreStats(leads) {
  if (!leads.length) return null;
  const scored = leads.map(l => l.score || scoreLead(l).score);
  const avg    = Math.round(scored.reduce((a, b) => a + b, 0) / scored.length);
  const tiers  = segmentByTier(leads);
  return {
    avg,
    max: Math.max(...scored),
    min: Math.min(...scored),
    tiers: { A: tiers.A.length, B: tiers.B.length, C: tiers.C.length, D: tiers.D.length },
    hot:   leads.filter(l => getPriority(l) === 'HOT').length,
    warm:  leads.filter(l => getPriority(l) === 'WARM').length,
  };
}

module.exports = { scoreLead, scoreLeads, topLeads, segmentByTier, getScoreStats, HIGH_VALUE, MID_VALUE };

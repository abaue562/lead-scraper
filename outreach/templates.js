'use strict';

/**
 * Outreach Template Engine
 *
 * Variable substitution for email/SMS templates.
 * Variables use {{double_braces}} syntax.
 *
 * Built-in variables:
 *   {{business_name}}   — the business name
 *   {{first_name}}      — owner first name (guessed from business name if not available)
 *   {{category}}        — business type (plumber, dentist, etc.)
 *   {{city}}            — city extracted from address
 *   {{phone}}           — phone number
 *   {{website}}         — website URL
 *   {{rating}}          — Google rating
 *   {{sender_name}}     — your name
 *   {{sender_company}}  — your company
 *   {{sender_phone}}    — your phone
 *   {{sender_email}}    — your email
 *   {{unsubscribe_link}}— unsubscribe URL
 */

// ── Default template library ──────────────────────────────────────────────────

const DEFAULT_TEMPLATES = {
  email: {
    'no_website_outreach': {
      name:    'No Website Outreach',
      subject: 'Quick question about {{business_name}}',
      body: `Hi {{first_name}},

I noticed {{business_name}} doesn't have a website yet — in {{city}}, most of your competitors are already online and getting leads from Google.

I build affordable websites for local {{category}}s that are designed to bring in new customers. Here's what I can do for you:

• A professional site that ranks on Google for "{{category}} near me"
• Online booking / contact form so customers can reach you 24/7
• Mobile-friendly design — 80% of searches happen on phones
• Setup in under 2 weeks, starting at $499

I've helped several businesses in your area get more customers through their websites. If you're interested, I'd love to show you some examples.

Can I send you a quick demo?

{{sender_name}}
{{sender_company}}
{{sender_phone}}`,
    },

    'review_outreach': {
      name:    'Review Building Outreach',
      subject: 'Help {{business_name}} get more 5-star reviews',
      body: `Hi {{first_name}},

{{business_name}} has a {{rating}}-star rating on Google — that's great, and you could use it to get even more customers.

Businesses with 20+ reviews get 3x more clicks than those with fewer. I help local {{category}}s build their review count quickly and legitimately.

My service sends automated review requests to your customers right after each job, when they're most likely to leave a positive review. Most of my clients go from 10 to 50+ reviews in 60 days.

Would you like to see how it works? No commitment — I'll just walk you through it.

{{sender_name}}
{{sender_phone}}`,
    },

    'seo_outreach': {
      name:    'SEO / Google Ranking Outreach',
      subject: 'Is {{business_name}} showing up on Google Maps?',
      body: `Hi {{first_name}},

I searched for "{{category}} in {{city}}" on Google and noticed {{business_name}} isn't showing up in the top 3 results — meaning your competitors are getting those calls instead of you.

I specialize in Google Maps optimization for local businesses. My clients typically see results within 30–60 days:

✓ Show up in the "Map Pack" (the 3 businesses Google shows first)
✓ More phone calls and website visits from local searches
✓ No long-term contract

I'd love to give you a free audit showing exactly where you stand and what it would take to rank you higher.

Interested?

{{sender_name}}
{{sender_company}}
{{sender_phone}}`,
    },

    'follow_up': {
      name:    'Follow-Up (Day 3)',
      subject: 'Re: {{business_name}}',
      body: `Hi {{first_name}},

Just following up on my last email — I know things get busy.

I'm still happy to put together that free audit for {{business_name}}. Takes about 10 minutes on a call and there's no obligation.

If timing isn't right, just let me know and I'll check back in a few months.

{{sender_name}}
{{sender_phone}}`,
    },
  },

  sms: {
    'no_website_intro': {
      name: 'No Website — SMS Intro',
      body: `Hi {{first_name}}, this is {{sender_name}} from {{sender_company}}. I noticed {{business_name}} doesn't have a website yet. I help local {{category}}s get online and get more customers. Can I send you some info? Reply STOP to opt out.`,
    },

    'review_intro': {
      name: 'Review Building — SMS',
      body: `Hi {{first_name}}, {{sender_name}} here. {{business_name}} has great reviews — I help businesses like yours get even more 5-star reviews automatically. Worth a 5-min chat? Reply STOP to opt out.`,
    },

    'follow_up_sms': {
      name: 'SMS Follow-Up',
      body: `Hey {{first_name}}, just wanted to follow up on my message about {{business_name}}. Do you have 5 minutes this week? — {{sender_name}} {{sender_phone}}`,
    },
  },
};

// ── Template engine ───────────────────────────────────────────────────────────

class TemplateEngine {
  constructor() {
    this.templates    = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));
    this.customFields = {};   // user-defined extra variables
  }

  // ── Render a template ─────────────────────────────────────────────────────

  /**
   * Render a template with lead data and sender info.
   *
   * @param {string} templateId — key from this.templates.email or .sms
   * @param {string} channel    — 'email' | 'sms'
   * @param {object} lead       — lead data object
   * @param {object} sender     — { name, company, phone, email }
   *
   * @returns {{ subject?: string, body: string }}
   */
  render(templateId, channel, lead, sender = {}) {
    const tmpl = this.templates[channel]?.[templateId];
    if (!tmpl) throw new Error(`Template not found: ${channel}/${templateId}`);

    const vars = this._buildVars(lead, sender);

    return {
      subject: tmpl.subject ? this._interpolate(tmpl.subject, vars) : undefined,
      body:    this._interpolate(tmpl.body,    vars),
      templateId,
      channel,
    };
  }

  // ── Add or update a template ──────────────────────────────────────────────

  saveTemplate(channel, id, template) {
    if (!this.templates[channel]) this.templates[channel] = {};
    this.templates[channel][id] = template;
  }

  getTemplates(channel) {
    return this.templates[channel] || {};
  }

  listAll() {
    const out = [];
    for (const [channel, tmpls] of Object.entries(this.templates)) {
      for (const [id, tmpl] of Object.entries(tmpls)) {
        out.push({ channel, id, name: tmpl.name });
      }
    }
    return out;
  }

  // ── Preview with placeholder data ─────────────────────────────────────────

  preview(templateId, channel) {
    return this.render(templateId, channel, {
      name:     'ABC Plumbing Co.',
      category: 'plumber',
      address:  '123 Main St, Austin, TX 78701',
      phone:    '(512) 555-0123',
      website:  '',
      rating:   '4.2',
    }, {
      name:    'Your Name',
      company: 'Your Company',
      phone:   '(555) 000-0000',
      email:   'you@example.com',
    });
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _buildVars(lead, sender) {
    const city = extractCity(lead.address);

    return {
      business_name:    lead.name           || 'Your Business',
      first_name:       guessFirstName(lead.name) || 'there',
      category:         lead.category       || 'business',
      city:             city                || 'your area',
      phone:            lead.phone          || '',
      website:          lead.website        || '',
      rating:           lead.rating         || '4.5',
      address:          lead.address        || '',

      sender_name:      sender.name         || 'Your Name',
      sender_company:   sender.company      || '',
      sender_phone:     sender.phone        || '',
      sender_email:     sender.email        || '',
      unsubscribe_link: sender.unsubLink    || 'Reply STOP to unsubscribe',

      ...this.customFields,
      ...(lead.customVars || {}),
    };
  }

  _interpolate(text, vars) {
    return text.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const val = vars[key.trim()];
      return val !== undefined ? val : match;   // leave unresolved vars as-is
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractCity(address) {
  if (!address) return '';
  // "123 Main St, Austin, TX 78701" → "Austin"
  const parts = address.split(',');
  if (parts.length >= 2) return parts[parts.length - 2].trim();
  return '';
}

function guessFirstName(businessName) {
  if (!businessName) return '';

  // "John's Plumbing" → "John"
  const apostrophe = businessName.match(/^([A-Z][a-z]+)'s/);
  if (apostrophe) return apostrophe[1];

  // "John Smith Plumbing" → "John" (if first word looks like a name)
  const firstWord = businessName.split(/\s+/)[0];
  if (/^[A-Z][a-z]{2,}$/.test(firstWord) &&
      !['The', 'Best', 'Top', 'Pro', 'All', 'City', 'Local'].includes(firstWord)) {
    return firstWord;
  }

  return 'there';
}

module.exports = { TemplateEngine, DEFAULT_TEMPLATES };

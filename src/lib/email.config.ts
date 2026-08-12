// src/lib/email.config.ts
// The only file you edit per client for email setup.
// All API routes (contact.ts, lead.ts, subscribe.ts) read from here.

/**
 * Alloy's copy of every form notification — the reason an Alloy inbox received
 * one of everything this site takes. Empty once the site has somewhere in Slack
 * to log submissions, which is a better record anyway; kept until then, so
 * monitoring is never dropped silently.
 */
const ALLOY_MONITORING: string[] = Boolean(
  import.meta.env.FORM_SLACK_WEBHOOK || import.meta.env.FORM_ALERT_SLACK_URL
)
  ? []
  : ['skyler@alloygp.co'];

export const EMAIL_CONFIG = {

  brand: {
    name: 'German Car Specialists',
    url:  'https://mygermancarsa.com',
    team: 'Skyler',
  },

  // Both addresses must be from a domain verified in Resend
  from: {
    notifications: 'German Car Specialists <notifications@mygermancarsa.com>',
    hello:         'German Car Specialists <hello@mygermancarsa.com>',
  },

  // Everyone here gets a copy of every form submission
  notify: [
    'customer@mygermancarsa.com',
    'contact@mygermancarsa.com',
    ...ALLOY_MONITORING,
  ],

  mailchimp: {
    enabled:     true,      // set false if client has no Mailchimp
    defaultTags: ['website-lead'],
  },

  copy: {
    contact: {
      confirmSubject: 'We received your message',
      confirmBody: (name: string, _siteUrl: string) =>
        `<p>Hi ${name},</p>
        <p>Thanks for reaching out. We typically respond within 1 business day.</p>
        <p>— Skyler</p>`,
    },
    lead: {
      confirmSubject: "Thanks — we'll be in touch",
      confirmBody: (name: string, company: string, siteUrl: string) =>
        `<p>Hi ${name},</p>
        <p>We received your info and someone will reach out shortly to discuss what ${company || 'your business'} needs.</p>
        <p>— Skyler</p>`,
    },
    subscribe: {
      confirmSubject: "You're on the list",
      confirmBody: (name: string) =>
        `<p>Hi${name ? ` ${name}` : ''},</p>
        <p>Thanks for subscribing. We'll be in touch soon.</p>
        <p>— Skyler</p>`,
    },
  },
};

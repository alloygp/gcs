/**
 * Verifies the form Slack log + failure alerting, with no network and no keys.
 *
 * Run it after wiring a client site, and before trusting that a site has
 * stopped emailing Alloy:  node scripts/test-form-alert.ts   (Node >= 22.6)
 *
 * It stubs global fetch and asserts WHICH destination each path hits, which is
 * the part that actually matters here: a site with a Slack webhook must never
 * send a failure email, and a site without one must never go silent.
 */
import { sendWithAlert, notifySubmission, fieldsFromFormData } from '../src/lib/form-alert.ts';

const SLACK = 'https://hooks.slack.com/services/T/B/xxx';
const ALERT_EMAIL = { apiKey: 're_test', to: 'admin@alloygp.co', from: 'x@y.co' };

let calls: string[] = [];
(globalThis as any).fetch = async (url: string) => {
  calls.push(String(url));
  return { ok: true, status: 200, json: async () => ({}) } as any;
};

const failingSend = async () => { throw new Error('Resend is down'); };
const hosts = () => calls.map((u) => new URL(u).host);
let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}`);
  if (!cond) failures++;
}

// 1. Slack configured → failure alerts Slack ONLY, never the email inbox.
calls = [];
try {
  await sendWithAlert(
    { client: 'Acme', formName: 'Contact form', slackWebhookUrl: SLACK, alertEmail: ALERT_EMAIL },
    failingSend,
  );
} catch { /* expected: re-thrown */ }
check('slack configured → posts to Slack', hosts().includes('hooks.slack.com'));
check('slack configured → does NOT email admin@alloygp.co', !hosts().includes('api.resend.com'));

// 2. No Slack anywhere → the email fallback must still fire, or failures are silent.
delete process.env.FORM_SLACK_WEBHOOK;
delete process.env.FORM_ALERT_SLACK_URL;
calls = [];
try {
  await sendWithAlert(
    { client: 'Acme', formName: 'Contact form', alertEmail: ALERT_EMAIL },
    failingSend,
  );
} catch { /* expected */ }
check('no slack → falls back to email', hosts().includes('api.resend.com'));

// 3. Env-only Slack config also suppresses the email.
process.env.FORM_SLACK_WEBHOOK = SLACK;
calls = [];
try {
  await sendWithAlert({ client: 'Acme', alertEmail: ALERT_EMAIL }, failingSend);
} catch { /* expected */ }
check('slack via env → does NOT email', !hosts().includes('api.resend.com'));
check('slack via env → still POSTS to Slack (no silent gap)', hosts().includes('hooks.slack.com'));
delete process.env.FORM_SLACK_WEBHOOK;

// 4. An error-shaped response (Resend returns {error} without throwing) alerts too.
calls = [];
try {
  await sendWithAlert(
    { client: 'Acme', slackWebhookUrl: SLACK, alertEmail: ALERT_EMAIL },
    async () => ({ error: { message: 'domain not verified', name: 'validation_error' } }),
  );
} catch { /* expected */ }
check('error-shaped response alerts Slack', hosts().includes('hooks.slack.com'));
check('error-shaped response does NOT email', !hosts().includes('api.resend.com'));

// 5. notifySubmission never throws, even with a webhook that rejects.
(globalThis as any).fetch = async () => { throw new Error('network gone'); };
let threw = false;
try {
  await notifySubmission({ client: 'Acme', slackWebhookUrl: SLACK, fields: [['Name', 'A']] });
} catch { threw = true; }
check('notifySubmission swallows a dead webhook', !threw);

// 6. No webhook → no throw, no call.
calls = [];
(globalThis as any).fetch = async (url: string) => { calls.push(String(url)); return { ok: true } as any; };
await notifySubmission({ client: 'Acme', fields: [['Name', 'A']] });
check('notifySubmission with no webhook is a no-op', calls.length === 0);

// 7. Payload shape: delivered vs not.
let bodies: any[] = [];
(globalThis as any).fetch = async (_u: string, o: any) => { bodies.push(JSON.parse(o.body)); return { ok: true } as any; };
await notifySubmission({ client: 'Acme', slackWebhookUrl: SLACK, route: 'Proposal', fields: [['Name', 'A']] });
await notifySubmission({ client: 'Acme', slackWebhookUrl: SLACK, route: 'Proposal', delivered: false, fields: [['Name', 'A']] });
check('delivered post is marked 📬', bodies[0].text.startsWith('📬'));
check('undelivered post is marked ⚠️', bodies[1].text.startsWith('⚠️'));
check('undelivered post says it is the only record',
  JSON.stringify(bodies[1].blocks).includes('only record of the submission'));
check('field values are rendered', JSON.stringify(bodies[0].blocks).includes('*Name:* A'));

// 8. Long values are truncated so Slack can't reject the payload.
bodies = [];
await notifySubmission({ client: 'Acme', slackWebhookUrl: SLACK, fields: [['Message', 'x'.repeat(5000)]] });
check('long values truncated', JSON.stringify(bodies[0].blocks).includes('…'));

// 9. fieldsFromFormData: honeypot + machine fields out, real content in.
const fd = new FormData();
fd.set('name', 'Dana Reyes');
fd.set('firstName', 'Dana');
fd.set('website', 'http://spam.example');        // honeypot
fd.set('company_website', 'http://spam.example'); // honeypot (other convention)
fd.set('fieldsJson', '[{"label":"Units"}]');
fd.set('audience', 'proposal');
fd.set('blank', '   ');
const rows = fieldsFromFormData(fd);
const keys = rows.map(([k]) => k);
check('keeps real fields', keys.includes('Name'));
check('camelCase labelled', keys.includes('First name'));
check('drops both honeypots', !keys.includes('Website') && !keys.includes('Company website'));
check('drops machine fields', !keys.includes('Fieldsjson') && !keys.includes('Audience'));
check('drops whitespace-only values', !keys.includes('Blank'));

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);

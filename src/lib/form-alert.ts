// src/lib/form-alert.ts
//
// Slack log + failure alerting for client form handlers.
//
// Two jobs:
//
//   notifySubmission()  Posts EVERY submission the site takes to the client's
//                       Slack channel, so the channel is a running record of
//                       what the site produced rather than only what broke.
//                       Every form endpoint calls it — see src/pages/api.
//   sendWithAlert()     Alerts when a notification email never sends at all.
//
// Both go to the same channel: FORM_SLACK_WEBHOOK, the client's own, falling
// back to the shared FORM_ALERT_SLACK_URL. A Slack incoming webhook is bound to
// one channel at creation and the payload cannot redirect it, so a per-client
// channel means a per-client webhook.
//
// ── Failure alerting, in detail ────────────────────────────────────────
//
// The Resend→Slack webhook already catches DELIVERY-side problems (bounced,
// complained, delayed, failed) — those happen AFTER Resend accepts the email.
// This helper covers the OTHER failure mode: when the send call to Resend
// never succeeds at all (bad API key, Resend outage, network error, malformed
// request). In that case no webhook event is ever created, so without this the
// failure is completely silent.
//
// Usage: wrap your existing resend.emails.send(...) call with sendWithAlert().
// On any thrown error OR error-shaped response, it alerts and then re-throws, so
// your handler logic is unchanged. Slack gets the alert; the email fallback fires
// only when no Slack webhook is configured — see alertFailure().
//
// In this starter, all three API routes (contact/lead/subscribe) read env via
// import.meta.env, so they pass slackWebhookUrl explicitly. The process.env
// defaults in slackUrl() remain as a fallback for other runtimes.

/**
 * The one place a Slack destination is resolved. Every path through this file
 * uses it, so there is no configuration where one channel sees a webhook and
 * another doesn't — the failure alert, the submission log, and the
 * email-fallback gate all agree by construction.
 */
function slackUrl(opts: SendAlertOptions): string | undefined {
  return (
    opts.slackWebhookUrl ??
    process.env.FORM_SLACK_WEBHOOK ??
    process.env.FORM_ALERT_SLACK_URL
  );
}

interface SendAlertOptions {
  client: string;           // e.g. "Acme Co" — shows in the alert
  formName?: string;        // e.g. "Contact form" — optional context
  // Defaults to FORM_SLACK_WEBHOOK, then FORM_ALERT_SLACK_URL — see slackUrl().
  slackWebhookUrl?: string;
  // Last-resort failure alert, used ONLY when no Slack webhook is configured —
  // with one, the channel gets the alert and this inbox is never emailed. Sent
  // via Resend's REST API directly (no SDK). Note: a TOTAL Resend outage/auth
  // failure blocks this email too, so Slack is the only channel guaranteed to
  // survive that case — which is the other reason to prefer it.
  alertEmail?: {
    apiKey: string;
    to: string | string[];
    from: string;
  };
}

/**
 * Post a submission to the client's Slack channel.
 *
 * Pass `delivered: false` when whatever was supposed to receive the submission
 * didn't — Resend refused the send, Mailchimp rejected the add. The post still
 * happens, and that is the point: it is then the only surviving copy of what
 * someone typed, so suppressing it would lose the enquiry entirely. The status
 * line says as much rather than implying an inbox has it.
 *
 * Never throws: notification must not be able to break a submission that has
 * already been delivered.
 */
export async function notifySubmission(
  opts: SendAlertOptions & {
    fields?: Array<[string, string]>;
    route?: string;
    delivered?: boolean;
  }
): Promise<void> {
  const url = slackUrl(opts);
  if (!url) return;

  const delivered = opts.delivered !== false;
  const route = opts.route ?? 'Form';
  const heading = `${delivered ? '📬' : '⚠️'} ${route} — ${opts.client}`;

  const rows = (opts.fields ?? [])
    .filter(([, v]) => v)
    .map(([k, v]) => `*${k}:* ${v.length > 220 ? v.slice(0, 220) + '…' : v}`)
    .join('\n');

  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: heading } },
  ];
  if (rows) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: rows } });
  }
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: delivered
          ? `${opts.formName ?? 'Website form'} · delivered`
          : `${opts.formName ?? 'Website form'} · *not delivered* — this message is ` +
            `the only record of the submission`,
      },
    ],
  });

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: heading, blocks }),
    });
  } catch (err) {
    console.error('Failed to post submission notification to Slack:', err);
  }
}

/**
 * Honeypot and machine-only field names, never worth showing in Slack.
 * `website` is the starter's honeypot (see lead.ts); `company_website` is the
 * name some client sites use. `fieldsJson` is the multi-step form's raw payload,
 * which lead.ts unpacks into real labels itself.
 */
const NON_CONTENT_FIELDS = ['website', 'company_website', 'fieldsJson', 'audience'];

/**
 * Turn a raw submission into labelled rows for notifySubmission().
 *
 * For endpoints whose fields vary by whichever form on the site posted to them:
 * everything the submitter actually typed gets logged, so a client-specific
 * field added to a form later shows up in Slack without anyone remembering to
 * wire it. Endpoints with their own field map (see lead.ts) build the list
 * themselves so the order matches the email.
 */
export function fieldsFromFormData(
  data: FormData,
  ignore: string[] = []
): Array<[string, string]> {
  const skip = new Set([...NON_CONTENT_FIELDS, ...ignore]);
  const rows: Array<[string, string]> = [];

  for (const [key, value] of data.entries()) {
    // File uploads have no meaningful text form — skip rather than print "[object File]".
    if (skip.has(key) || typeof value !== 'string') continue;
    const text = value.trim();
    if (text) rows.push([labelize(key), text]);
  }
  return rows;
}

/** `first_name` / `firstName` → `First name`, for Slack field labels. */
function labelize(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Post a submission-failure message to Slack. Never throws — alerting must not
// break the request flow.
async function postFailureToSlack(
  opts: SendAlertOptions,
  errorMessage: string,
  detail?: string
): Promise<void> {
  const url = slackUrl(opts);
  if (!url) {
    // Not fatal: alertFailure() sends the email fallback in exactly this case.
    console.error('No Slack webhook configured — cannot post form failure alert');
    return;
  }

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `🚨 Form send failed — ${opts.client}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Client:*\n${opts.client}` },
        { type: 'mrkdwn', text: `*Form:*\n${opts.formName ?? '—'}` },
        { type: 'mrkdwn', text: `*Error:*\n${errorMessage}` },
        { type: 'mrkdwn', text: `*When:*\n${new Date().toISOString()}` },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text:
            'Submission-side failure: the email was never accepted by Resend, ' +
            'so no delivery webhook will fire for this.' +
            (detail ? `\n\`${detail}\`` : ''),
        },
      ],
    },
  ];

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 Form send failed — ${opts.client}: ${errorMessage}`,
        blocks,
      }),
    });
  } catch (err) {
    // Last resort: log it. Don't let alerting throw inside the request.
    console.error('Failed to post form-failure alert to Slack:', err);
  }
}

// Email fallback alert via Resend's REST API. Never throws.
async function postFailureToEmail(
  opts: SendAlertOptions,
  errorMessage: string,
  detail?: string
): Promise<void> {
  const cfg = opts.alertEmail;
  if (!cfg || !cfg.apiKey) return;
  const to = Array.isArray(cfg.to) ? cfg.to : [cfg.to];
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: cfg.from,
        to,
        subject: `🚨 Form send failed — ${opts.client}${opts.formName ? ` (${opts.formName})` : ''}`,
        html:
          `<h2 style="color:#c01452">A form submission failed to send</h2>` +
          `<p><strong>Client:</strong> ${opts.client}</p>` +
          `<p><strong>Form:</strong> ${opts.formName ?? '—'}</p>` +
          `<p><strong>Error:</strong> ${errorMessage}</p>` +
          (detail ? `<p><strong>Detail:</strong> ${detail}</p>` : '') +
          `<p><strong>When:</strong> ${new Date().toISOString()}</p>` +
          `<hr><p style="color:#888;font-size:13px">A visitor submitted a form but the notification email could not be sent — the lead may be lost. ` +
          `Check the Resend dashboard and Vercel function logs. If this repeats, the API key, sending domain, or a recipient address is likely the cause.</p>`,
      }),
    });
  } catch (err) {
    console.error('Failed to post form-failure alert email:', err);
  }
}

/**
 * Alert on a failure. Never throws.
 *
 * The email is a LAST RESORT, not a second copy: it fires only when no Slack
 * channel is configured at all. Once a site has FORM_SLACK_WEBHOOK the channel
 * carries both the failure and the submission itself, and an email as well is
 * just noise in an Alloy inbox — which is what `alertsTo` had become.
 *
 * The gate is deliberately "is a webhook configured", not "did the Slack post
 * succeed": a site with no webhook is never left silent, and a site with one
 * never emails. Nothing here can be turned off by forgetting an env var.
 */
async function alertFailure(
  opts: SendAlertOptions,
  errorMessage: string,
  detail?: string
): Promise<void> {
  const slackConfigured = Boolean(slackUrl(opts));

  await Promise.all([
    postFailureToSlack(opts, errorMessage, detail),
    slackConfigured
      ? Promise.resolve()
      : postFailureToEmail(opts, errorMessage, detail),
  ]);
}

/**
 * Wrap a Resend send call. Pass a function that performs the send and returns
 * the Resend SDK result. If the send throws, or returns an `{ error }` shape,
 * we fire every alert channel and then re-throw so the caller's existing error
 * handling (e.g. returning a 500 to the form) still runs unchanged.
 *
 * Example:
 *   const result = await sendWithAlert(
 *     { client: "Acme Co", formName: "Contact form" },
 *     () => resend.emails.send({ from, to, subject, html })
 *   );
 */
export async function sendWithAlert<T extends { error?: unknown }>(
  opts: SendAlertOptions,
  send: () => Promise<T>
): Promise<T> {
  let result: T;
  try {
    result = await send();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await alertFailure(opts, message);
    throw err; // preserve existing behavior
  }

  // The Resend SDK returns { data, error } rather than throwing on some errors.
  if (result && result.error) {
    const errObj = result.error as { message?: string; name?: string };
    const message = errObj.message ?? 'Unknown Resend error';
    await alertFailure(opts, message, errObj.name);
    // Re-throw so callers that only check try/catch still see the failure.
    throw new Error(`Resend send failed: ${message}`);
  }

  return result;
}

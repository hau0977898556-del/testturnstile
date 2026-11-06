// notify-tunnel.js
// POSTs tunnel URL to NOTIFY_WEBHOOK so your server knows the new endpoint.
// If NOTIFY_WEBHOOK is not set, this script is never called — tunnel is used directly.

const tunnelUrl  = process.argv[2];
const webhookUrl = process.env.NOTIFY_WEBHOOK;
const secret     = process.env.NOTIFY_SECRET;

if (!tunnelUrl) {
  console.error("[Notify] No tunnel URL provided");
  process.exit(1);
}

// Should never reach here without webhook (workflow checks first), but guard anyway
if (!webhookUrl) {
  console.log("[Notify] No NOTIFY_WEBHOOK — skipping. Use tunnel directly:", tunnelUrl);
  process.exit(0);
}

const payload = JSON.stringify({
  tunnelUrl,
  apiEndpoint:    `${tunnelUrl}/solve-turnstile`,
  healthEndpoint: `${tunnelUrl}/health`,
  timestamp:      new Date().toISOString(),
  ...(secret && { secret }),
});

fetch(webhookUrl, {
  method:  "POST",
  headers: { "Content-Type": "application/json" },
  body:    payload,
})
  .then(async (res) => {
    const body = await res.text();
    console.log(`[Notify] ${res.status} — ${body}`);
  })
  .catch((err) => {
    // Non-fatal — workflow continues regardless
    console.error("[Notify] Failed:", err.message);
  });

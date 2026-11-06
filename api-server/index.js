const express = require("express");
const { requestSolve, getAvailableSolvers, isConnected } = require("./token-client");

const app = express();
app.use(express.json());

const PORT               = process.env.PORT || 3000;
const API_KEY            = process.env.API_KEY;
const CONFIGURED_SITEKEY = process.env.SITEKEY;
const CONFIGURED_DOMAIN  = process.env.DOMAIN;

if (!API_KEY) {
  console.error("[FATAL] API_KEY env not set (SOLVER_API_KEY secret)");
  process.exit(1);
}

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireApiKey(req, res, next) {
  const key = req.headers["x-api-key"] || req.body?.apiKey;
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }
  next();
}

// ── POST /solve-turnstile ─────────────────────────────────────────────────────
app.post("/solve-turnstile", requireApiKey, async (req, res) => {
  const { domain, sitekey, proxy, fields } = req.body;

  if (!domain || !sitekey) {
    return res.status(400).json({ error: "Missing required fields: domain, sitekey" });
  }
  if (sitekey !== CONFIGURED_SITEKEY) {
    return res.status(400).json({
      error: `Solver configured for sitekey: ${CONFIGURED_SITEKEY}`,
      hint:  "Spin up a separate workflow for different sitekeys",
    });
  }
  if (domain !== CONFIGURED_DOMAIN) {
    return res.status(400).json({
      error: `Solver configured for domain: ${CONFIGURED_DOMAIN}`,
    });
  }

  try {
    const result = await requestSolve({
      proxyUrl:  proxy || "",
      userAgent: req.headers["user-agent"] || "",
      fields:    fields || {},
    });

    if (!result.token) {
      return res.status(502).json({ error: "Solver returned no token (challenge failed)" });
    }

    return res.json({
      success:  true,
      token:    result.token,
      proxy:    result.proxy,
      solvedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[solve] error:", err.message);
    return res.status(503).json({ error: err.message });
  }
});

// ── GET /health ───────────────────────────────────────────────────────────────
app.get("/health", async (req, res) => {
  let solvers = 0;
  try { solvers = await getAvailableSolvers(); } catch (_) {}

  res.json({
    status:              "ok",
    configuredSitekey:   CONFIGURED_SITEKEY,
    configuredDomain:    CONFIGURED_DOMAIN,
    availableSolvers:    solvers,
    tokenServerConnected: isConnected(),
    uptime:              Math.floor(process.uptime()),
  });
});

// ── GET /solvers ──────────────────────────────────────────────────────────────
app.get("/solvers", requireApiKey, async (req, res) => {
  try {
    const count = await getAvailableSolvers();
    res.json({ availableSolvers: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[API] Running on :${PORT}`);
  console.log(`[API] Domain: ${CONFIGURED_DOMAIN} | Sitekey: ${CONFIGURED_SITEKEY}`);
  console.log(`[API] Token server: ${process.env.TOKEN_SERVER_HOST}`);
});

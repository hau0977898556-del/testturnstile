// token-client.js
// WebSocket client for Lucrehulk token server.
//
// BUG FIX #5: clientbound packet-0 (token response) has NO requester_id field.
// The token server routes responses back via socket — if one receiver socket
// sends concurrent requests, responses arrive in solve-completion order
// (not request order), making FIFO matching unreliable.
//
// Fix: spawn one dedicated WS connection per solve request (pool pattern).
// Each connection sends exactly one request and receives exactly one response.
// No cross-request ambiguity possible.

const WebSocket = require("ws");

const TOKEN_SERVER_HOST = process.env.TOKEN_SERVER_HOST || "ws://localhost:8080";
const SOLVE_TIMEOUT_MS  = 20_000;
const COUNT_TIMEOUT_MS  = 5_000;

// ── Packet builders ───────────────────────────────────────────────────────────

function buildSolveRequestPacket(proxyUrl, userAgent, fields) {
  const enc = new TextEncoder();
  const p   = [1];

  const proxyB = enc.encode(proxyUrl || "");
  p.push(proxyB.length, ...proxyB);

  const uaB = enc.encode(userAgent || "");
  p.push(uaB.length, ...uaB);

  for (const [name, value] of Object.entries(fields || {})) {
    const nb = enc.encode(name);
    const vb = enc.encode(String(value));
    p.push(nb.length, ...nb, vb.length, ...vb);
  }
  return Buffer.from(p);
}

function buildCountPacket() {
  return Buffer.from([3]);
}

function parseTokenPacket(buf) {
  const proxyLen = buf[1];
  const proxy    = buf.slice(2, 2 + proxyLen).toString("utf8");
  const token    = buf.length > 2 + proxyLen
    ? buf.slice(2 + proxyLen).toString("utf8")
    : undefined;
  return { proxy, token };
}

function parseCountPacket(buf) {
  return buf.readUInt32LE(1);
}

// ── Single-use connection (one request → one response) ────────────────────────

function requestSolveOnce({ proxyUrl, userAgent, fields }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(TOKEN_SERVER_HOST);

    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("Solve request timed out"));
    }, SOLVE_TIMEOUT_MS);

    ws.once("open", () => {
      ws.send(buildSolveRequestPacket(proxyUrl, userAgent, fields));
    });

    ws.on("message", (data) => {
      const buf    = Buffer.from(data);
      const header = buf[0];

      clearTimeout(timer);
      ws.close();

      if (header === 0) {
        resolve(parseTokenPacket(buf));
      } else if (header === 2) {
        reject(new Error("No solvers available"));
      } else {
        reject(new Error(`Unexpected header byte: ${header}`));
      }
    });

    ws.once("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`WS error: ${err.message}`));
    });

    ws.once("close", () => {
      clearTimeout(timer);
      // If neither message nor error fired, we closed before getting a response
    });
  });
}

// ── Shared connection for solver-count queries (lightweight) ──────────────────

class CountClient {
  constructor() {
    this._ws       = null;
    this._pending  = [];
    this._connected = false;
  }

  _connect() {
    if (this._ws) return;
    this._ws = new WebSocket(TOKEN_SERVER_HOST);

    this._ws.on("open", () => {
      this._connected = true;
      // Flush any queued count requests
      while (this._pending.length) this._flush();
    });

    this._ws.on("message", (data) => {
      const buf = Buffer.from(data);
      if (buf[0] === 3) {
        const cb = this._pending.shift();
        if (cb) cb.resolve(parseCountPacket(buf));
      }
    });

    this._ws.on("close", () => {
      this._connected = false;
      this._ws = null;
      // Fail all pending
      for (const cb of this._pending) cb.reject(new Error("Count WS closed"));
      this._pending = [];
    });

    this._ws.on("error", () => {
      this._ws = null;
      this._connected = false;
    });
  }

  _flush() {
    if (this._connected && this._ws) {
      this._ws.send(buildCountPacket());
    }
  }

  query() {
    return new Promise((resolve, reject) => {
      this._connect();
      const timer = setTimeout(() => {
        const idx = this._pending.findIndex(c => c._t === timer);
        if (idx !== -1) this._pending.splice(idx, 1);
        reject(new Error("Count query timed out"));
      }, COUNT_TIMEOUT_MS);

      this._pending.push({ resolve, reject, _t: timer });
      this._flush();
    });
  }

  isConnected() { return this._connected; }
}

// ── Exports ───────────────────────────────────────────────────────────────────

const _countClient = new CountClient();

module.exports = {
  requestSolve:        (opts) => requestSolveOnce(opts),
  getAvailableSolvers: ()     => _countClient.query(),
  isConnected:         ()     => _countClient.isConnected(),
};

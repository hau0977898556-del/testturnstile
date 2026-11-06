# Lucrehulk — GitHub Actions Setup

Chạy Cloudflare Turnstile Solver trên GitHub Actions `windows-latest` với Cloudflare Tunnel.

---

## Cấu trúc

```
.github/workflows/solver.yml   ← workflow chính
api-server/
  index.js                     ← Express API (POST /solve-turnstile)
  token-client.js              ← Per-request WS pool
  package.json
scripts/
  configure-extension.ps1      ← Ghi inject_config.txt + patch background.js
  send-key.ps1                 ← Gửi F7/F8/F9 keypress
  notify-tunnel.js             ← POST tunnel URL về server của mày
```

---

## Bugs đã fix (đối chiếu src + README repo thật)

| # | Bug | Phát hiện từ |
|---|-----|--------------|
| 1 | Token server `const PORT: u16 = 8080` hardcode trong src, không nhận CLI arg. Workflow cũ truyền `--port 9000` = ignored | `token-server/src/main.rs` |
| 2 | `browser_launcher main` có `loop { thread::sleep(1s) }` — vô hạn. Phải background `-PassThru`, không `-Wait` | `browser_launcher/src/main.rs` |
| 3 | F8/F9 gửi sau sleep cứng 3s — race condition với `handle_input_events()` thread. Fix: poll stdout cho đúng startup message | clicker + z-orderer `main.rs` |
| 4 | `background.js` dùng `String.raw\`\`` không phải string thường — regex cũ không match, paths không được patch | `proxy-extensions/cdp/background.js` |
| 5 | Clientbound token packet (header=0) không có `requester_id`. Nhiều request đồng thời trên 1 socket = không phân biệt được response nào của ai. Fix: 1 WS connection per solve request | `token-server/src/main.rs` protocol |
| 6 | **Startup order sai** — clicker + z-orderer phải start TRƯỚC khi browsers mở. Z-orderer snapshot pre-existing windows khi khởi động; nếu start sau browsers thì những windows đó vào pre-existing list → không bao giờ được track. README step order: `find_browsers → token server → clicker → z-orderer → browsers → F8 → F9 → F7` | README "Starting It Up" section |

---

## Startup order (đúng theo README)

```
1. find_browsers     → tạo browser_binaries.txt + profiles
2. token server      → ws://localhost:8080
3. turnstile-clicker → start process, chờ "Press F8..." message, CHƯA bấm F8
4. z-index-orderer   → start process, chờ "Press F7..." message, CHƯA bấm F9/F7
5. browser_launcher  → mở Chrome(s), z-orderer track từng window mới
6. wait 10s          → browsers load + register với token server
7. F8               → bật clicker
8. F9               → bật z-order enforcer
9. F7               → tắt new-page checker (xong load rồi)
```

---

## GitHub Secrets

| Secret | Mô tả |
|--------|-------|
| `SOLVER_API_KEY` | API key authenticate requests |
| `NOTIFY_WEBHOOK` | URL nhận tunnel URL mới |
| `NOTIFY_SECRET` | (optional) verify webhook |

---

## Trigger qua GitHub API

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/OWNER/REPO/actions/workflows/solver.yml/dispatches" \
  -d '{
    "ref": "main",
    "inputs": {
      "sitekey": "0x4AAAAAAAxxxxxxxxxxxxxxx",
      "domain": "example.com",
      "browser_count": "5"
    }
  }'
```

---

## API Usage

```http
POST /solve-turnstile
x-api-key: YOUR_API_KEY
Content-Type: application/json

{
  "domain": "example.com",
  "sitekey": "0x4AAAAAAAxxxxxxxxxxxxxxx",
  "proxy": "http://user:pass@host:port",
  "fields": { "action": "login", "cData": "abc123" }
}
```

```json
{
  "success": true,
  "token": "0.xxxxxxxx...",
  "proxy": "http://user:pass@host:port",
  "solvedAt": "2026-11-04T12:00:00.000Z"
}
```

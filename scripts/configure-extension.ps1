# configure-extension.ps1
# Writes inject_config.txt and patches background.js with correct file paths.

$workspace  = $env:WORKSPACE
$sitekey    = $env:SITEKEY

$harvesterPath = "$workspace\cf-turnstile-bypass\token-harvester\index.html"
$injectCfgPath = "$workspace\cf-turnstile-bypass\proxy-extensions\inject_config.txt"
$bgJsPath      = "$workspace\cf-turnstile-bypass\proxy-extensions\cdp\background.js"

# ── Write inject_config.txt ───────────────────────────────────────────────────
@"
SITEKEY=$sitekey
PROXY_CONNECT_TIMEOUT=5000
USE_PROXY_SOLVING=false
TOKEN_SERVER_HOST=ws://localhost:8080
"@ | Set-Content -Path $injectCfgPath -Encoding UTF8

Write-Host "[Setup] inject_config.txt written"
Write-Host "        SITEKEY=$sitekey"
Write-Host "        TOKEN_SERVER_HOST=ws://localhost:8080"

# ── Patch background.js ───────────────────────────────────────────────────────
# BUG FIX #4: actual format in background.js is:
#   const OVERRIDE_FILE_PATH = String.raw``;
#   const INJECT_CONFIG_FILE_PATH = String.raw``;
# NOT regular string literals — must target the full String.raw`` expression.

$bg = Get-Content $bgJsPath -Raw

# Escape backslashes for JS String.raw
$harvesterJs  = $harvesterPath  -replace '\\', '\\\\'
$injectCfgJs  = $injectCfgPath  -replace '\\', '\\\\'

# Replace String.raw`` with String.raw`<path>`
$bg = $bg -replace '(const OVERRIDE_FILE_PATH\s*=\s*)String\.raw`[^`]*`', "`$1String.raw``$harvesterJs``"
$bg = $bg -replace '(const INJECT_CONFIG_FILE_PATH\s*=\s*)String\.raw`[^`]*`', "`$1String.raw``$injectCfgJs``"

Set-Content -Path $bgJsPath -Value $bg -Encoding UTF8

Write-Host "[Setup] background.js patched"
Write-Host "        OVERRIDE_FILE_PATH = $harvesterPath"
Write-Host "        INJECT_CONFIG_FILE_PATH = $injectCfgPath"

# Verify the patch landed
$verify = Get-Content $bgJsPath -Raw
if ($verify -match [regex]::Escape($harvesterPath.Replace('\', '\\'))) {
    Write-Host "[Setup] Patch verified OK"
} else {
    Write-Error "[Setup] Patch verification FAILED - check background.js format"
    exit 1
}

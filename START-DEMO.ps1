# ============================================================================
#  START-DEMO.ps1  —  Bring up the DeoDap YT->Blog app + a public HTTPS link.
#
#  HOW TO RUN:  right-click this file -> "Run with PowerShell"
#               (or in a PowerShell window:  ./START-DEMO.ps1 )
#
#  It opens 3 things:
#    1. Postgres  (local database, minimized window)
#    2. The web app on http://localhost:3000  (minimized window)
#    3. A public Cloudflare tunnel — the https://<random>.trycloudflare.com
#       URL is printed in THIS window. Keep this window open; Ctrl+C stops it.
#
#  NOTE: this runs on THIS PC. The public link works only while this window
#  stays open and the PC is awake. For a permanent link, deploy to Render
#  (see render.yaml at the repo root) — there transcript works natively too.
# ============================================================================

$ErrorActionPreference = "Stop"

# Tools (adjust these two paths if you install Node / move the binaries)
$node = "C:\Users\DeoDap\AppData\Local\OpenAI\Codex\bin\node.exe"
$cf   = "C:\Users\DeoDap\yt-dlp\cloudflared.exe"
$dash = "C:\Users\DeoDap\Y@sh\deodap-yt-blog\dashboard"

if (-not (Test-Path $node)) { Write-Host "Node not found at $node — install Node 20+ and update `$node." -ForegroundColor Red; exit 1 }
if (-not (Test-Path $cf))   { Write-Host "cloudflared not found at $cf." -ForegroundColor Red; exit 1 }

Set-Location $dash

function Wait-Port($port, $label) {
  Write-Host "Waiting for $label on port $port ..." -NoNewline
  for ($i = 0; $i -lt 60; $i++) {
    if ((Test-NetConnection localhost -Port $port -WarningAction SilentlyContinue).TcpTestSucceeded) { Write-Host " up." ; return $true }
    Start-Sleep 1; Write-Host "." -NoNewline
  }
  Write-Host " TIMEOUT"; return $false
}

# 1) Postgres (users / sessions / saved sources). Transcript alone works without it,
#    but login + "save source" need it.
Write-Host "Starting Postgres..." -ForegroundColor Cyan
Start-Process $node -ArgumentList "scripts/db-server.mjs" -WorkingDirectory $dash -WindowStyle Minimized | Out-Null
Wait-Port 54329 "Postgres" | Out-Null

# 2) Web app (dev mode = reliable; loads .env.local incl. YTDLP_BIN so transcript works).
Write-Host "Starting web app..." -ForegroundColor Cyan
Start-Process $node -ArgumentList "node_modules/next/dist/bin/next","dev","-p","3000" -WorkingDirectory $dash -WindowStyle Minimized | Out-Null
if (-not (Wait-Port 3000 "web app")) { Write-Host "App did not start — check the minimized app window." -ForegroundColor Red; exit 1 }
Write-Host "Local app:  http://localhost:3000" -ForegroundColor Green

# 3) Public tunnel (prints the https URL below; stays in foreground until Ctrl+C).
Write-Host "`nStarting public tunnel — your shareable URL appears below:`n" -ForegroundColor Yellow
& $cf tunnel --url http://localhost:3000 --no-autoupdate

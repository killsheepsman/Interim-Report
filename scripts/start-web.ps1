$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$port = 4173
$backendPort = 4174

function Stop-QmsListeners {
  foreach ($listenPort in @($port, $backendPort)) {
    $lines = netstat -ano | Select-String ":$listenPort" | Select-String "LISTENING"
    foreach ($line in $lines) {
      $parts = ($line.ToString().Trim() -split "\s+")
      $pidValue = [int]$parts[-1]
      $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
      if ($process -and $process.ProcessName -eq "node") {
        Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

Stop-QmsListeners

$server = Start-Process -FilePath "npm.cmd" `
  -ArgumentList @("run", "dev", "--", "--port", "$port") `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -PassThru

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Milliseconds 500
  try {
    $response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/api/me" -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
      $ready = $true
      break
    }
  } catch {}
}

if (-not $ready) {
  if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force }
  Stop-QmsListeners
  throw "The QMS web service failed to start."
}

Start-Process "http://127.0.0.1:$port/#executive"
Write-Host "QMS Quality Analytics is running at http://127.0.0.1:$port/"
Write-Host "Keep this window open. Press Enter to stop the service."
[Console]::ReadLine() | Out-Null
if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force }
Stop-QmsListeners

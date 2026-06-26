$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $root "release"
$target = Join-Path $releaseRoot "QMS-Quality-Analytics-Portable"
$zip = Join-Path $releaseRoot "QMS-Quality-Analytics-Portable.zip"

New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null

if (Test-Path -LiteralPath $target) {
  $resolved = (Resolve-Path -LiteralPath $target).Path
  $releaseResolved = (Resolve-Path -LiteralPath $releaseRoot).Path
  if (-not $resolved.StartsWith($releaseResolved)) { throw "拒绝清理非 release 目录：$resolved" }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}

New-Item -ItemType Directory -Path $target -Force | Out-Null

$electronDist = Join-Path $root "node_modules\electron\dist"
if (-not (Test-Path -LiteralPath $electronDist)) {
  throw "缺少 Electron 运行时：$electronDist，请先执行 npm install 并运行 node node_modules\electron\install.js"
}

Copy-Item -Path (Join-Path $electronDist "*") -Destination $target -Recurse -Force

$locales = Join-Path $target "locales"
if (Test-Path -LiteralPath $locales) {
  Get-ChildItem -LiteralPath $locales -Filter "*.pak" | Where-Object {
    $_.Name -notin @("zh-CN.pak", "en-US.pak")
  } | Remove-Item -Force
}

$app = Join-Path $target "resources\app"
New-Item -ItemType Directory -Path $app -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $root "dist") -Destination $app -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root "electron") -Destination $app -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root "package.json") -Destination $app -Force

Rename-Item -LiteralPath (Join-Path $target "electron.exe") -NewName "QMS-Quality-Analytics.exe"

if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -Path $target -DestinationPath $zip -CompressionLevel Optimal

Write-Host "Portable package created: $zip"

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $root "release"
$target = Join-Path $releaseRoot "QMS质量分析平台-免安装版"
$zip = Join-Path $releaseRoot "QMS质量分析平台-免安装版.zip"

if (Test-Path -LiteralPath $target) {
  $resolved = (Resolve-Path -LiteralPath $target).Path
  if (-not $resolved.StartsWith($releaseRoot)) { throw "拒绝清理非release目录：$resolved" }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}

New-Item -ItemType Directory -Path $target -Force | Out-Null
Copy-Item -Path (Join-Path $root "node_modules\electron\dist\*") -Destination $target -Recurse -Force
$app = Join-Path $target "resources\app"
New-Item -ItemType Directory -Path $app -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $root "dist") -Destination $app -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root "electron") -Destination $app -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root "package.json") -Destination $app -Force
Rename-Item -LiteralPath (Join-Path $target "electron.exe") -NewName "QMS质量分析平台.exe"

if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -Path $target -DestinationPath $zip -CompressionLevel Optimal
Write-Host "Portable package created: $zip"

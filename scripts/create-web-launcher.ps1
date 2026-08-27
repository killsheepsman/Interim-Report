$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$assetDir = Join-Path $root "assets"
$iconPath = Join-Path $assetDir "qms-web.ico"
$startText = -join ([char[]](0x542F, 0x52A8))
$webText = -join ([char[]](0x7F51, 0x9875, 0x7248))
$shortcutPath = Join-Path $root "$startText QMS $webText.lnk"

New-Item -ItemType Directory -Path $assetDir -Force | Out-Null
Add-Type -AssemblyName System.Drawing

$bitmap = New-Object System.Drawing.Bitmap 256, 256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$blue = [System.Drawing.Color]::FromArgb(22, 110, 207)
$green = [System.Drawing.Color]::FromArgb(38, 181, 104)
$background = New-Object System.Drawing.SolidBrush $blue
$browserPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 14
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(18, 18, 52, 52, 180, 90)
$path.AddArc(186, 18, 52, 52, 270, 90)
$path.AddArc(186, 186, 52, 52, 0, 90)
$path.AddArc(18, 186, 52, 52, 90, 90)
$path.CloseFigure()
$graphics.FillPath($background, $path)

$graphics.DrawRectangle($browserPen, 48, 57, 160, 126)
$graphics.DrawLine($browserPen, 48, 92, 208, 92)
foreach ($x in @(69, 91, 113)) {
  $graphics.FillEllipse([System.Drawing.Brushes]::White, $x, 69, 10, 10)
}

$greenBrush = New-Object System.Drawing.SolidBrush $green
$graphics.FillEllipse($greenBrush, 139, 132, 90, 90)
$play = New-Object System.Drawing.Drawing2D.GraphicsPath
$play.AddPolygon([System.Drawing.Point[]]@(
  (New-Object System.Drawing.Point 171, 153),
  (New-Object System.Drawing.Point 171, 201),
  (New-Object System.Drawing.Point 207, 177)
))
$graphics.FillPath([System.Drawing.Brushes]::White, $play)

$pngStream = New-Object System.IO.MemoryStream
$bitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $pngStream.ToArray()
$iconStream = [System.IO.File]::Create($iconPath)
$writer = New-Object System.IO.BinaryWriter $iconStream
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]1)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([uint16]1)
$writer.Write([uint16]32)
$writer.Write([uint32]$pngBytes.Length)
$writer.Write([uint32]22)
$writer.Write($pngBytes)
$writer.Dispose()
$pngStream.Dispose()
$greenBrush.Dispose()
$browserPen.Dispose()
$background.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$root\scripts\start-web.ps1`""
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = "$iconPath,0"
$shortcut.WindowStyle = 7
$qualityText = -join ([char[]](0x8D28, 0x91CF, 0x5206, 0x6790, 0x5E73, 0x53F0))
$shortcut.Description = "$startText QMS $qualityText$webText"
$shortcut.Save()

Write-Host "Created: $shortcutPath"

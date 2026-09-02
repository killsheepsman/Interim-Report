param(
  [Parameter(Mandatory = $true)][string]$ImagePath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime] | Out-Null

function Await-WinRt($Operation, [Type]$ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
    Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  $task.Result
}

$resolvedImage = (Resolve-Path -LiteralPath $ImagePath).Path
$file = Await-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($resolvedImage)) ([Windows.Storage.StorageFile])
$stream = Await-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
try {
  $decoder = Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $language = New-Object Windows.Globalization.Language 'zh-Hans-CN'
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
  if (-not $engine) { throw 'Windows zh-Hans OCR is unavailable' }
  $result = Await-WinRt ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $lines = @($result.Lines | ForEach-Object {
    $words = @($_.Words | ForEach-Object {
      [ordered]@{
        text = [string]$_.Text
        boundingRect = @([double]$_.BoundingRect.X, [double]$_.BoundingRect.Y, [double]$_.BoundingRect.Width, [double]$_.BoundingRect.Height)
      }
    })
    [ordered]@{ text = [string]$_.Text; words = $words }
  })
  $payload = [ordered]@{
    schemaVersion = 'qms-windows-ocr-v1'
    text = [string]$result.Text
    width = [int]$decoder.PixelWidth
    height = [int]$decoder.PixelHeight
    textAngle = if ($null -eq $result.TextAngle) { $null } else { [double]$result.TextAngle }
    lines = $lines
  }
  [IO.File]::WriteAllText($OutputPath, ($payload | ConvertTo-Json -Depth 8 -Compress), [Text.UTF8Encoding]::new($false))
} finally {
  $stream.Dispose()
}

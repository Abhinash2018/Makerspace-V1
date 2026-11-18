param([Parameter(Mandatory=$true)][string]$InputFile, [string]$PreviewFile)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime] | Out-Null
  [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType=WindowsRuntime] | Out-Null
  [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime] | Out-Null
  [Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime] | Out-Null
  [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime] | Out-Null
  [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime] | Out-Null
  $script:asyncMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
  function Await-Result($Operation, [Type]$ResultType) {
    $task = $script:asyncMethod.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    $task.GetAwaiter().GetResult()
  }
  $file = Await-Result ([Windows.Storage.StorageFile]::GetFileFromPathAsync($InputFile)) ([Windows.Storage.StorageFile])
  $pdf = Await-Result ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
  if ($pdf.PageCount -lt 1 -or $pdf.PageCount -gt 100) { throw 'limits' }
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('en-US'))
  if ($null -eq $engine) { throw 'unavailable' }
  $pages = @(); $empty = @(); $total = 0
  for ($i = 0; $i -lt $pdf.PageCount; $i++) {
    $page = $pdf.GetPage([uint32]$i)
    $stream = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
    try {
      $options = [Windows.Data.Pdf.PdfPageRenderOptions]::new()
      $scale = [Math]::Min(3, 2400 / [Math]::Max($page.Size.Width, $page.Size.Height))
      $options.DestinationWidth = [uint32]($page.Size.Width * $scale)
      $options.DestinationHeight = [uint32]($page.Size.Height * $scale)
      $actionMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1
      $null = $actionMethod.Invoke($null, @($page.RenderToStreamAsync($stream, $options))).GetAwaiter().GetResult()
      $stream.Seek(0)
      if ($i -eq 0 -and $PreviewFile) {
        $reader = [Windows.Storage.Streams.DataReader]::new($stream.GetInputStreamAt(0))
        try {
          $null = Await-Result ($reader.LoadAsync([uint32]$stream.Size)) ([uint32])
          $bytes = [byte[]]::new($stream.Size); $reader.ReadBytes($bytes)
          [IO.File]::WriteAllBytes($PreviewFile, $bytes)
        } finally { $reader.Dispose() }
      }
      $stream.Seek(0)
      $decoder = Await-Result ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
      $bitmap = Await-Result ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
      try { $result = Await-Result ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult]) } finally { $bitmap.Dispose() }
      $text = (($result.Lines | ForEach-Object { $_.Text }) -join "`n").Normalize().Trim()
      $total += $text.Length
      if ($text.Length -gt 100000 -or $total -gt 1000000) { throw 'limits' }
      if (-not $text) { $empty += ($i + 1) }
      $pages += @{ page = $i + 1; text = $text }
    } finally { $stream.Dispose(); $page.Dispose() }
  }
  if ($total -eq 0) { throw 'no_text' }
  @{ pages = @($pages); pageCount = [int]$pdf.PageCount; emptyPages = @($empty) } | ConvertTo-Json -Depth 5 -Compress
} catch { [Console]::Error.WriteLine('ocr_unavailable'); exit 1 }

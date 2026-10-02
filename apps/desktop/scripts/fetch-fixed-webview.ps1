param([Parameter(Mandatory=$true)][string]$CacheRoot)
$ErrorActionPreference = 'Stop'
$pin = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../portable/webview2.lock.json') -Raw | ConvertFrom-Json
if ($pin.format -ne 1 -or $pin.architecture -ne 'x64') { throw 'Invalid fixed runtime lock' }
$cache = [IO.Path]::GetFullPath($CacheRoot)
New-Item -ItemType Directory -Path $cache -Force | Out-Null
$cab = Join-Path $cache "WebView2.$($pin.version).x64.cab"
if (!(Test-Path -LiteralPath $cab)) {
    Invoke-WebRequest -Uri $pin.url -OutFile "$cab.partial" -TimeoutSec 1200
    if ((Get-FileHash -LiteralPath "$cab.partial" -Algorithm SHA256).Hash -ne $pin.sha256) { throw 'WebView2 checksum mismatch; partial file retained for investigation' }
    Move-Item -LiteralPath "$cab.partial" -Destination $cab
}
if ((Get-FileHash -LiteralPath $cab -Algorithm SHA256).Hash -ne $pin.sha256) { throw 'WebView2 cache checksum mismatch' }
$expanded = Join-Path $cache "expanded-$($pin.version)"
if (!(Test-Path -LiteralPath (Join-Path $expanded 'complete.json'))) {
    if (Test-Path -LiteralPath $expanded) { throw 'Incomplete runtime extraction; choose a new cache directory' }
    New-Item -ItemType Directory -Path $expanded | Out-Null
    & expand.exe $cab '-F:*' $expanded | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Fixed runtime extraction failed' }
    $executables = @(Get-ChildItem -LiteralPath $expanded -Filter msedgewebview2.exe -Recurse -File)
    if ($executables.Count -ne 1) { throw 'Fixed runtime executable missing or ambiguous' }
    $runtime = $executables[0].Directory.FullName
    if ($executables[0].VersionInfo.FileVersion -ne $pin.version) { throw 'Fixed runtime version mismatch' }
    @{ version=$pin.version; sha256=$pin.sha256; runtime=$runtime } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $expanded 'complete.json') -Encoding utf8
}
$record = Get-Content -LiteralPath (Join-Path $expanded 'complete.json') -Raw | ConvertFrom-Json
if ($record.version -ne $pin.version -or $record.sha256 -ne $pin.sha256) { throw 'Runtime cache manifest mismatch' }
Write-Output $record.runtime

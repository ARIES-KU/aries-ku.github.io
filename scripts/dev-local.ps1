# Run the site locally from a mirror on the C: drive, because node_modules (about 9,300 files) cannot live on
# Google Drive. The files you edit stay in this folder; the mirror is disposable.
#   powershell -ExecutionPolicy Bypass -File scripts\dev-local.ps1      then open http://localhost:4321
# Edits made here are copied to the mirror every 2 seconds while the server runs.
$src = Split-Path -Parent $PSScriptRoot
$dst = Join-Path $env:LOCALAPPDATA 'aries-website-dev'
$skip = @('/XD', 'node_modules', '.git', 'dist', 'shots', '.astro', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')

robocopy $src $dst /MIR @skip | Out-Null
Set-Location $dst
if (-not (Test-Path (Join-Path $dst 'node_modules'))) { npm ci }

$sync = Start-Job -ArgumentList $src, $dst, $skip -ScriptBlock {
  param($s, $d, $x)
  while ($true) { robocopy $s $d /MIR @x | Out-Null; Start-Sleep -Seconds 2 }
}
try { npx astro dev } finally { Stop-Job $sync; Remove-Job $sync }

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$publicDirectory = Join-Path $projectDirectory 'dist'
$releaseDirectory = Join-Path $projectDirectory 'artifacts/releases'
$archivePath = Join-Path $releaseDirectory 'tiny-tanks-public.zip'

Push-Location $projectDirectory
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
    New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath }
    [System.IO.Compression.ZipFile]::CreateFromDirectory($publicDirectory, $archivePath)
    Write-Output "Package: $archivePath"
} finally { Pop-Location }
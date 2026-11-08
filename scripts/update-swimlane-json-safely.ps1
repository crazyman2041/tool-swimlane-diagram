param(
  [string]$JsonPath = "tool-swimlane-diagram.autosave.json",
  [string]$ServerScript = "scripts/autosave-server.js",
  [string]$UpdaterJs = "",
  [int]$Port = 8788,
  [switch]$NoRestart,
  [switch]$KeepPaused,
  [switch]$KeepBackup
)

$ErrorActionPreference = "Stop"

function Remove-ProviderPrefix {
  param([string]$PathValue)
  return $PathValue -replace "^.*::", ""
}

$scriptPath = if ($PSCommandPath) { $PSCommandPath } else { $MyInvocation.MyCommand.Path }
$scriptRoot = Split-Path -Parent $scriptPath
if (-not $scriptRoot) {
  throw "Cannot determine script root. Run this script with -File from the repository."
}
$repoRootResolved = Resolve-Path -LiteralPath (Join-Path $scriptRoot "..")
$repoRoot = if ($repoRootResolved.ProviderPath) { $repoRootResolved.ProviderPath } else { $repoRootResolved.Path }
$repoRoot = Remove-ProviderPrefix $repoRoot

function Resolve-RepoPath {
  param([string]$PathValue)
  $cleanPath = Remove-ProviderPrefix $PathValue
  if ([System.IO.Path]::IsPathRooted($cleanPath)) {
    $candidateInput = $cleanPath
  } else {
    $candidateInput = Join-Path $repoRoot $cleanPath
  }
  $resolved = Resolve-Path -LiteralPath $candidateInput -ErrorAction SilentlyContinue
  if (-not $resolved) {
    throw "Path not found: $candidateInput"
  }
  $candidate = if ($resolved.ProviderPath) { $resolved.ProviderPath } else { $resolved.Path }
  return (Remove-ProviderPrefix $candidate)
}

function Get-NodeExe {
  return "node"
}

function Stop-AutosaveServer {
  param([int]$ListenPort)
  $connections = Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
    if (-not $process) { continue }
    if ($process.ProcessName -ne "node") {
      throw "Port $ListenPort is owned by non-node process $($process.ProcessName) ($($process.Id)); refusing to stop it."
    }
    Stop-Process -Id $process.Id -Force
  }
}

function Wait-Port {
  param([int]$ListenPort)
  for ($i = 0; $i -lt 20; $i += 1) {
    if (Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue) {
      return $true
    }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

function Assert-JsonReadable {
  param([string]$PathValue)
  $null = Get-Content -LiteralPath $PathValue -Raw -Encoding UTF8 | ConvertFrom-Json
}

$jsonFullPath = Resolve-RepoPath $JsonPath
$serverFullPath = Resolve-RepoPath $ServerScript
$serverArgument = "`"$serverFullPath`""
$nodeExe = Get-NodeExe
$pausePath = "$jsonFullPath.paused"

Assert-JsonReadable $jsonFullPath
Set-Content -LiteralPath $pausePath -Value (Get-Date -Format "o") -Encoding UTF8
$backupPath = "$jsonFullPath.bak-$(Get-Date -Format 'yyyyMMddHHmmss')"
$tempPath = "$jsonFullPath.tmp-$(Get-Date -Format 'yyyyMMddHHmmss')"
Copy-Item -LiteralPath $jsonFullPath -Destination $backupPath
Copy-Item -LiteralPath $jsonFullPath -Destination $tempPath

try {
  if ($UpdaterJs) {
    $updaterFullPath = Resolve-RepoPath $UpdaterJs
    & $nodeExe $updaterFullPath $tempPath
    if ($LASTEXITCODE -ne 0) {
      throw "Updater failed with exit code $LASTEXITCODE"
    }
  }

  Assert-JsonReadable $tempPath

  Stop-AutosaveServer -ListenPort $Port
  Move-Item -LiteralPath $tempPath -Destination $jsonFullPath -Force
  Assert-JsonReadable $jsonFullPath

  if (-not $NoRestart) {
    Start-Process -FilePath $nodeExe -ArgumentList $serverArgument -WindowStyle Hidden
    if (-not (Wait-Port -ListenPort $Port)) {
      throw "Autosave server did not listen on port $Port after restart."
    }
  }

  if (-not $KeepPaused -and (Test-Path -LiteralPath $pausePath)) {
    Remove-Item -LiteralPath $pausePath -Force
  }

  $backupRemoved = $false
  if (-not $KeepBackup -and (Test-Path -LiteralPath $backupPath)) {
    Remove-Item -LiteralPath $backupPath -Force
    $backupRemoved = $true
  }

  [pscustomobject]@{
    ok = $true
    json = $jsonFullPath
    backup = $backupPath
    backupRemoved = $backupRemoved
    temp = $tempPath
    serverRestarted = (-not $NoRestart)
    autosavePaused = (Test-Path -LiteralPath $pausePath)
    nextStep = if (Test-Path -LiteralPath $pausePath) {
      "Reload the swimlane browser page, then enable autosave after confirming the diagram."
    } else {
      "Reload the swimlane browser page so it reads the updated JSON. Autosave is enabled."
    }
  } | ConvertTo-Json -Compress
} catch {
  if (Test-Path -LiteralPath $tempPath) {
    Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
  }
  if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) -and -not $NoRestart) {
    Start-Process -FilePath $nodeExe -ArgumentList $serverArgument -WindowStyle Hidden
  }
  throw
}

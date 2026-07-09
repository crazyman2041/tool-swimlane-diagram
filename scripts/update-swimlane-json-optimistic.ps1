param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("AddFlow", "UpdateFlow")]
  [string]$Mode,

  [string]$JsonPath = "tool-swimlane-diagram.autosave.json",

  [Parameter(Mandatory = $true)]
  [string]$UpdaterJs,

  [string[]]$TargetFlowId = @(),

  [ValidateSet("none", "candidate")]
  [string]$SetActiveFlow = "none",

  [string]$SetActiveFlowId = "",

  [switch]$KeepBackup,
  [switch]$KeepPaused
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

function Assert-JsonReadable {
  param([string]$PathValue)
  $null = Get-Content -LiteralPath $PathValue -Raw -Encoding UTF8 | ConvertFrom-Json
}

$jsonFullPath = Resolve-RepoPath $JsonPath
$updaterFullPath = Resolve-RepoPath $UpdaterJs
$mergeFullPath = Resolve-RepoPath "scripts/swimlane-json-optimistic-merge.js"
$nodeExe = Get-NodeExe
$timestamp = Get-Date -Format "yyyyMMddHHmmssfff"
$tempDir = Split-Path -Parent $jsonFullPath
$basePath = Join-Path $tempDir "tool-swimlane-diagram.optimistic-base-$timestamp.json"
$candidatePath = Join-Path $tempDir "tool-swimlane-diagram.optimistic-candidate-$timestamp.json"
$outPath = Join-Path $tempDir "tool-swimlane-diagram.optimistic-out-$timestamp.json"
$backupPath = "$jsonFullPath.bak-optimistic-$timestamp"
$pausePath = "$jsonFullPath.paused"

Assert-JsonReadable $jsonFullPath
Copy-Item -LiteralPath $jsonFullPath -Destination $basePath
Copy-Item -LiteralPath $jsonFullPath -Destination $candidatePath

try {
  & $nodeExe $updaterFullPath $candidatePath
  if ($LASTEXITCODE -ne 0) {
    throw "Updater failed with exit code $LASTEXITCODE"
  }
  Assert-JsonReadable $candidatePath

  Set-Content -LiteralPath $pausePath -Value (Get-Date -Format "o") -Encoding UTF8

  $modeArg = if ($Mode -eq "AddFlow") { "add-flow" } else { "update-flow" }
  $activeFlowArg = if ($SetActiveFlowId) { $SetActiveFlowId } else { $SetActiveFlow }
  $mergeArgs = @(
    $mergeFullPath,
    "--base", $basePath,
    "--candidate", $candidatePath,
    "--live", $jsonFullPath,
    "--out", $outPath,
    "--mode", $modeArg,
    "--set-active-flow", $activeFlowArg
  )
  foreach ($flowId in $TargetFlowId) {
    $mergeArgs += @("--target-flow-id", $flowId)
  }

  $mergeOutput = & $nodeExe @mergeArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Optimistic merge failed with exit code $LASTEXITCODE"
  }
  Assert-JsonReadable $outPath

  Copy-Item -LiteralPath $jsonFullPath -Destination $backupPath
  Move-Item -LiteralPath $outPath -Destination $jsonFullPath -Force
  Assert-JsonReadable $jsonFullPath

  if (-not $KeepPaused -and (Test-Path -LiteralPath $pausePath)) {
    Remove-Item -LiteralPath $pausePath -Force
  }

  $backupRemoved = $false
  if (-not $KeepBackup -and (Test-Path -LiteralPath $backupPath)) {
    Remove-Item -LiteralPath $backupPath -Force
    $backupRemoved = $true
  }

  Remove-Item -LiteralPath $basePath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $candidatePath -Force -ErrorAction SilentlyContinue

  [pscustomobject]@{
    ok = $true
    mode = $Mode
    json = $jsonFullPath
    updater = $updaterFullPath
    backup = $backupPath
    backupRemoved = $backupRemoved
    serverRestarted = $false
    autosavePaused = (Test-Path -LiteralPath $pausePath)
    merge = ($mergeOutput | ConvertFrom-Json)
    nextStep = if (Test-Path -LiteralPath $pausePath) {
      "Reload the swimlane browser page, then enable autosave after confirming the diagram."
    } else {
      "Reload the swimlane browser page so it reads the updated JSON."
    }
  } | ConvertTo-Json -Depth 8 -Compress
} catch {
  Remove-Item -LiteralPath $basePath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $candidatePath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $outPath -Force -ErrorAction SilentlyContinue
  if (-not $KeepPaused -and (Test-Path -LiteralPath $pausePath)) {
    Remove-Item -LiteralPath $pausePath -Force -ErrorAction SilentlyContinue
  }
  throw
}

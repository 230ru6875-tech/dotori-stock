param(
    [switch]$NoPush
)

$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$dotoriStockWeb = "E:\dotoristock\web"
$logDir = Join-Path $repo "logs"
$logPath = Join-Path $logDir "public_dashboard_sync.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-SyncLog {
    param([string]$Message)
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$stamp $Message" | Tee-Object -FilePath $logPath -Append
}

function Invoke-NativeLogged {
    param([scriptblock]$Command)
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = & $Command 2>&1
        $exitCode = $LASTEXITCODE
        if ($null -ne $output) {
            foreach ($line in $output) {
                $text = [string]$line
                Add-Content -LiteralPath $logPath -Value $text -Encoding UTF8
                Write-Host $text
            }
        }
        return [int]$exitCode
    } finally {
        $ErrorActionPreference = $previousPreference
    }
}

try {
    Set-Location $repo
    Write-SyncLog "start repo=$repo"

    $exportExit = Invoke-NativeLogged { & python export_public_snapshot.py }
    if ($exportExit -ne 0) {
        throw "export_public_snapshot.py failed with exit code $exportExit"
    }

    New-Item -ItemType Directory -Force -Path (Join-Path $dotoriStockWeb "data") | Out-Null
    Copy-Item -LiteralPath (Join-Path $repo "data\public-snapshot.json") -Destination (Join-Path $dotoriStockWeb "data\public-snapshot.json") -Force
    Copy-Item -LiteralPath (Join-Path $repo "export_public_snapshot.py") -Destination (Join-Path $dotoriStockWeb "export_public_snapshot.py") -Force
    if (Test-Path -LiteralPath (Join-Path $repo "sync_public_dashboard_hourly.ps1")) {
        Copy-Item -LiteralPath (Join-Path $repo "sync_public_dashboard_hourly.ps1") -Destination (Join-Path $dotoriStockWeb "sync_public_dashboard_hourly.ps1") -Force
    }

    $snapshot = Get-Content -LiteralPath (Join-Path $repo "data\public-snapshot.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    $exchange = $snapshot.exchangeRate
    Write-SyncLog ("snapshot updatedAt={0} exchange={1} {2}" -f $snapshot.updatedAt, $exchange.value, $exchange.change)

    & git add -- data/public-snapshot.json
    & git diff --cached --quiet -- data/public-snapshot.json
    if ($LASTEXITCODE -eq 0) {
        Write-SyncLog "no public-snapshot change to commit"
        exit 0
    }

    $commitMessage = "Update public dashboard snapshot $(Get-Date -Format 'yyyy-MM-dd HH:00')"
    $commitExit = Invoke-NativeLogged { & git commit -m $commitMessage --only -- data/public-snapshot.json }
    if ($commitExit -ne 0) {
        throw "git commit failed with exit code $commitExit"
    }

    if (-not $NoPush) {
        $pushExit = Invoke-NativeLogged { & git push origin main }
        if ($pushExit -ne 0) {
            throw "git push failed with exit code $pushExit"
        }
        Write-SyncLog "pushed origin/main"
    } else {
        Write-SyncLog "NoPush set; commit created without push"
    }
} catch {
    Write-SyncLog ("ERROR " + $_.Exception.Message)
    exit 1
}

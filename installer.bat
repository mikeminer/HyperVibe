@echo off
title HyperVibe Installer
chcp 437 >nul
echo.
echo  HyperVibe Installer - Starting...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "& {
  $install = Split-Path -Parent '%~f0'
  $hv      = Join-Path $install 'HyperVibe'
  $app     = Join-Path $hv 'hypervibe'
  $env     = Join-Path $app '.env'

  Write-Host '  ==========================================' -ForegroundColor Cyan
  Write-Host '   HYPERVIBE Installer v2.0' -ForegroundColor Cyan
  Write-Host ('   Installing in: ' + $install) -ForegroundColor Gray
  Write-Host '  ==========================================' -ForegroundColor Cyan
  Write-Host ''

  # ── Node.js ────────────────────────────────────────────────────────────────
  Write-Host '[1/5] Checking Node.js...' -ForegroundColor White
  $nodePath = (Get-Command node -ErrorAction SilentlyContinue)?.Source
  if (-not $nodePath) { $nodePath = 'C:\Program Files\nodejs\node.exe' }
  if (-not (Test-Path $nodePath)) {
    Write-Host '  Not found - downloading Node.js v22 LTS...' -ForegroundColor Yellow
    $msi = Join-Path $env:TEMP 'node-v22.msi'
    Invoke-WebRequest 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi' -OutFile $msi
    Write-Host '  Installing...' -ForegroundColor Yellow
    Start-Process msiexec -ArgumentList '/i',$msi,'/quiet','/norestart' -Wait
    $nodePath = 'C:\Program Files\nodejs\node.exe'
    if (-not (Test-Path $nodePath)) { Write-Host '  ERROR: Install failed.' -ForegroundColor Red; Read-Host; exit 1 }
  }
  $nodeVer = & $nodePath --version
  $env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
  Write-Host ('  OK - Node.js ' + $nodeVer) -ForegroundColor Green

  # ── Git ─────────────────────────────────────────────────────────────────────
  Write-Host '[2/5] Checking Git...' -ForegroundColor White
  $gitPath = (Get-Command git -ErrorAction SilentlyContinue)?.Source
  if (-not $gitPath) { $gitPath = 'C:\Program Files\Git\cmd\git.exe' }
  if (-not (Test-Path $gitPath)) {
    Write-Host '  Not found - downloading Git...' -ForegroundColor Yellow
    $exe = Join-Path $env:TEMP 'git-installer.exe'
    Invoke-WebRequest 'https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.2/Git-2.47.1.2-64-bit.exe' -OutFile $exe
    Start-Process $exe -ArgumentList '/VERYSILENT','/NORESTART' -Wait
    $gitPath = 'C:\Program Files\Git\cmd\git.exe'
    if (-not (Test-Path $gitPath)) { Write-Host '  ERROR: Git install failed.' -ForegroundColor Red; Read-Host; exit 1 }
    $env:PATH = 'C:\Program Files\Git\cmd;' + $env:PATH
  }
  Write-Host '  OK - Git found' -ForegroundColor Green

  # ── Clone / Pull ─────────────────────────────────────────────────────────────
  Write-Host '[3/5] Setting up HyperVibe...' -ForegroundColor White
  if (Test-Path (Join-Path $app 'package.json')) {
    Write-Host '  Already installed - pulling latest...' -ForegroundColor Gray
    Set-Location $hv
    & $gitPath pull
  } else {
    Write-Host ('  Cloning into ' + $hv + '...') -ForegroundColor Gray
    & $gitPath clone 'https://github.com/mikeminer/HyperVibe.git' $hv
    if ($LASTEXITCODE -ne 0) { Write-Host '  ERROR: Clone failed.' -ForegroundColor Red; Read-Host; exit 1 }
  }
  Write-Host '  OK' -ForegroundColor Green

  # ── npm install ──────────────────────────────────────────────────────────────
  Write-Host '[4/5] Installing dependencies...' -ForegroundColor White
  Set-Location $app
  if (Test-Path 'node_modules') {
    Write-Host '  Removing old modules...' -ForegroundColor Gray
    Remove-Item -Recurse -Force 'node_modules' -ErrorAction SilentlyContinue
  }
  $npm = Join-Path 'C:\Program Files\nodejs' 'npm.cmd'
  & $npm install
  if ($LASTEXITCODE -ne 0) { Write-Host '  ERROR: npm install failed.' -ForegroundColor Red; Read-Host; exit 1 }
  Write-Host '  OK - Dependencies installed' -ForegroundColor Green

  # ── Credentials ──────────────────────────────────────────────────────────────
  Write-Host '[5/5] Configuring credentials...' -ForegroundColor White
  Write-Host ''

  $curA = ''; $curW = ''; $curK = ''; $curN = 'mainnet'
  if (Test-Path $env) {
    Write-Host '  Found existing .env - press ENTER to keep current values.' -ForegroundColor Gray
    Write-Host ''
    Get-Content $env | ForEach-Object {
      if ($_ -match '^ANTHROPIC_API_KEY=(.+)') { $curA = $matches[1] }
      if ($_ -match '^HL_WALLET_ADDRESS=(.+)') { $curW = $matches[1] }
      if ($_ -match '^HL_PRIVATE_KEY=(.+)')    { $curK = $matches[1] }
      if ($_ -match '^HL_NETWORK=(.+)')         { $curN = $matches[1] }
    }
  }

  Write-Host '  ==========================================' -ForegroundColor Cyan
  Write-Host '   CREDENTIALS SETUP' -ForegroundColor Cyan
  Write-Host '  ==========================================' -ForegroundColor Cyan
  Write-Host ''

  Write-Host '  [A] ANTHROPIC_API_KEY' -ForegroundColor White
  Write-Host '      Get yours at: https://console.anthropic.com' -ForegroundColor Gray
  if ($curA) { Write-Host ('      Current: ' + $curA.Substring(0,[Math]::Min(20,$curA.Length)) + '...') -ForegroundColor DarkGray }
  $newA = Read-Host '      Enter value (ENTER to keep)'
  $finalA = if ($newA) { $newA } else { $curA }
  Write-Host ''

  Write-Host '  [B] HL_WALLET_ADDRESS' -ForegroundColor White
  Write-Host '      Your Hyperliquid wallet (0x...) where your funds are' -ForegroundColor Gray
  if ($curW) { Write-Host ('      Current: ' + $curW.Substring(0,[Math]::Min(10,$curW.Length)) + '...') -ForegroundColor DarkGray }
  $newW = Read-Host '      Enter value (ENTER to keep)'
  $finalW = if ($newW) { $newW } else { $curW }
  Write-Host ''

  Write-Host '  [C] HL_PRIVATE_KEY' -ForegroundColor White
  Write-Host '      API Wallet key: https://app.hyperliquid.xyz/API' -ForegroundColor Gray
  if ($curK) { Write-Host '      Current: (already set)' -ForegroundColor DarkGray }
  $newK = Read-Host '      Enter value (ENTER to keep)'
  $finalK = if ($newK) { $newK } else { $curK }
  Write-Host ''

  Write-Host '  [D] HL_NETWORK' -ForegroundColor White
  Write-Host '      1 = mainnet (real funds)   2 = testnet (no real funds)' -ForegroundColor Gray
  Write-Host ('      Current: ' + $curN) -ForegroundColor DarkGray
  $net = Read-Host '      Choose 1 or 2 (ENTER to keep)'
  $finalN = if ($net -eq '1') { 'mainnet' } elseif ($net -eq '2') { 'testnet' } else { $curN }
  Write-Host ''

  @(
    '# HyperVibe Configuration',
    ('ANTHROPIC_API_KEY=' + $finalA),
    ('HL_WALLET_ADDRESS=' + $finalW),
    ('HL_PRIVATE_KEY=' + $finalK),
    ('HL_NETWORK=' + $finalN),
    'PORT=3001'
  ) | Set-Content $env
  Write-Host ('  OK - Saved to ' + $env) -ForegroundColor Green
  Write-Host ''

  # ── StartHyperVibe.bat ───────────────────────────────────────────────────────
  $startBat = Join-Path $install 'StartHyperVibe.bat'
  @(
    '@echo off',
    ('cd /d "' + $app + '"'),
    'npm start',
    'pause'
  ) | Set-Content $startBat
  Write-Host '  OK - Created StartHyperVibe.bat' -ForegroundColor Green
  Write-Host ''

  Write-Host '  ==========================================' -ForegroundColor Green
  Write-Host '   DONE! HyperVibe installed.' -ForegroundColor Green
  Write-Host ('   Location: ' + $hv) -ForegroundColor Gray
  Write-Host ('   Network:  ' + $finalN) -ForegroundColor Gray
  Write-Host '   Start:    double-click StartHyperVibe.bat' -ForegroundColor Gray
  Write-Host '  ==========================================' -ForegroundColor Green
  Write-Host ''

  $launch = Read-Host '  Launch HyperVibe now? (Y/N)'
  if ($launch -eq 'Y' -or $launch -eq 'y') {
    Set-Location $app
    & $npm start
  }
  Read-Host '  Press ENTER to close'
}"

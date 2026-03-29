@echo off
setlocal EnableDelayedExpansion
title HyperVibe Installer
chcp 437 >nul

REM Install everything in the same folder as this BAT file
set INSTALL_DIR=%~dp0
set INSTALL_DIR=%INSTALL_DIR:~0,-1%
set HV_DIR=%INSTALL_DIR%\HyperVibe
set ENV_FILE=%HV_DIR%\hypervibe\.env

echo.
echo  ==========================================
echo   HYPERVIBE - Installer v1.2
echo   Installing in: %INSTALL_DIR%
echo  ==========================================
echo.

REM ── Step 1: Node.js ──────────────────────────────────────────────────────────
echo [1/5] Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Node.js not found.
    echo  Download from: https://nodejs.org  (choose LTS)
    echo  Install it then run this installer again.
    echo.
    pause & exit /b 1
)
for /f %%v in ('node --version') do set NODEVER=%%v
echo  OK - Node.js %NODEVER%

REM ── Step 2: Git ──────────────────────────────────────────────────────────────
echo [2/5] Checking Git...
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Git not found.
    echo  Download from: https://git-scm.com
    echo.
    pause & exit /b 1
)
echo  OK - Git found

REM ── Step 3: Clone / Pull ─────────────────────────────────────────────────────
echo [3/5] Setting up HyperVibe in %HV_DIR%...
if exist "%HV_DIR%\hypervibe\package.json" (
    echo  Already installed - pulling latest updates...
    cd /d "%HV_DIR%"
    git pull
    echo  OK - Updated to latest version
) else (
    echo  Cloning from GitHub...
    git clone https://github.com/mikeminer/HyperVibe.git "%HV_DIR%"
    if %errorlevel% neq 0 (
        echo  ERROR: Clone failed. Check your internet connection.
        pause & exit /b 1
    )
    echo  OK - Cloned into %HV_DIR%
)

REM ── Step 4: npm install ───────────────────────────────────────────────────────
echo [4/5] Installing dependencies...
echo  This may take 2-5 minutes. Do not close this window.
echo  ------------------------------------------
cd /d "%HV_DIR%\hypervibe"
call npm install
set NPMCODE=%errorlevel%
echo  ------------------------------------------
if %NPMCODE% neq 0 (
    echo  First attempt failed - trying rebuild...
    call npm install --ignore-scripts
    call npm rebuild better-sqlite3
    if %errorlevel% neq 0 (
        echo.
        echo  ERROR: better-sqlite3 failed to compile.
        echo  Install Visual Studio Build Tools:
        echo  https://visualstudio.microsoft.com/visual-cpp-build-tools/
        echo  Select: Desktop development with C++
        echo  Then run this installer again.
        echo.
        pause & exit /b 1
    )
)
echo  OK - Dependencies installed

REM ── Step 5: Credentials ──────────────────────────────────────────────────────
echo [5/5] Configuring credentials...
echo.

set CUR_ANTHROPIC=
set CUR_WALLET=
set CUR_PK=
set CUR_NETWORK=mainnet

if exist "%ENV_FILE%" (
    echo  Found existing .env - press ENTER to keep current values.
    echo.
    for /f "usebackq tokens=1,* delims==" %%a in ("%ENV_FILE%") do (
        if "%%a"=="ANTHROPIC_API_KEY"  set CUR_ANTHROPIC=%%b
        if "%%a"=="HL_WALLET_ADDRESS"  set CUR_WALLET=%%b
        if "%%a"=="HL_PRIVATE_KEY"     set CUR_PK=%%b
        if "%%a"=="HL_NETWORK"         set CUR_NETWORK=%%b
    )
) else (
    if exist "%HV_DIR%\hypervibe\.env.example" (
        copy "%HV_DIR%\hypervibe\.env.example" "%ENV_FILE%" >nul
    )
)

echo  ==========================================
echo   CREDENTIALS SETUP
echo  ==========================================
echo.

echo  [A] ANTHROPIC_API_KEY
echo      Get yours at: https://console.anthropic.com
if not "!CUR_ANTHROPIC!"=="" echo      Current: !CUR_ANTHROPIC:~0,20!...
set /p NEW_ANTHROPIC="      Enter value (ENTER to keep): "
if "!NEW_ANTHROPIC!"=="" (set FINAL_ANTHROPIC=!CUR_ANTHROPIC!) else (set FINAL_ANTHROPIC=!NEW_ANTHROPIC!)
echo.

echo  [B] HL_WALLET_ADDRESS
echo      Your main Hyperliquid wallet (0x...) - where your funds are
if not "!CUR_WALLET!"=="" echo      Current: !CUR_WALLET:~0,10!...!CUR_WALLET:~-4!
set /p NEW_WALLET="      Enter value (ENTER to keep): "
if "!NEW_WALLET!"=="" (set FINAL_WALLET=!CUR_WALLET!) else (set FINAL_WALLET=!NEW_WALLET!)
echo.

echo  [C] HL_PRIVATE_KEY
echo      API Wallet key from: https://app.hyperliquid.xyz/API
echo      (cannot withdraw funds - safer than main wallet key)
if not "!CUR_PK!"=="" echo      Current: !CUR_PK:~0,6!...!CUR_PK:~-4! (set)
set /p NEW_PK="      Enter value (ENTER to keep): "
if "!NEW_PK!"=="" (set FINAL_PK=!CUR_PK!) else (set FINAL_PK=!NEW_PK!)
echo.

echo  [D] HL_NETWORK
echo      1 = mainnet  (real funds, live trading)
echo      2 = testnet  (no real funds, safe for testing)
echo      Current: !CUR_NETWORK!
set /p NET_CHOICE="      Choose 1 or 2 (ENTER to keep): "
if "!NET_CHOICE!"=="1" (set FINAL_NETWORK=mainnet) else if "!NET_CHOICE!"=="2" (set FINAL_NETWORK=testnet) else (set FINAL_NETWORK=!CUR_NETWORK!)
echo.

REM ── Write .env ───────────────────────────────────────────────────────────────
(
    echo # HyperVibe Configuration
    echo # Last configured: %DATE% %TIME%
    echo.
    echo ANTHROPIC_API_KEY=!FINAL_ANTHROPIC!
    echo HL_WALLET_ADDRESS=!FINAL_WALLET!
    echo HL_PRIVATE_KEY=!FINAL_PK!
    echo HL_NETWORK=!FINAL_NETWORK!
    echo PORT=3001
) > "%ENV_FILE%"
echo  OK - Saved to %ENV_FILE%
echo.

REM ── Create Start.bat in same folder as installer ──────────────────────────────
set STARTBAT=%INSTALL_DIR%\StartHyperVibe.bat
(
    echo @echo off
    echo cd /d "%HV_DIR%\hypervibe"
    echo npm start
    echo pause
) > "%STARTBAT%"
echo  OK - Created StartHyperVibe.bat in %INSTALL_DIR%
echo.

REM ── Summary ──────────────────────────────────────────────────────────────────
echo  ==========================================
echo   DONE! HyperVibe installed in:
echo   %HV_DIR%
echo  ==========================================
echo.
echo   Anthropic key  : !FINAL_ANTHROPIC:~0,20!...
echo   Wallet         : !FINAL_WALLET:~0,10!...!FINAL_WALLET:~-4!
echo   Private key    : !FINAL_PK:~0,6!...!FINAL_PK:~-4!
echo   Network        : !FINAL_NETWORK!
echo.
echo   To start: double-click StartHyperVibe.bat
echo         or: cd %HV_DIR%\hypervibe and npm start
echo.

set /p LAUNCH="  Launch HyperVibe now? (Y/N): "
if /i "!LAUNCH!"=="Y" (
    cd /d "%HV_DIR%\hypervibe"
    call npm start
) else (
    echo.
    echo  Run this installer again anytime to update credentials.
    pause
)

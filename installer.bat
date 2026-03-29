@echo off
setlocal EnableDelayedExpansion
title HyperVibe Installer
chcp 437 >nul

echo.
echo  ==========================================
echo   HYPERVIBE - Installer v1.1
echo   Autonomous Hyperliquid Trading Agent
echo  ==========================================
echo.

set INSTALL_DIR=%USERPROFILE%\HyperVibe
set ENV_FILE=%INSTALL_DIR%\hypervibe\.env

REM ── Step 1: Node.js ─────────────────────────────────────────────────────────
echo [1/5] Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Node.js not found.
    echo  Download from: https://nodejs.org  (choose LTS)
    echo  Install it then run this installer again.
    echo.
    pause
    exit /b 1
)
for /f %%v in ('node --version') do set NODEVER=%%v
echo  OK - Node.js %NODEVER%

REM ── Step 2: Git ─────────────────────────────────────────────────────────────
echo [2/5] Checking Git...
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Git not found.
    echo  Download from: https://git-scm.com
    echo.
    pause
    exit /b 1
)
echo  OK - Git found

REM ── Step 3: Clone / Pull ────────────────────────────────────────────────────
echo [3/5] Setting up HyperVibe...
if exist "%INSTALL_DIR%\hypervibe\package.json" (
    echo  Already installed - pulling latest updates...
    cd /d "%INSTALL_DIR%"
    git pull
    echo  OK - Updated
) else (
    echo  Cloning into %INSTALL_DIR%...
    git clone https://github.com/mikeminer/HyperVibe.git "%INSTALL_DIR%"
    if %errorlevel% neq 0 (
        echo  ERROR: Clone failed. Check your internet connection.
        pause
        exit /b 1
    )
    echo  OK - Cloned
)

REM ── Step 4: npm install ──────────────────────────────────────────────────────
echo [4/5] Installing dependencies (this may take a minute)...
cd /d "%INSTALL_DIR%\hypervibe"

echo  Running npm install...
call npm install
echo  npm install exit code: %errorlevel%

if %errorlevel% neq 0 (
    echo.
    echo  First attempt failed - trying npm rebuild...
    call npm install --ignore-scripts
    call npm rebuild better-sqlite3
    if %errorlevel% neq 0 (
        echo.
        echo  ERROR: better-sqlite3 failed to compile.
        echo  You need Visual Studio Build Tools:
        echo  https://visualstudio.microsoft.com/visual-cpp-build-tools/
        echo  Select: "Desktop development with C++"
        echo  Then run this installer again.
        echo.
        pause
        exit /b 1
    )
)
echo  OK - Dependencies ready

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
    if exist "%INSTALL_DIR%\hypervibe\.env.example" (
        copy "%INSTALL_DIR%\hypervibe\.env.example" "%ENV_FILE%" >nul
    )
    echo  No .env found - please enter your credentials below.
    echo.
)

echo  ==========================================
echo   CREDENTIALS SETUP
echo  ==========================================
echo.

echo  [A] ANTHROPIC_API_KEY
echo      Get yours at: https://console.anthropic.com
if not "!CUR_ANTHROPIC!"=="" (
    echo      Current: !CUR_ANTHROPIC:~0,20!...
)
set /p NEW_ANTHROPIC="      New value (ENTER to keep): "
if "!NEW_ANTHROPIC!"=="" (
    set FINAL_ANTHROPIC=!CUR_ANTHROPIC!
) else (
    set FINAL_ANTHROPIC=!NEW_ANTHROPIC!
)
echo.

echo  [B] HL_WALLET_ADDRESS
echo      Your main Hyperliquid wallet (0x...) - where funds are
if not "!CUR_WALLET!"=="" (
    echo      Current: !CUR_WALLET:~0,10!...!CUR_WALLET:~-4!
)
set /p NEW_WALLET="      New value (ENTER to keep): "
if "!NEW_WALLET!"=="" (
    set FINAL_WALLET=!CUR_WALLET!
) else (
    set FINAL_WALLET=!NEW_WALLET!
)
echo.

echo  [C] HL_PRIVATE_KEY
echo      API Wallet key from: https://app.hyperliquid.xyz/API
echo      (safer than main wallet - cannot withdraw funds)
if not "!CUR_PK!"=="" (
    echo      Current: !CUR_PK:~0,6!...!CUR_PK:~-4! (already set)
)
set /p NEW_PK="      New value (ENTER to keep): "
if "!NEW_PK!"=="" (
    set FINAL_PK=!CUR_PK!
) else (
    set FINAL_PK=!NEW_PK!
)
echo.

echo  [D] HL_NETWORK
echo      1 = mainnet  (real funds, live trading)
echo      2 = testnet  (no real funds, safe for testing)
echo      Current: !CUR_NETWORK!
set /p NET_CHOICE="      Choose 1 or 2 (ENTER to keep): "
if "!NET_CHOICE!"=="1" (
    set FINAL_NETWORK=mainnet
) else if "!NET_CHOICE!"=="2" (
    set FINAL_NETWORK=testnet
) else (
    set FINAL_NETWORK=!CUR_NETWORK!
)
echo.

REM ── Write .env ───────────────────────────────────────────────────────────────
(
    echo # HyperVibe Configuration
    echo # Last configured: %DATE% %TIME%
    echo.
    echo # Anthropic API key - required
    echo # Get from: https://console.anthropic.com
    echo ANTHROPIC_API_KEY=!FINAL_ANTHROPIC!
    echo.
    echo # Hyperliquid main wallet address (0x...)
    echo # This is where your funds are - used to read balances
    echo HL_WALLET_ADDRESS=!FINAL_WALLET!
    echo.
    echo # Private key for signing orders
    echo # Use API Wallet key from: https://app.hyperliquid.xyz/API
    echo HL_PRIVATE_KEY=!FINAL_PK!
    echo.
    echo # Network: mainnet or testnet
    echo HL_NETWORK=!FINAL_NETWORK!
    echo.
    echo # Local server port
    echo PORT=3001
) > "%ENV_FILE%"

echo  OK - Credentials saved to %ENV_FILE%
echo.

REM ── Desktop shortcut ─────────────────────────────────────────────────────────
set SHORTCUT=%USERPROFILE%\Desktop\HyperVibe.bat
if not exist "!SHORTCUT!" (
    set /p MKSHORTCUT="  Create desktop shortcut? (Y/N): "
    if /i "!MKSHORTCUT!"=="Y" (
        (
            echo @echo off
            echo cd /d "%INSTALL_DIR%\hypervibe"
            echo npm start
            echo pause
        ) > "!SHORTCUT!"
        echo  OK - Shortcut created on Desktop
    )
    echo.
)

REM ── Summary ──────────────────────────────────────────────────────────────────
echo  ==========================================
echo   INSTALLATION COMPLETE
echo  ==========================================
echo.
echo   Anthropic key  : !FINAL_ANTHROPIC:~0,20!...
echo   Wallet         : !FINAL_WALLET:~0,10!...!FINAL_WALLET:~-4!
echo   Private key    : !FINAL_PK:~0,6!...!FINAL_PK:~-4!
echo   Network        : !FINAL_NETWORK!
echo.
echo   To start HyperVibe:
echo   cd %INSTALL_DIR%\hypervibe
echo   npm start
echo.
echo   Or double-click HyperVibe.bat on the Desktop.
echo.

set /p LAUNCH="  Launch HyperVibe now? (Y/N): "
if /i "!LAUNCH!"=="Y" (
    cd /d "%INSTALL_DIR%\hypervibe"
    call npm start
) else (
    echo.
    echo  Run this installer again anytime to update credentials.
    pause
)

@echo off
setlocal EnableDelayedExpansion
title HyperVibe Installer
chcp 437 >nul

set INSTALL_DIR=%~dp0
set INSTALL_DIR=%INSTALL_DIR:~0,-1%
set HV_DIR=%INSTALL_DIR%\HyperVibe
set APP_DIR=%HV_DIR%\hypervibe
set ENV_FILE=%APP_DIR%\.env
set TEMP_DIR=%TEMP%

echo.
echo  ==========================================
echo   HYPERVIBE - Installer v1.6
echo   Installing in: %INSTALL_DIR%
echo  ==========================================
echo.

REM ── Step 1: Node.js ──────────────────────────────────────────────────────────
echo [1/5] Checking Node.js...
node --version >nul 2>&1
if %errorlevel% equ 0 goto NODE_OK

echo  Node.js not found - opening installer...
echo  1. Install Node.js from the browser window that will open
echo  2. Click Next, Next, Install (default options are fine)
echo  3. Come back here and press ENTER when done
echo.
start https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi
pause
REM Refresh PATH and retry
set "PATH=C:\Program Files\nodejs;%PATH%"
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  Node.js still not found. Please close this window and run the installer again after installing Node.js.
    pause & exit /b 0
)

:NODE_OK
for /f %%v in ('node --version') do set NODEVER=%%v
echo  OK - Node.js %NODEVER%

REM ── Step 2: Git ──────────────────────────────────────────────────────────────
echo [2/5] Checking Git...
git --version >nul 2>&1
if %errorlevel% equ 0 goto GIT_OK

echo  Git not found - opening installer...
echo  1. Install Git from the browser window that will open
echo  2. Click Next all the way through (default options are fine)
echo  3. Come back here and press ENTER when done
echo.
start https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.2/Git-2.47.1.2-64-bit.exe
pause
REM Refresh PATH and retry
set "PATH=C:\Program Files\Git\cmd;%PATH%"
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  Git still not found. Please close this window and run the installer again after installing Git.
    pause & exit /b 0
)

:GIT_OK
echo  OK - Git found

REM ── Step 3: Clone / Pull ─────────────────────────────────────────────────────
echo [3/5] Setting up HyperVibe...
if exist "%APP_DIR%\package.json" goto DO_PULL
echo  Cloning from GitHub into %HV_DIR%...
git clone https://github.com/mikeminer/HyperVibe.git "%HV_DIR%"
if %errorlevel% neq 0 ( echo  ERROR: Clone failed. Check internet. & pause & exit /b 1 )
echo  OK - Cloned
goto STEP4

:DO_PULL
echo  Already installed - pulling latest...
cd /d "%HV_DIR%"
git pull
echo  OK - Updated

REM ── Step 4: npm install ─────────────────────────────────────────────────────
:STEP4
echo [4/5] Installing dependencies...
cd /d "%APP_DIR%"

REM Clean old node_modules to avoid version conflicts
if exist "node_modules" (
    echo  Removing old modules to avoid conflicts...
    rmdir /s /q node_modules >nul 2>&1
)

echo  Running npm install...
call npm install
if %errorlevel% neq 0 (
    echo  ERROR: npm install failed. Check internet connection.
    pause & exit /b 1
)
echo  OK - Dependencies installed

REM ── Step 5: Credentials ──────────────────────────────────────────────────────
echo [5/5] Configuring credentials...
echo.

set CUR_ANTHROPIC=
set CUR_WALLET=
set CUR_PK=
set CUR_NETWORK=mainnet
set CUR_TG_TOKEN=
set CUR_TG_CHAT=

if not exist "%ENV_FILE%" goto NO_ENV
echo  Found existing .env - press ENTER to keep current values.
echo.
for /f "usebackq tokens=1,* delims==" %%a in ("%ENV_FILE%") do (
    if "%%a"=="ANTHROPIC_API_KEY"  set CUR_ANTHROPIC=%%b
    if "%%a"=="HL_WALLET_ADDRESS"  set CUR_WALLET=%%b
    if "%%a"=="HL_PRIVATE_KEY"     set CUR_PK=%%b
    if "%%a"=="HL_NETWORK"         set CUR_NETWORK=%%b
    if "%%a"=="TELEGRAM_BOT_TOKEN" set CUR_TG_TOKEN=%%b
    if "%%a"=="TELEGRAM_CHAT_ID"   set CUR_TG_CHAT=%%b
)
goto CREDS

:NO_ENV
if exist "%APP_DIR%\.env.example" copy "%APP_DIR%\.env.example" "%ENV_FILE%" >nul

:CREDS
echo  ==========================================
echo   CREDENTIALS SETUP
echo  ==========================================
echo.

echo  [A] ANTHROPIC_API_KEY
echo      Get yours at: https://console.anthropic.com
if not "!CUR_ANTHROPIC!"=="" echo      Current: !CUR_ANTHROPIC:~0,20!...
set /p NEW_A="      Enter value (ENTER to keep): "
if "!NEW_A!"=="" (set FINAL_A=!CUR_ANTHROPIC!) else (set FINAL_A=!NEW_A!)
echo.

echo  [B] HL_WALLET_ADDRESS
echo      Your Hyperliquid wallet (0x...) where your funds are
if not "!CUR_WALLET!"=="" echo      Current: !CUR_WALLET:~0,10!...!CUR_WALLET:~-4!
set /p NEW_W="      Enter value (ENTER to keep): "
if "!NEW_W!"=="" (set FINAL_W=!CUR_WALLET!) else (set FINAL_W=!NEW_W!)
echo.

echo  [C] HL_PRIVATE_KEY
echo      API Wallet key: https://app.hyperliquid.xyz/API
if not "!CUR_PK!"=="" echo      Current: !CUR_PK:~0,6!...!CUR_PK:~-4! (set)
set /p NEW_K="      Enter value (ENTER to keep): "
if "!NEW_K!"=="" (set FINAL_K=!CUR_PK!) else (set FINAL_K=!NEW_K!)
echo.

echo  [D] HL_NETWORK
echo      1 = mainnet  (real funds)
echo      2 = testnet  (no real funds)
echo      Current: !CUR_NETWORK!
set /p NET="      Choose 1 or 2 (ENTER to keep): "
if "!NET!"=="1" (set FINAL_NET=mainnet) else if "!NET!"=="2" (set FINAL_NET=testnet) else (set FINAL_NET=!CUR_NETWORK!)
echo.

echo  [E] TELEGRAM_BOT_TOKEN  (optional - for trade approvals via Telegram)
echo      Create a bot at: https://t.me/BotFather  then /newbot
if not "!CUR_TG_TOKEN!"=="" echo      Current: !CUR_TG_TOKEN:~0,10!... (set)
set /p NEW_TGT="      Enter value (ENTER to skip/keep): "
if "!NEW_TGT!"=="" (set FINAL_TGT=!CUR_TG_TOKEN!) else (set FINAL_TGT=!NEW_TGT!)
echo.

echo  [F] TELEGRAM_CHAT_ID  (optional - your Telegram user/group ID)
echo      Get your ID at: https://t.me/userinfobot
if not "!CUR_TG_CHAT!"=="" echo      Current: !CUR_TG_CHAT! (set)
set /p NEW_TGC="      Enter value (ENTER to skip/keep): "
if "!NEW_TGC!"=="" (set FINAL_TGC=!CUR_TG_CHAT!) else (set FINAL_TGC=!NEW_TGC!)
echo.

(
    echo # HyperVibe Configuration - %DATE%
    echo ANTHROPIC_API_KEY=!FINAL_A!
    echo HL_WALLET_ADDRESS=!FINAL_W!
    echo HL_PRIVATE_KEY=!FINAL_K!
    echo HL_NETWORK=!FINAL_NET!
    echo PORT=3001
    echo.
    echo # Telegram (optional - leave empty to disable)
    echo TELEGRAM_BOT_TOKEN=!FINAL_TGT!
    echo TELEGRAM_CHAT_ID=!FINAL_TGC!
) > "%ENV_FILE%"
echo  OK - Saved to %ENV_FILE%
echo.

(
    echo @echo off
    echo cd /d "%APP_DIR%"
    echo npm start
    echo pause
) > "%INSTALL_DIR%\StartHyperVibe.bat"
echo  OK - Created StartHyperVibe.bat
echo.

echo  ==========================================
echo   DONE! HyperVibe installed.
echo   Location: %HV_DIR%
echo   Network:  !FINAL_NET!
echo  ==========================================
echo.
set /p LAUNCH="  Launch now? (Y/N): "
if /i "!LAUNCH!"=="Y" (
    cd /d "%APP_DIR%"
    call npm start
)
echo.
pause

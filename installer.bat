@echo off
setlocal EnableDelayedExpansion
title HyperVibe Installer

echo.
echo  ██╗  ██╗██╗   ██╗██████╗ ███████╗██████╗ ██╗   ██╗██╗██████╗ ███████╗
echo  ██║  ██║╚██╗ ██╔╝██╔══██╗██╔════╝██╔══██╗██║   ██║██║██╔══██╗██╔════╝
echo  ███████║ ╚████╔╝ ██████╔╝█████╗  ██████╔╝██║   ██║██║██████╔╝█████╗
echo  ██╔══██║  ╚██╔╝  ██╔═══╝ ██╔══╝  ██╔══██╗╚██╗ ██╔╝██║██╔══██╗██╔══╝
echo  ██║  ██║   ██║   ██║     ███████╗██║  ██║ ╚████╔╝ ██║██████╔╝███████╗
echo  ╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚═════╝ ╚══════╝
echo.
echo  Installer v1.0 - The agentic harness for Hyperliquid
echo  ─────────────────────────────────────────────────────
echo.

REM ── Step 1: Check Node.js ────────────────────────────────────────────────────
echo  [1/5] Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [X] Node.js not found.
    echo      Download from: https://nodejs.org
    echo      Install Node.js LTS, then run this installer again.
    pause
    exit /b 1
)

for /f "tokens=1 delims=v" %%a in ('node --version') do set NODEVER=%%a
for /f "tokens=1 delims=." %%a in ('node --version') do set NODEMAJ=%%a
set NODEMAJ=!NODEMAJ:v=!
if !NODEMAJ! LSS 20 (
    echo  [X] Node.js version too old: !NODEMAJ! - need 20 or higher
    echo      Download from: https://nodejs.org
    pause
    exit /b 1
)
echo  [OK] Node.js !NODEMAJ! found

REM ── Step 2: Check Git ────────────────────────────────────────────────────────
echo  [2/5] Checking Git...
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [X] Git not found.
    echo      Download from: https://git-scm.com
    pause
    exit /b 1
)
echo  [OK] Git found

REM ── Step 3: Clone repository ─────────────────────────────────────────────────
echo  [3/5] Cloning HyperVibe...
set INSTALL_DIR=%USERPROFILE%\HyperVibe

if exist "%INSTALL_DIR%\hypervibe\package.json" (
    echo  [OK] HyperVibe already cloned - pulling latest updates...
    cd /d "%INSTALL_DIR%"
    git pull
) else (
    echo      Cloning into %INSTALL_DIR%...
    git clone https://github.com/mikeminer/HyperVibe.git "%INSTALL_DIR%"
    if %errorlevel% neq 0 (
        echo  [X] Clone failed. Check your internet connection.
        pause
        exit /b 1
    )
    echo  [OK] Cloned successfully
)

REM ── Step 4: Install dependencies ─────────────────────────────────────────────
echo  [4/5] Installing dependencies...
cd /d "%INSTALL_DIR%\hypervibe"

npm install >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] First install failed - trying with build tools...
    npm install --ignore-scripts >nul 2>&1
    npm rebuild better-sqlite3 2>&1
    if %errorlevel% neq 0 (
        echo.
        echo  [!] better-sqlite3 failed to compile.
        echo      You need Visual Studio Build Tools:
        echo      https://visualstudio.microsoft.com/visual-cpp-build-tools/
        echo      Select: "Desktop development with C++"
        echo      Then run this installer again.
        echo.
        pause
        exit /b 1
    )
)
echo  [OK] Dependencies installed

REM ── Step 5: Configure .env ───────────────────────────────────────────────────
echo  [5/5] Configuring credentials...

if not exist "%INSTALL_DIR%\hypervibe\.env" (
    copy "%INSTALL_DIR%\hypervibe\.env.example" "%INSTALL_DIR%\hypervibe\.env" >nul
    echo  [OK] Created .env file
) else (
    echo  [OK] .env already exists
)

REM ── Ask for credentials ───────────────────────────────────────────────────────
echo.
echo  ─────────────────────────────────────────────────────
echo  CONFIGURE YOUR CREDENTIALS
echo  ─────────────────────────────────────────────────────
echo.
echo  You need 3 things to use HyperVibe:
echo   1. Anthropic API key  → console.anthropic.com
echo   2. Hyperliquid wallet address  (your 0x... address)
echo   3. Hyperliquid private key     (from API wallet or main wallet)
echo.

set /p CONFIGURE="  Configure now? (Y/N): "
if /i "!CONFIGURE!"=="Y" (
    echo.
    set /p ANTHROPIC_KEY="  Anthropic API key (sk-ant-...): "
    set /p HL_ADDRESS="  Wallet address    (0x...):      "
    set /p HL_KEY="  Private key       (0x...):      "

    REM Write .env file
    (
        echo ANTHROPIC_API_KEY=!ANTHROPIC_KEY!
        echo HL_WALLET_ADDRESS=!HL_ADDRESS!
        echo HL_PRIVATE_KEY=!HL_KEY!
        echo HL_NETWORK=mainnet
        echo PORT=3001
    ) > "%INSTALL_DIR%\hypervibe\.env"

    echo.
    echo  [OK] Credentials saved to .env
)

REM ── Create desktop shortcut ───────────────────────────────────────────────────
echo.
set /p SHORTCUT="  Create desktop shortcut? (Y/N): "
if /i "!SHORTCUT!"=="Y" (
    set SHORTCUT_PATH=%USERPROFILE%\Desktop\HyperVibe.bat
    (
        echo @echo off
        echo cd /d "%INSTALL_DIR%\hypervibe"
        echo npm start
        echo pause
    ) > "!SHORTCUT_PATH!"
    echo  [OK] Shortcut created: Desktop\HyperVibe.bat
)

REM ── Done ─────────────────────────────────────────────────────────────────────
echo.
echo  ─────────────────────────────────────────────────────
echo  [OK] HyperVibe installed successfully!
echo  ─────────────────────────────────────────────────────
echo.
echo  To start HyperVibe:
echo    cd %INSTALL_DIR%\hypervibe
echo    npm start
echo.
echo  Or use the desktop shortcut if you created one.
echo.

set /p LAUNCH="  Launch HyperVibe now? (Y/N): "
if /i "!LAUNCH!"=="Y" (
    cd /d "%INSTALL_DIR%\hypervibe"
    npm start
) else (
    pause
)

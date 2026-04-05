@echo off
setlocal EnableDelayedExpansion
title HyperVibe Installer
chcp 437 >nul

set INSTALL_DIR=%~dp0
set INSTALL_DIR=%INSTALL_DIR:~0,-1%
set HV_DIR=%INSTALL_DIR%\HyperVibe
set APP_DIR=%HV_DIR%\hypervibe
set ENV_FILE=%APP_DIR%\.env

echo.
echo  ==========================================
echo   HYPERVIBE - Installer v2.3
echo   Installing in: %INSTALL_DIR%
echo  ==========================================
echo.

REM ── Step 1: Node.js ──────────────────────────────────────────────────────────
echo [1/6] Checking Node.js...
node --version >nul 2>&1
if %errorlevel% equ 0 goto NODE_OK
echo  Node.js not found - opening installer...
echo  1. Install Node.js from the browser window that will open
echo  2. Click Next, Next, Install (default options are fine)
echo  3. Come back here and press ENTER when done
echo.
start https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi
pause
set "PATH=C:\Program Files\nodejs;%PATH%"
node --version >nul 2>&1
if %errorlevel% neq 0 ( echo  Node.js still not found. & pause & exit /b 0 )
:NODE_OK
for /f %%v in ('node --version') do set NODEVER=%%v
echo  OK - Node.js %NODEVER%

REM ── Step 2: Git ──────────────────────────────────────────────────────────────
echo [2/6] Checking Git...
git --version >nul 2>&1
if %errorlevel% equ 0 goto GIT_OK
echo  Git not found - opening installer...
start https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.2/Git-2.47.1.2-64-bit.exe
pause
set "PATH=C:\Program Files\Git\cmd;%PATH%"
git --version >nul 2>&1
if %errorlevel% neq 0 ( echo  Git still not found. & pause & exit /b 0 )
:GIT_OK
echo  OK - Git found

REM ── Step 3: Clone / Pull ─────────────────────────────────────────────────────
echo [3/6] Setting up HyperVibe...
if exist "%APP_DIR%\package.json" goto DO_PULL
echo  Cloning...
git clone https://github.com/mikeminer/HyperVibe.git "%HV_DIR%"
if %errorlevel% neq 0 ( echo  ERROR: Clone failed. & pause & exit /b 1 )
echo  OK - Cloned
goto STEP4
:DO_PULL
echo  Already installed - pulling latest...
cd /d "%HV_DIR%"
git pull
echo  OK - Updated

REM ── Step 4: npm install ──────────────────────────────────────────────────────
:STEP4
echo [4/6] Installing dependencies...
cd /d "%APP_DIR%"
if exist "node_modules" rmdir /s /q node_modules >nul 2>&1
call npm install
if %errorlevel% neq 0 ( echo  ERROR: npm install failed. & pause & exit /b 1 )
echo  OK - Dependencies installed

REM ── Step 5: Scelta motore AI ─────────────────────────────────────────────────
echo [5/6] AI Engine setup...
echo.
echo   [1] Anthropic API   - Claude cloud, a pagamento, qualita' massima
echo   [2] Qwen 2.5 14B    - Locale, gratuito, ~9GB RAM  (consigliato)
echo   [3] Gemma 4 26B MoE - Locale, gratuito, ~20GB RAM
echo.
set AI_CHOICE=
:ASK_AI
set /p AI_CHOICE="  Scelta [1/2/3]: "
if "!AI_CHOICE!"=="1" goto AI_ANTHROPIC
if "!AI_CHOICE!"=="2" goto AI_QWEN
if "!AI_CHOICE!"=="3" goto AI_GEMMA
goto ASK_AI

:AI_ANTHROPIC
set PROVIDER=anthropic
set OLLAMA_MODEL=
set CLAUDE_MODEL=claude-sonnet-4-20250514
set CUR_ANTHROPIC=
if exist "%ENV_FILE%" for /f "usebackq tokens=1,* delims==" %%a in ("%ENV_FILE%") do if "%%a"=="ANTHROPIC_API_KEY" set CUR_ANTHROPIC=%%b
echo.
echo  Ottieni la tua API key su: https://console.anthropic.com
if not "!CUR_ANTHROPIC!"=="" echo  Attuale: !CUR_ANTHROPIC:~0,20!...
set /p NEW_A="  Anthropic API Key (INVIO per mantenere): "
if "!NEW_A!"=="" (set FINAL_A=!CUR_ANTHROPIC!) else (set FINAL_A=!NEW_A!)
goto STEP6

:AI_QWEN
set PROVIDER=ollama
set OLLAMA_MODEL=qwen2.5:14b
set FINAL_A=
set CLAUDE_MODEL=
goto OLLAMA_SETUP

:AI_GEMMA
set PROVIDER=ollama
set OLLAMA_MODEL=gemma4:26b
set FINAL_A=
set CLAUDE_MODEL=
echo  NOTA: Richiede Ollama ^>= v0.20.1

:OLLAMA_SETUP
ollama --version >nul 2>&1
if %errorlevel% equ 0 goto OLLAMA_INSTALLED
echo  Ollama non trovato - apertura pagina download...
start https://ollama.com/download
pause
ollama --version >nul 2>&1
if %errorlevel% neq 0 ( echo  Ollama non trovato. Riesegui dopo installazione. & pause & exit /b 0 )
:OLLAMA_INSTALLED
echo  OK - Ollama installato
curl -s http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% neq 0 ( start /B ollama serve >nul 2>&1 & ping -n 4 127.0.0.1 >nul 2>&1 )
ollama list | findstr /i "!OLLAMA_MODEL:~0,10!" >nul 2>&1
if %errorlevel% neq 0 ( echo  Download !OLLAMA_MODEL!... & ollama pull !OLLAMA_MODEL! )

REM ── Step 6: Credenziali ───────────────────────────────────────────────────────
:STEP6
echo.
echo [6/6] Credenziali Hyperliquid...
echo.
set CUR_WALLET=
set CUR_PK=
set CUR_NETWORK=mainnet
set CUR_TG_TOKEN=
set CUR_TG_CHAT=
if exist "%ENV_FILE%" (
    for /f "usebackq tokens=1,* delims==" %%a in ("%ENV_FILE%") do (
        if "%%a"=="HL_WALLET_ADDRESS"  set CUR_WALLET=%%b
        if "%%a"=="HL_PRIVATE_KEY"     set CUR_PK=%%b
        if "%%a"=="HL_NETWORK"         set CUR_NETWORK=%%b
        if "%%a"=="TELEGRAM_BOT_TOKEN" set CUR_TG_TOKEN=%%b
        if "%%a"=="TELEGRAM_CHAT_ID"   set CUR_TG_CHAT=%%b
    )
)

echo  [A] HL_WALLET_ADDRESS
if not "!CUR_WALLET!"=="" echo      Attuale: !CUR_WALLET:~0,10!...!CUR_WALLET:~-4!
set /p NEW_W="      Valore (INVIO per mantenere): "
if "!NEW_W!"=="" (set FINAL_W=!CUR_WALLET!) else (set FINAL_W=!NEW_W!)
echo.

echo  [B] HL_PRIVATE_KEY  - Genera su: https://app.hyperliquid.xyz/API
if not "!CUR_PK!"=="" echo      Attuale: !CUR_PK:~0,6!...!CUR_PK:~-4!
set /p NEW_K="      Valore (INVIO per mantenere): "
if "!NEW_K!"=="" (set FINAL_K=!CUR_PK!) else (set FINAL_K=!NEW_K!)
echo.

echo  [C] HL_NETWORK - Attuale: !CUR_NETWORK!
set /p NET="      1=mainnet  2=testnet  (INVIO per mantenere): "
if "!NET!"=="1" (set FINAL_NET=mainnet) else if "!NET!"=="2" (set FINAL_NET=testnet) else (set FINAL_NET=!CUR_NETWORK!)
echo.

echo  [D] TELEGRAM_BOT_TOKEN (opzionale - INVIO per saltare)
set /p NEW_TGT="      Valore: "
if "!NEW_TGT!"=="" (set FINAL_TGT=!CUR_TG_TOKEN!) else (set FINAL_TGT=!NEW_TGT!)
echo.

echo  [E] TELEGRAM_CHAT_ID (opzionale - INVIO per saltare)
set /p NEW_TGC="      Valore: "
if "!NEW_TGC!"=="" (set FINAL_TGC=!CUR_TG_CHAT!) else (set FINAL_TGC=!NEW_TGC!)
echo.

REM ── Scrivi .env riga per riga con >> (nessun if dentro parentesi) ─────────────
if exist "%ENV_FILE%" del "%ENV_FILE%"

>>"%ENV_FILE%" echo PROVIDER=!PROVIDER!
if not "!OLLAMA_MODEL!"==""  >>"%ENV_FILE%" echo OLLAMA_MODEL=!OLLAMA_MODEL!
if not "!OLLAMA_MODEL!"==""  >>"%ENV_FILE%" echo OLLAMA_BASE_URL=http://localhost:11434
if not "!FINAL_A!"==""       >>"%ENV_FILE%" echo ANTHROPIC_API_KEY=!FINAL_A!
if not "!CLAUDE_MODEL!"==""  >>"%ENV_FILE%" echo CLAUDE_MODEL=!CLAUDE_MODEL!
>>"%ENV_FILE%" echo HL_WALLET_ADDRESS=!FINAL_W!
>>"%ENV_FILE%" echo HL_PRIVATE_KEY=!FINAL_K!
>>"%ENV_FILE%" echo HL_NETWORK=!FINAL_NET!
>>"%ENV_FILE%" echo PORT=3001
>>"%ENV_FILE%" echo TELEGRAM_BOT_TOKEN=!FINAL_TGT!
>>"%ENV_FILE%" echo TELEGRAM_CHAT_ID=!FINAL_TGC!

echo  OK - .env salvato

REM ── StartHyperVibe.bat ────────────────────────────────────────────────────────
> "%INSTALL_DIR%\StartHyperVibe.bat" echo @echo off
>> "%INSTALL_DIR%\StartHyperVibe.bat" echo cd /d "%APP_DIR%"
if "!PROVIDER!"=="ollama" >> "%INSTALL_DIR%\StartHyperVibe.bat" echo start /B ollama serve ^>nul 2^>^&1
if "!PROVIDER!"=="ollama" >> "%INSTALL_DIR%\StartHyperVibe.bat" echo ping -n 3 127.0.0.1 ^>nul 2^>^&1
>> "%INSTALL_DIR%\StartHyperVibe.bat" echo npm start
>> "%INSTALL_DIR%\StartHyperVibe.bat" echo pause
echo  OK - Creato StartHyperVibe.bat

echo.
echo  ==========================================
echo   INSTALLAZIONE COMPLETATA
echo   Motore AI : !PROVIDER! !OLLAMA_MODEL!
echo   Network   : !FINAL_NET!
echo  ==========================================
echo.
set /p LAUNCH="  Avviare HyperVibe ora? (S/N): "
if /i "!LAUNCH!"=="S" (
    if "!PROVIDER!"=="ollama" ( start /B ollama serve >nul 2>&1 & ping -n 3 127.0.0.1 >nul 2>&1 )
    cd /d "%APP_DIR%"
    call npm start
)
echo.
pause

@echo off
setlocal EnableDelayedExpansion
title HyperVibe Installer v3.2
chcp 437 >nul

set INSTALL_DIR=%~dp0
set INSTALL_DIR=%INSTALL_DIR:~0,-1%
set HV_DIR=%INSTALL_DIR%\HyperVibe
set APP_DIR=%HV_DIR%\hypervibe
set ENV_FILE=%APP_DIR%\.env
set TMP_DIR=%TEMP%\hypervibe_install
set TOOLS_DIR=%APP_DIR%\tools\autotrade

echo.
echo  ==========================================
echo   HYPERVIBE - Installer v3.2
echo   Cartella: %INSTALL_DIR%
echo  ==========================================
echo.

mkdir "%TMP_DIR%" >nul 2>&1

REM ── Step 1: Node.js ──────────────────────────────────────────────────────────
echo [1/7] Node.js...
node --version >nul 2>&1
if %errorlevel% equ 0 goto NODE_OK

winget --version >nul 2>&1
if %errorlevel% equ 0 (
    echo  Installazione via winget...
    winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    set "PATH=C:\Program Files\nodejs;%PATH%"
    node --version >nul 2>&1
    if %errorlevel% equ 0 goto NODE_OK
)

echo  Download Node.js...
curl -L --progress-bar -o "%TMP_DIR%\node-lts.msi" "https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi"
if %errorlevel% neq 0 ( echo  ERRORE: Download Node.js fallito. & pause & exit /b 1 )
echo  Installazione Node.js...
msiexec /i "%TMP_DIR%\node-lts.msi" /quiet /norestart ADDLOCAL=ALL
set "PATH=C:\Program Files\nodejs;%PATH%"
node --version >nul 2>&1
if %errorlevel% neq 0 ( echo  ERRORE: Riavvia il PC e riesegui. & pause & exit /b 1 )

:NODE_OK
for /f %%v in ('node --version') do set NODEVER=%%v
echo  OK - Node.js %NODEVER%

REM ── Step 2: Git ──────────────────────────────────────────────────────────────
echo [2/7] Git...
git --version >nul 2>&1
if %errorlevel% equ 0 goto GIT_OK

winget --version >nul 2>&1
if %errorlevel% equ 0 (
    echo  Installazione via winget...
    winget install --id Git.Git --silent --accept-package-agreements --accept-source-agreements
    set "PATH=C:\Program Files\Git\cmd;%PATH%"
    git --version >nul 2>&1
    if %errorlevel% equ 0 goto GIT_OK
)

echo  Download Git...
curl -L --progress-bar -o "%TMP_DIR%\git-setup.exe" "https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.2/Git-2.47.1.2-64-bit.exe"
if %errorlevel% neq 0 ( echo  ERRORE: Download Git fallito. & pause & exit /b 1 )
echo  Installazione Git...
"%TMP_DIR%\git-setup.exe" /VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS
set "PATH=C:\Program Files\Git\cmd;%PATH%"
git --version >nul 2>&1
if %errorlevel% neq 0 ( echo  ERRORE: Riavvia il PC e riesegui. & pause & exit /b 1 )

:GIT_OK
echo  OK - Git trovato

REM ── Step 3: Clone / Pull ─────────────────────────────────────────────────────
echo [3/7] HyperVibe...
if exist "%APP_DIR%\package.json" goto DO_PULL
echo  Cloning...
git clone https://github.com/mikeminer/HyperVibe.git "%HV_DIR%"
if %errorlevel% neq 0 ( echo  ERRORE: Clone fallito. & pause & exit /b 1 )
echo  OK - Clonato
goto STEP4
:DO_PULL
echo  Aggiornamento...
cd /d "%HV_DIR%"
git pull
echo  OK - Aggiornato

REM ── Step 4: npm install ──────────────────────────────────────────────────────
:STEP4
echo [4/7] Dipendenze npm...
cd /d "%APP_DIR%"
if exist "node_modules" rmdir /s /q node_modules >nul 2>&1
call npm install --silent
if %errorlevel% neq 0 ( echo  ERRORE: npm install fallito. & pause & exit /b 1 )
echo  OK - Dipendenze installate

REM ── Step 4b: Autotrade Integration ───────────────────────────────────────────
echo.
echo [4b/7] Autotrade Strategy Research (opzionale)...
echo   Installa il modulo di ricerca autonoma strategie via backtesting LLM.
echo   Richiede ~200MB. Necessario per il Playbook "Autotrade Strategy Research".
echo.
set INSTALL_AUTOTRADE=
set /p INSTALL_AUTOTRADE="  Installare il modulo Autotrade? (S/N): "
if /i "!INSTALL_AUTOTRADE!" neq "S" goto STEP5
echo.

REM Crea directory tools
mkdir "%TOOLS_DIR%" >nul 2>&1
echo  Cartella tools creata: %TOOLS_DIR%

REM Inizializza submodule autotrade
echo  Inizializzazione submodule autotrade...
cd /d "%HV_DIR%"
git submodule update --init --recursive
if %errorlevel% neq 0 (
    echo  ERRORE: submodule update fallito. Continuo senza modulo.
    goto STEP5
)
echo  OK - autotrade submodule inizializzato

REM Crea package.json per tools/autotrade se non esiste
if not exist "%TOOLS_DIR%\package.json" (
    echo  Inizializzazione package.json tools...
    (
        echo {
        echo   "name": "hypervibe-autotrade-tools",
        echo   "version": "1.0.0",
        echo   "type": "module",
        echo   "description": "Autotrade bridge and signal loader for HyperVibe"
        echo }
    ) > "%TOOLS_DIR%\package.json"
)

REM Installa dipendenze con versioni latest — evita problemi di versione inesistente
echo  Installazione @nktkas/hyperliquid ed ethers...
cd /d "%TOOLS_DIR%"
call npm install @nktkas/hyperliquid@latest ethers@latest --silent
if %errorlevel% neq 0 (
    echo  ERRORE: npm install tools fallito. Continuo senza modulo.
    goto STEP5
)
echo  OK - @nktkas/hyperliquid ed ethers installati

REM Installa Claude Code CLI (richiesto da autotrade per il loop LLM)
echo  Installazione Claude Code CLI...
claude --version >nul 2>&1
if %errorlevel% equ 0 (
    echo  OK - Claude Code CLI gia' presente
) else (
    call npm install -g @anthropic-ai/claude-code --silent
    if %errorlevel% neq 0 (
        echo  ATTENZIONE: Claude Code CLI non installato.
        echo  Installa manualmente: npm install -g @anthropic-ai/claude-code
    ) else (
        echo  OK - Claude Code CLI installato
    )
)

REM Verifica presenza script bridge e loader
set MISSING_SCRIPTS=0
if not exist "%TOOLS_DIR%\autotrade-bridge.js" set MISSING_SCRIPTS=1
if not exist "%TOOLS_DIR%\signal-loader.js"    set MISSING_SCRIPTS=1

if "!MISSING_SCRIPTS!"=="1" (
    echo.
    echo  ATTENZIONE: autotrade-bridge.js e/o signal-loader.js non trovati in:
    echo   %TOOLS_DIR%
    echo  Copiali manualmente da:
    echo   https://github.com/mikeminer/HyperVibe/tree/main/hypervibe/tools/autotrade/
    echo.
) else (
    echo  OK - autotrade-bridge.js e signal-loader.js presenti
)

REM Crea cartella segnali
mkdir "%APP_DIR%\playbooks\signals" >nul 2>&1
echo  OK - Cartella playbooks\signals creata

echo.
echo  ==========================================
echo   Autotrade installato in:
echo   %TOOLS_DIR%
echo.
echo   Uso da chat HyperVibe:
echo   "Ricerca una strategia su SOL con autotrade"
echo  ==========================================
echo.
set INSTALL_AUTOTRADE_OK=1

REM ── Step 5: Scelta motore AI ─────────────────────────────────────────────────
:STEP5
echo [5/7] Motore AI...
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
set NEED_OLLAMA=0
set CUR_ANTHROPIC=
if exist "%ENV_FILE%" for /f "usebackq tokens=1,* delims==" %%a in ("%ENV_FILE%") do if "%%a"=="ANTHROPIC_API_KEY" set CUR_ANTHROPIC=%%b
echo.
if not "!CUR_ANTHROPIC!"=="" echo  Attuale: !CUR_ANTHROPIC:~0,20!...
set /p NEW_A="  Anthropic API Key (INVIO per mantenere): "
if "!NEW_A!"=="" (set FINAL_A=!CUR_ANTHROPIC!) else (set FINAL_A=!NEW_A!)
goto STEP6

:AI_QWEN
set PROVIDER=ollama
set OLLAMA_MODEL=qwen2.5:14b
set NEED_OLLAMA=1
set FORCE_UPDATE_OLLAMA=0
set FINAL_A=
set CLAUDE_MODEL=
goto OLLAMA_SETUP

:AI_GEMMA
set PROVIDER=ollama
set OLLAMA_MODEL=gemma4:26b
set NEED_OLLAMA=1
set FORCE_UPDATE_OLLAMA=1
set FINAL_A=
set CLAUDE_MODEL=

REM ── Ollama ───────────────────────────────────────────────────────────────────
:OLLAMA_SETUP
echo.
echo  Verifica Ollama...

ollama --version >nul 2>&1
if %errorlevel% neq 0 goto INSTALL_OLLAMA

if "!FORCE_UPDATE_OLLAMA!"=="1" (
    ollama --version > "%TMP_DIR%\olv.txt" 2>&1
    node -e "var s=require('fs').readFileSync(process.env.TEMP+'\\hypervibe_install\\olv.txt','utf8');var m=s.match(/(\d+)\.(\d+)/);process.exit(!m||parseInt(m[2])<20?1:0);" >nul 2>&1
    if !errorlevel! equ 0 (
        echo  OK - Ollama gia' aggiornato, skip download
        goto OLLAMA_READY
    )
    echo  Ollama troppo vecchio per gemma4 - aggiornamento in corso...
    goto INSTALL_OLLAMA
)

goto OLLAMA_READY

:INSTALL_OLLAMA
echo  Download Ollama...
curl -L --progress-bar -o "%TMP_DIR%\OllamaSetup.exe" "https://ollama.com/download/OllamaSetup.exe"
if %errorlevel% neq 0 ( echo  ERRORE: Download Ollama fallito. & pause & exit /b 1 )
echo  Installazione Ollama...
"%TMP_DIR%\OllamaSetup.exe" /S
echo  Attendo avvio servizio...
ping -n 10 127.0.0.1 >nul 2>&1
set "PATH=%LOCALAPPDATA%\Programs\Ollama;%PATH%"
ollama --version >nul 2>&1
if %errorlevel% neq 0 ( echo  ERRORE: Ollama non installato. & pause & exit /b 1 )

:OLLAMA_READY
for /f "tokens=*" %%v in ('ollama --version 2^>nul') do set OLLAMA_VER=%%v
echo  OK - Ollama (!OLLAMA_VER!)

curl -s http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% neq 0 (
    echo  Avvio server Ollama...
    start /B ollama serve >nul 2>&1
    ping -n 6 127.0.0.1 >nul 2>&1
)

ollama list 2>nul | findstr /i "!OLLAMA_MODEL:~0,10!" >nul 2>&1
if %errorlevel% equ 0 (
    echo  OK - !OLLAMA_MODEL! gia' presente
    goto STEP6
)
echo  Download !OLLAMA_MODEL! (potrebbe richiedere alcuni minuti)...
ollama pull !OLLAMA_MODEL!
if %errorlevel% neq 0 ( echo  ERRORE: Download modello fallito. & pause & exit /b 1 )
echo  OK - !OLLAMA_MODEL! scaricato

REM ── Step 6: Credenziali ───────────────────────────────────────────────────────
:STEP6
echo.
echo [6/7] Credenziali Hyperliquid...
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

REM ── Step 7: Scrivi .env ──────────────────────────────────────────────────────
:STEP7
echo [7/7] Salvataggio configurazione...
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

if "!INSTALL_AUTOTRADE_OK!"=="1" (
    >>"%ENV_FILE%" echo AUTOTRADE_DIR=!TOOLS_DIR!\autotrade
    >>"%ENV_FILE%" echo SIGNALS_DIR=!APP_DIR!\playbooks\signals
)

echo  OK - .env salvato
rmdir /s /q "%TMP_DIR%" >nul 2>&1

echo.
echo  ==========================================
echo   INSTALLAZIONE COMPLETATA
echo   Motore AI : !PROVIDER! !OLLAMA_MODEL!
echo   Network   : !FINAL_NET!
if "!INSTALL_AUTOTRADE_OK!"=="1" (
echo   Autotrade : INSTALLATO
echo   Playbook  : "Autotrade Strategy Research"
)
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

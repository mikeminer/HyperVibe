@echo off
setlocal EnableDelayedExpansion
title HyperVibe Installer v3.5
chcp 437 >nul

set INSTALL_DIR=%~dp0
set INSTALL_DIR=%INSTALL_DIR:~0,-1%
set TMP_DIR=%TEMP%\hypervibe_install

echo.
echo  ==========================================
echo   HYPERVIBE - Installer v3.5
echo   Cartella: %INSTALL_DIR%
echo  ==========================================
echo.

mkdir "%TMP_DIR%" >nul 2>&1

REM ── Rileva se siamo gia' dentro la repo o fuori ──────────────────────────────
if exist "%INSTALL_DIR%\hypervibe\package.json" (
    set HV_DIR=%INSTALL_DIR%
    set APP_DIR=%INSTALL_DIR%\hypervibe
    set ALREADY_CLONED=1
) else (
    set HV_DIR=%INSTALL_DIR%\HyperVibe
    set APP_DIR=%INSTALL_DIR%\HyperVibe\hypervibe
    set ALREADY_CLONED=0
)

set ENV_FILE=%APP_DIR%\.env
set TOOLS_DIR=%APP_DIR%\tools\autotrade
set THY_DIR=%APP_DIR%\tri_hybrid_engine

REM ── Fix automatico: corregge PROVIDER=trihybrid in .env gia' esistenti ───────
if exist "%ENV_FILE%" (
    powershell -Command "(Get-Content '%ENV_FILE%') -replace '^PROVIDER=trihybrid', 'PROVIDER=anthropic' | Set-Content '%ENV_FILE%'" >nul 2>&1
)

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
set _SKIP_CLONE=0
if "!ALREADY_CLONED!"=="1" (
    echo  Repo gia' presente - salto clone.
    git -C "%HV_DIR%" pull >nul 2>&1
    echo  OK - Aggiornato ^(o non-git, proseguo^)
    set _SKIP_CLONE=1
)
if "!_SKIP_CLONE!"=="0" if exist "%APP_DIR%\package.json" (
    echo  Aggiornamento...
    git -C "%HV_DIR%" pull >nul 2>&1
    echo  OK - Aggiornato
    set _SKIP_CLONE=1
)
if "!_SKIP_CLONE!"=="1" goto STEP4
echo  Cloning...
git clone https://github.com/mikeminer/HyperVibe.git "%HV_DIR%"
if %errorlevel% neq 0 ( echo  ERRORE: Clone fallito. & pause & exit /b 1 )
echo  OK - Clonato

REM ── Step 4: npm install ──────────────────────────────────────────────────────
:STEP4
echo [4/7] Dipendenze npm...
cd /d "%APP_DIR%"
if not exist "package.json" (
    echo  ERRORE: package.json non trovato in %APP_DIR%
    pause & exit /b 1
)
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

mkdir "%TOOLS_DIR%" >nul 2>&1
echo  Cartella tools creata: %TOOLS_DIR%

echo  Inizializzazione submodule autotrade...
cd /d "%HV_DIR%"
git submodule update --init --recursive
if %errorlevel% neq 0 (
    echo  ERRORE: submodule update fallito. Continuo senza modulo.
    goto STEP5
)
echo  OK - autotrade submodule inizializzato

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

echo  Installazione @nktkas/hyperliquid ed ethers...
cd /d "%TOOLS_DIR%"
call npm install @nktkas/hyperliquid@latest ethers@latest --silent
if %errorlevel% neq 0 (
    echo  ERRORE: npm install tools fallito. Continuo senza modulo.
    goto STEP5
)
echo  OK - @nktkas/hyperliquid ed ethers installati

echo  Installazione Claude Code CLI...
call claude --version >nul 2>&1
if %errorlevel% equ 0 goto CLAUDE_OK

call npm.cmd --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERRORE: npm non trovato. Installa Node.js prima di continuare.
    pause
    exit /b 1
)

echo  Installazione Claude Code CLI...
call npm.cmd install -g @anthropic-ai/claude-code --silent
if %errorlevel% neq 0 (
    echo  ATTENZIONE: Claude Code CLI non installato.
    echo  Installa manualmente: npm install -g @anthropic-ai/claude-code
    pause
    exit /b 1
)

call claude --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERRORE: Claude Code CLI risulta non disponibile dopo l'installazione.
    echo  Prova a chiudere e riaprire il terminale, poi riesegui lo script.
    pause
    exit /b 1
)

:CLAUDE_OK
echo  OK - Claude Code CLI trovato

set MISSING_SCRIPTS=0
if not exist "%TOOLS_DIR%\autotrade-bridge.js" set MISSING_SCRIPTS=1
if not exist "%TOOLS_DIR%\signal-loader.js"    set MISSING_SCRIPTS=1
if "!MISSING_SCRIPTS!"=="1" (
    echo.
    echo  ATTENZIONE: autotrade-bridge.js e/o signal-loader.js non trovati in:
    echo   %TOOLS_DIR%
    echo.
) else (
    echo  OK - autotrade-bridge.js e signal-loader.js presenti
)

mkdir "%APP_DIR%\playbooks\signals" >nul 2>&1
echo  OK - Cartella playbooks\signals creata
echo.
set INSTALL_AUTOTRADE_OK=1

REM ── Step 5: Scelta motore AI ─────────────────────────────────────────────────
:STEP5
echo [5/7] Motore AI...
echo.
echo   [1] Solo API          - Claude cloud (Anthropic), a pagamento
echo   [2] Solo Locale       - Modello offline gratuito (Ollama)
echo   [3] Tri-Hybrid Engine - LLaMA+GPT+Claude con routing intelligente
echo.
set AI_CHOICE=
:ASK_AI
set /p AI_CHOICE="  Scelta [1/2/3]: "
if "!AI_CHOICE!"=="1" goto AI_ANTHROPIC
if "!AI_CHOICE!"=="2" goto AI_LOCAL_MENU
if "!AI_CHOICE!"=="3" goto AI_TRIHYBRID
goto ASK_AI

REM ── Solo API ─────────────────────────────────────────────────────────────────
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

REM ── Solo Locale: sottomenu modello ───────────────────────────────────────────
:AI_LOCAL_MENU
echo.
echo   Seleziona il modello locale:
echo.
echo   ── LEGGERI (4-8 GB RAM) ─────────────────────────────
echo   [1]  Qwen 2.5 7B        - qwen2.5:7b        ~5GB
echo   [2]  Llama 3.2 3B       - llama3.2:3b        ~2GB
echo   [3]  Llama 3.1 8B       - llama3.1:8b        ~5GB
echo   [4]  Mistral 7B         - mistral:7b         ~4GB
echo   [5]  Gemma 3 4B         - gemma3:4b          ~3GB
echo   [6]  Phi-4 Mini         - phi4-mini          ~3GB
echo.
echo   ── MEDI (8-16 GB RAM) ───────────────────────────────
echo   [7]  Qwen 2.5 14B       - qwen2.5:14b        ~9GB  (consigliato)
echo   [8]  Mistral Nemo 12B   - mistral-nemo        ~8GB
echo   [9]  Phi-4 14B          - phi4               ~9GB
echo   [10] Llama 3.3 70B Q4   - llama3.3:70b-q4   ~12GB
echo   [11] DeepSeek-R1 14B    - deepseek-r1:14b   ~10GB
echo   [12] Qwen 2.5 Coder 14B - qwen2.5-coder:14b ~9GB
echo.
echo   ── PESANTI (20+ GB RAM) ─────────────────────────────
echo   [13] Gemma 4 26B MoE    - gemma4:26b        ~20GB
echo   [14] Qwen 2.5 32B       - qwen2.5:32b       ~22GB
echo   [15] DeepSeek-R1 32B    - deepseek-r1:32b   ~22GB
echo   [16] Llama 3.1 70B      - llama3.1:70b      ~48GB
echo   [17] Mixtral 8x7B       - mixtral:8x7b      ~30GB
echo.
echo   [18] Nome custom (inserisci tag Ollama manualmente)
echo.
set LOCAL_CHOICE=
:ASK_LOCAL
set /p LOCAL_CHOICE="  Modello [1-18]: "
if "!LOCAL_CHOICE!"=="1"  ( set OLLAMA_MODEL=qwen2.5:7b         & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="2"  ( set OLLAMA_MODEL=llama3.2:3b        & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="3"  ( set OLLAMA_MODEL=llama3.1:8b        & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="4"  ( set OLLAMA_MODEL=mistral:7b         & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="5"  ( set OLLAMA_MODEL=gemma3:4b          & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="6"  ( set OLLAMA_MODEL=phi4-mini          & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="7"  ( set OLLAMA_MODEL=qwen2.5:14b        & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="8"  ( set OLLAMA_MODEL=mistral-nemo       & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="9"  ( set OLLAMA_MODEL=phi4               & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="10" ( set OLLAMA_MODEL=llama3.3:70b-q4   & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="11" ( set OLLAMA_MODEL=deepseek-r1:14b   & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="12" ( set OLLAMA_MODEL=qwen2.5-coder:14b & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="13" ( set OLLAMA_MODEL=gemma4:26b         & set FORCE_UPDATE_OLLAMA=1 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="14" ( set OLLAMA_MODEL=qwen2.5:32b        & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="15" ( set OLLAMA_MODEL=deepseek-r1:32b   & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="16" ( set OLLAMA_MODEL=llama3.1:70b       & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="17" ( set OLLAMA_MODEL=mixtral:8x7b       & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="18" (
    set /p OLLAMA_MODEL="  Tag Ollama (es. qwen2.5:72b): "
    set FORCE_UPDATE_OLLAMA=0
    goto LOCAL_OK
)
goto ASK_LOCAL

:LOCAL_OK
set PROVIDER=ollama
set FINAL_A=
set CLAUDE_MODEL=
echo  OK - Selezionato: !OLLAMA_MODEL!
goto OLLAMA_SETUP

REM ────────────────────────────────────────────────────────────────────────────
REM [3] TRI-HYBRID ENGINE
REM  - Installa Python 3.11+ se necessario
REM  - Copia tri_hybrid_engine/ nella cartella app se non presente
REM  - Installa le dipendenze Python (anthropic, openai, aiohttp)
REM  - Chiede Anthropic API Key + OpenAI API Key
REM  - Chiede il modello LLaMA locale (Ollama)
REM  - Scrive le soglie di routing nel .env principale
REM ────────────────────────────────────────────────────────────────────────────
:AI_TRIHYBRID
set PROVIDER=trihybrid
set OLLAMA_MODEL=
set CLAUDE_MODEL=
set FINAL_A=
set FINAL_OAI=
set THY_LLAMA_MODEL=llama3.2
set THY_OPENAI_MODEL=gpt-4o-mini
set THY_CLAUDE_MODEL=claude-haiku-4-5-20251001
set THY_LLAMA_THRESHOLD=0.30
set THY_OPENAI_THRESHOLD=0.60
set THY_CONFIDENCE=0.55
set THY_MAX_ESC=2

echo.
echo  ── TRI-HYBRID ENGINE ────────────────────────────────────────────────────
echo   Routing automatico: LLaMA (locale) - GPT (media complessita') - Claude (massima)
echo   Il motore calcola un value_score per ogni prompt e sceglie il modello
echo   piu' economico in grado di rispondere con confidenza sufficiente.
echo.

REM ·· Python 3.11+ ·············································
echo  [*] Verifica Python 3.11+...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Python non trovato. Download in corso...
    winget --version >nul 2>&1
    if %errorlevel% equ 0 (
        winget install --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
        set "PATH=%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;%PATH%"
        python --version >nul 2>&1
    )
    if %errorlevel% neq 0 (
        echo  [!] Installa Python 3.11+ da https://python.org e riesegui.
        pause
        exit /b 1
    )
)
python -c "import sys; sys.exit(0 if sys.version_info>=(3,11) else 1)" >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Python 3.11+ richiesto. Installa da https://python.org e riesegui.
    pause
    exit /b 1
)
for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PY_VER=%%v
echo  OK - Python %PY_VER%

REM ·· Copia tri_hybrid_engine nella cartella app ···············
echo  [*] Verifica cartella Tri-Hybrid Engine...
if not exist "%THY_DIR%\main.py" (
    if exist "%INSTALL_DIR%\tri_hybrid_engine\main.py" (
        echo  Copia da %INSTALL_DIR%\tri_hybrid_engine ...
        xcopy "%INSTALL_DIR%\tri_hybrid_engine" "%THY_DIR%" /E /I /Q >nul 2>&1
        echo  OK - Engine copiato in %THY_DIR%
    ) else (
        echo.
        echo  ATTENZIONE: tri_hybrid_engine\ non trovato accanto all'installer.
        echo  Assicurati che la cartella tri_hybrid_engine\ sia nella stessa
        echo  directory di questo INSTALL.bat, poi premi un tasto per riprovare.
        pause
        if not exist "%THY_DIR%\main.py" (
            echo  ERRORE: Engine non trovato. Operazione annullata.
            pause
            exit /b 1
        )
    )
) else (
    echo  OK - Engine gia' presente in %THY_DIR%
)

REM ·· Dipendenze Python ·······································
echo  [*] Installazione dipendenze Python...

REM Ripristina pip se corrotto
python -m ensurepip --upgrade --user >nul 2>&1
python -m pip --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [*] pip non disponibile, tentativo ripristino...
    curl -L --progress-bar -o "%TMP_DIR%\get-pip.py" "https://bootstrap.pypa.io/get-pip.py"
    python "%TMP_DIR%\get-pip.py" --user --quiet
)

REM Aggiorna pip senza richiedere permessi admin
python -m pip install --upgrade pip --user --quiet 2>nul

REM Installa dipendenze engine
python -m pip install "anthropic>=0.40.0" "openai>=1.50.0" "aiohttp>=3.9.0" "fastapi>=0.115.0" "uvicorn>=0.30.0" --user --quiet
if %errorlevel% neq 0 (
    echo  ERRORE: pip install fallito. Controlla la connessione internet.
    pause
    exit /b 1
)
echo  OK - anthropic, openai, aiohttp installati

REM ·· Ollama + LLaMA locale ···································
echo.
echo  [*] Vuoi usare un modello LLaMA locale come tier economico?
echo      (Richiede Ollama. Senza LLaMA, il tier base sara' OpenAI GPT)
echo.
set INSTALL_OLLAMA_THY=
set /p INSTALL_OLLAMA_THY="  Installare Ollama + LLaMA? (S/N): "
if /i "!INSTALL_OLLAMA_THY!"=="S" (
    ollama --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo  Download Ollama...
        curl -L --progress-bar -o "%TMP_DIR%\OllamaSetup.exe" "https://ollama.com/download/OllamaSetup.exe"
        if %errorlevel% neq 0 ( echo  ERRORE: Download Ollama fallito. & pause & exit /b 1 )
        "%TMP_DIR%\OllamaSetup.exe" /S
        ping -n 10 127.0.0.1 >nul 2>&1
        set "PATH=%LOCALAPPDATA%\Programs\Ollama;%PATH%"
    )
    echo.
    echo  Modelli LLaMA disponibili:
    echo   [1] llama3.2   (2GB - consigliato)
    echo   [2] llama3.1   (4GB - piu' capace)
    echo   [3] mistral    (4GB - alternativa)
    echo   [4] phi4       (9GB - Microsoft, ottimo)
    echo   [5] Nome custom
    echo.
    set LLAMA_PICK=
    set /p LLAMA_PICK="  Scelta [1-5]: "
    if "!LLAMA_PICK!"=="1" set THY_LLAMA_MODEL=llama3.2
    if "!LLAMA_PICK!"=="2" set THY_LLAMA_MODEL=llama3.1
    if "!LLAMA_PICK!"=="3" set THY_LLAMA_MODEL=mistral
    if "!LLAMA_PICK!"=="4" set THY_LLAMA_MODEL=phi4
    if "!LLAMA_PICK!"=="5" set /p THY_LLAMA_MODEL="  Nome modello: "
    echo  Download !THY_LLAMA_MODEL! (potrebbe richiedere diversi minuti)...
    start /B ollama serve >nul 2>&1
    ping -n 5 127.0.0.1 >nul 2>&1
    ollama pull !THY_LLAMA_MODEL!
    if %errorlevel% neq 0 (
        echo  ATTENZIONE: pull fallito. LLaMA non disponibile, il tier base sara' OpenAI.
    ) else (
        echo  OK - !THY_LLAMA_MODEL! scaricato
        set OLLAMA_MODEL=!THY_LLAMA_MODEL!
    )
)

REM ·· API Keys ·················································
echo.
echo  Inserisci le API Key per i tier cloud del Tri-Hybrid Engine.
echo  Puoi lasciare vuoti i campi per i provider che non vuoi usare.
echo  (es: senza OpenAI Key, il tier medio viene saltato e si scala a Claude)
echo.

set CUR_A=
set CUR_OAI=
if exist "%ENV_FILE%" (
    for /f "usebackq tokens=1,* delims==" %%a in ("%ENV_FILE%") do (
        if "%%a"=="ANTHROPIC_API_KEY" set CUR_A=%%b
        if "%%a"=="OPENAI_API_KEY"    set CUR_OAI=%%b
    )
)

if not "!CUR_A!"==""   echo  Anthropic attuale : !CUR_A:~0,20!...
set /p NEW_A="  Anthropic API Key (sk-ant-...) [INVIO per mantenere]: "
if "!NEW_A!"=="" (set FINAL_A=!CUR_A!) else (set FINAL_A=!NEW_A!)

if not "!CUR_OAI!"=="" echo  OpenAI attuale    : !CUR_OAI:~0,20!...
set /p NEW_OAI="  OpenAI API Key   (sk-...)     [INVIO per mantenere]: "
if "!NEW_OAI!"=="" (set FINAL_OAI=!CUR_OAI!) else (set FINAL_OAI=!NEW_OAI!)

REM ·· Soglie di routing (avanzate) ····························
echo.
echo  Soglie di routing (INVIO per usare i default):
echo   value_score ^< LLAMA_THRESHOLD  → LLaMA locale
echo   value_score ^< OPENAI_THRESHOLD → OpenAI GPT
echo   value_score ^≥ OPENAI_THRESHOLD → Claude
echo.
set /p THY_LLAMA_THRESHOLD_IN="  LLAMA_THRESHOLD  [default 0.30]: "
set /p THY_OPENAI_THRESHOLD_IN="  OPENAI_THRESHOLD [default 0.60]: "
set /p THY_CONFIDENCE_IN="  CONFIDENCE_THRESHOLD [default 0.55]: "
if not "!THY_LLAMA_THRESHOLD_IN!"==""  set THY_LLAMA_THRESHOLD=!THY_LLAMA_THRESHOLD_IN!
if not "!THY_OPENAI_THRESHOLD_IN!"=="" set THY_OPENAI_THRESHOLD=!THY_OPENAI_THRESHOLD_IN!
if not "!THY_CONFIDENCE_IN!"==""       set THY_CONFIDENCE=!THY_CONFIDENCE_IN!

REM ·· Directory logs engine ···································
mkdir "%THY_DIR%\logs" >nul 2>&1
echo  OK - Tri-Hybrid Engine configurato

goto STEP6

REM ── Ollama setup condiviso (Solo Locale: Qwen / Gemma) ───────────────────────
:OLLAMA_SETUP
echo.
echo  Verifica Ollama...
ollama --version >nul 2>&1
if %errorlevel% neq 0 goto INSTALL_OLLAMA

if "!FORCE_UPDATE_OLLAMA!"=="1" (
    ollama --version > "%TMP_DIR%\olv.txt" 2>&1
    node -e "var s=require('fs').readFileSync(process.env.TEMP+'\\hypervibe_install\\olv.txt','utf8');var m=s.match(/(\d+)\.(\d+)/);process.exit(!m||parseInt(m[2])<20?1:0);" >nul 2>&1
    if !errorlevel! equ 0 ( echo  OK - Ollama gia' aggiornato & goto OLLAMA_READY )
    echo  Aggiornamento Ollama per gemma4...
    goto INSTALL_OLLAMA
)
goto OLLAMA_READY

:INSTALL_OLLAMA
echo  Download Ollama...
curl -L --progress-bar -o "%TMP_DIR%\OllamaSetup.exe" "https://ollama.com/download/OllamaSetup.exe"
if %errorlevel% neq 0 ( echo  ERRORE: Download Ollama fallito. & pause & exit /b 1 )
echo  Installazione Ollama...
"%TMP_DIR%\OllamaSetup.exe" /S
ping -n 10 127.0.0.1 >nul 2>&1
set "PATH=%LOCALAPPDATA%\Programs\Ollama;%PATH%"
ollama --version >nul 2>&1
if %errorlevel% neq 0 ( echo  ERRORE: Ollama non installato. & pause & exit /b 1 )

:OLLAMA_READY
for /f "tokens=*" %%v in ('ollama --version 2^>nul') do set OLLAMA_VER=%%v
echo  OK - Ollama (!OLLAMA_VER!)
curl -s http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% neq 0 ( start /B ollama serve >nul 2>&1 & ping -n 6 127.0.0.1 >nul 2>&1 )
ollama list 2>nul | findstr /i "!OLLAMA_MODEL:~0,10!" >nul 2>&1
if %errorlevel% equ 0 ( echo  OK - !OLLAMA_MODEL! gia' presente & goto STEP6 )
echo  Download !OLLAMA_MODEL!...
ollama pull !OLLAMA_MODEL!
if %errorlevel% neq 0 ( echo  ERRORE: Download modello fallito. & pause & exit /b 1 )
echo  OK - !OLLAMA_MODEL! scaricato

REM ── Step 6: Credenziali ──────────────────────────────────────────────────────
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

REM Scrivi PROVIDER compatibile con Node.js (accetta solo anthropic/ollama)
if /i "!PROVIDER!"=="trihybrid" (
    if not "!FINAL_A!"=="" (
        >>"%ENV_FILE%" echo PROVIDER=anthropic
    ) else (
        >>"%ENV_FILE%" echo PROVIDER=ollama
    )
    >>"%ENV_FILE%" echo THY_PROVIDER=trihybrid
    >>"%ENV_FILE%" echo ANTHROPIC_BASE_URL=http://127.0.0.1:3002
) else (
    >>"%ENV_FILE%" echo PROVIDER=!PROVIDER!
)
if not "!OLLAMA_MODEL!"==""         >>"%ENV_FILE%" echo OLLAMA_MODEL=!OLLAMA_MODEL!
if not "!OLLAMA_MODEL!"==""         >>"%ENV_FILE%" echo OLLAMA_BASE_URL=http://localhost:11434
if not "!FINAL_A!"==""              >>"%ENV_FILE%" echo ANTHROPIC_API_KEY=!FINAL_A!
if not "!CLAUDE_MODEL!"==""         >>"%ENV_FILE%" echo CLAUDE_MODEL=!CLAUDE_MODEL!
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

REM ── Variabili aggiuntive per il Tri-Hybrid Engine ────────────────────────────
if "!PROVIDER!"=="trihybrid" (
    if not "!FINAL_OAI!"==""        >>"%ENV_FILE%" echo OPENAI_API_KEY=!FINAL_OAI!
    >>"%ENV_FILE%" echo OPENAI_MODEL=!THY_OPENAI_MODEL!
    if not "!OLLAMA_MODEL!"==""     >>"%ENV_FILE%" echo LLAMA_MODEL=!OLLAMA_MODEL!
    >>"%ENV_FILE%" echo CLAUDE_MODEL=!THY_CLAUDE_MODEL!
    >>"%ENV_FILE%" echo LLAMA_THRESHOLD=!THY_LLAMA_THRESHOLD!
    >>"%ENV_FILE%" echo OPENAI_THRESHOLD=!THY_OPENAI_THRESHOLD!
    >>"%ENV_FILE%" echo CONFIDENCE_THRESHOLD=!THY_CONFIDENCE!
    >>"%ENV_FILE%" echo MAX_ESCALATIONS=!THY_MAX_ESC!
    >>"%ENV_FILE%" echo MAX_INPUT_TOKENS=3000
    >>"%ENV_FILE%" echo MAX_OUTPUT_TOKENS=1024
    >>"%ENV_FILE%" echo CONCURRENT_REQUESTS=10
    >>"%ENV_FILE%" echo THY_ENGINE_DIR=!THY_DIR!
    >>"%ENV_FILE%" echo LOG_DIR=!THY_DIR!\logs
    echo  OK - Variabili Tri-Hybrid scritte nel .env
)

echo  OK - .env salvato
rmdir /s /q "%TMP_DIR%" >nul 2>&1

echo.
echo  ==========================================
echo   INSTALLAZIONE COMPLETATA
if "!PROVIDER!"=="trihybrid" (
    echo   Motore AI : TRI-HYBRID ENGINE
    if not "!OLLAMA_MODEL!"=="" echo   Tier 1    : LLaMA - !OLLAMA_MODEL! (locale)
    if "!FINAL_OAI!"=="" (
        echo   Tier 2    : OpenAI GPT  (KEY NON INSERITA - saltato)
    ) else (
        echo   Tier 2    : OpenAI GPT  !THY_OPENAI_MODEL!
    )
    if "!FINAL_A!"=="" (
        echo   Tier 3    : Claude      (KEY NON INSERITA - saltato)
    ) else (
        echo   Tier 3    : Claude      !THY_CLAUDE_MODEL!
    )
    echo   Soglie    : LLaMA^<!THY_LLAMA_THRESHOLD! / OpenAI^<!THY_OPENAI_THRESHOLD! / Claude else
    echo   Engine    : !THY_DIR!
) else if "!PROVIDER!"=="ollama" (
    echo   Motore AI : LOCALE - !OLLAMA_MODEL!
) else (
    echo   Motore AI : API - !CLAUDE_MODEL!
)
echo   Network   : !FINAL_NET!
if "!INSTALL_AUTOTRADE_OK!"=="1" echo   Autotrade : INSTALLATO
echo  ==========================================
echo.

set /p LAUNCH="  Avviare HyperVibe ora? (S/N): "
if /i "!LAUNCH!" neq "S" goto END_NOLAN

REM ── Sequenza di avvio per ogni provider ──────────────────────────────────────
if /i "!PROVIDER!"=="trihybrid" goto LAUNCH_TRIHYBRID
if /i "!PROVIDER!"=="ollama" (
    start /B ollama serve >nul 2>&1
    ping -n 3 127.0.0.1 >nul 2>&1
)
cd /d "%APP_DIR%"
call npm start
goto END_NOLAN

:LAUNCH_TRIHYBRID
echo.
echo  Avvio Tri-Hybrid Engine in background...
if not "!OLLAMA_MODEL!"=="" (
    echo  [*] Avvio Ollama...
    start /B ollama serve >nul 2>&1
    ping -n 4 127.0.0.1 >nul 2>&1
)
echo  [*] Avvio Tri-Hybrid Bridge (porta 3002)...
start "HyperVibe - Tri-Hybrid Bridge" /min cmd /k "cd /d "!THY_DIR!" && python bridge.py"
echo  [*] Avvio engine Python (REPL opzionale)...
ping -n 3 127.0.0.1 >nul 2>&1
echo  [*] Avvio HyperVibe Node.js...
cd /d "%APP_DIR%"
call npm start

:END_NOLAN
echo.
pause

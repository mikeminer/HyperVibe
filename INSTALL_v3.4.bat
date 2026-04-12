@echo off
setlocal EnableDelayedExpansion
title HyperVibe Installer v3.13
chcp 437 >nul

set INSTALL_DIR=%~dp0
set INSTALL_DIR=%INSTALL_DIR:~0,-1%
set TMP_DIR=%TEMP%\hypervibe_install

echo.
echo  ==========================================
echo   HYPERVIBE - Installer v3.13
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
set VIBE_TOOLS_DIR=%APP_DIR%\tools\vibe-trading
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
    echo  OK - Aggiornato
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
if /i "!INSTALL_AUTOTRADE!" neq "S" goto STEP4C
echo.

mkdir "%TOOLS_DIR%" >nul 2>&1
echo  Cartella tools creata: %TOOLS_DIR%

echo  Inizializzazione submodule autotrade...
cd /d "%HV_DIR%"
git submodule update --init --recursive
if %errorlevel% neq 0 ( echo  ERRORE: submodule update fallito. Continuo senza modulo. & goto STEP4C )
echo  OK - autotrade submodule inizializzato

if not exist "%TOOLS_DIR%\package.json" (
    (
        echo {
        echo   "name": "hypervibe-autotrade-tools",
        echo   "version": "1.0.0",
        echo   "type": "module",
        echo   "description": "Autotrade bridge and signal loader for HyperVibe"
        echo }
    ) > "%TOOLS_DIR%\package.json"
)

cd /d "%TOOLS_DIR%"
call npm install @nktkas/hyperliquid@latest ethers@latest --silent
if %errorlevel% neq 0 ( echo  ERRORE: npm install tools fallito. Continuo senza modulo. & goto STEP4C )
echo  OK - @nktkas/hyperliquid ed ethers installati

call claude --version >nul 2>&1
if %errorlevel% equ 0 goto CLAUDE_OK
call npm.cmd install -g @anthropic-ai/claude-code --silent
if %errorlevel% neq 0 ( echo  ATTENZIONE: Claude Code CLI non installato. & pause & exit /b 1 )
call claude --version >nul 2>&1
if %errorlevel% neq 0 ( echo  ERRORE: Riapri il terminale e riesegui. & pause & exit /b 1 )

:CLAUDE_OK
echo  OK - Claude Code CLI trovato

set MISSING_SCRIPTS=0
if not exist "%TOOLS_DIR%\autotrade-bridge.js" set MISSING_SCRIPTS=1
if not exist "%TOOLS_DIR%\signal-loader.js"    set MISSING_SCRIPTS=1
if "!MISSING_SCRIPTS!"=="1" ( echo. & echo  ATTENZIONE: autotrade-bridge.js e/o signal-loader.js non trovati. & echo. )

mkdir "%APP_DIR%\playbooks\signals" >nul 2>&1
echo  OK - Cartella playbooks\signals creata
echo.
set INSTALL_AUTOTRADE_OK=1

REM ── Step 4c: Vibe-Trading Integration ────────────────────────────────────────
:STEP4C
echo.
echo [4c/7] Vibe-Trading Research Engine (opzionale)...
echo   Installa il motore di ricerca multi-agente Vibe-Trading.
echo   Swarm disponibili: crypto_trading_desk, risk_committee.
echo   Richiede Python 3.11+ e ~500MB.
echo.
set INSTALL_VIBE=
set /p INSTALL_VIBE="  Installare il modulo Vibe-Trading? (S/N): "
if /i "!INSTALL_VIBE!" neq "S" goto STEP5
echo.

REM ·· Verifica Python ─────────────────────────────────────────────────────────
echo  [*] Verifica Python 3.11+...
set "VIBE_PYEXE="
python --version >nul 2>&1
if %errorlevel% equ 0 (
    python -c "import sys; sys.exit(0 if sys.version_info>=(3,11) else 1)" >nul 2>&1
    if !errorlevel! equ 0 ( set "VIBE_PYEXE=python" & goto VIBE_PY_OK )
)
py -3.11 --version >nul 2>&1
if %errorlevel% equ 0 ( set "VIBE_PYEXE=py -3.11" & goto VIBE_PY_OK )
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    set "VIBE_PYEXE=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    goto VIBE_PY_OK
)

echo  Python 3.11+ non trovato. Installazione...
winget install --id Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements
set "PATH=%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python311\Scripts;%PATH%"
ping -n 4 127.0.0.1 >nul 2>&1
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    set "VIBE_PYEXE=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    goto VIBE_PY_OK
)
echo  ERRORE: Python non installato. Vibe-Trading saltato.
goto STEP5

:VIBE_PY_OK
for /f "tokens=2" %%v in ('!VIBE_PYEXE! --version 2^>^&1') do set VIBE_PY_VER=%%v
echo  OK - Python !VIBE_PY_VER!

REM ·· Inizializza submodule vibe-trading ──────────────────────────────────────
echo  [*] Inizializzazione submodule vibe-trading...
cd /d "%HV_DIR%"
git submodule update --init vibe-trading
if %errorlevel% neq 0 (
    echo  Submodule non trovato, clono direttamente...
    git clone https://github.com/HKUDS/Vibe-Trading.git "%HV_DIR%\vibe-trading"
    if %errorlevel% neq 0 ( echo  ERRORE: Clone Vibe-Trading fallito. Salto. & goto STEP5 )
)
echo  OK - Vibe-Trading presente in: %HV_DIR%\vibe-trading

set VIBE_AGENT_DIR=%HV_DIR%\vibe-trading\agent
if not exist "!VIBE_AGENT_DIR!\api_server.py" (
    echo  ERRORE: api_server.py non trovato in !VIBE_AGENT_DIR!
    goto STEP5
)

REM ·· Installa dipendenze Python ──────────────────────────────────────────────
echo  [*] Installazione dipendenze Python Vibe-Trading...
!VIBE_PYEXE! -m pip install vibe-trading-ai fastapi uvicorn --user --quiet --no-warn-script-location
if %errorlevel% neq 0 (
    echo  Provo con requirements.txt...
    !VIBE_PYEXE! -m pip install -r "!VIBE_AGENT_DIR!\requirements.txt" --user --quiet --no-warn-script-location
    if !errorlevel! neq 0 ( echo  ERRORE: pip install fallito. Continuo senza Vibe-Trading. & goto STEP5 )
)
echo  OK - Dipendenze Python installate

REM ·· Crea cartella tools\vibe-trading e verifica vibe-bridge.js ──────────────
mkdir "%VIBE_TOOLS_DIR%" >nul 2>&1
if not exist "%VIBE_TOOLS_DIR%\vibe-bridge.js" (
    echo  ATTENZIONE: vibe-bridge.js non trovato in %VIBE_TOOLS_DIR%
    echo  Scaricalo dalla sessione di installazione e copialo in:
    echo    %VIBE_TOOLS_DIR%\vibe-bridge.js
) else (
    echo  OK - vibe-bridge.js presente
)

REM ·· Configura provider LLM per Vibe-Trading ─────────────────────────────────
echo.
echo  Provider LLM per Vibe-Trading (indipendente da HyperVibe):
echo.
echo   [1] Ollama locale    - gratis, usa stesso Ollama di HyperVibe
echo   [2] DeepSeek API     - economico ($0.001/1K token), qualita' alta
echo   [3] OpenRouter       - gateway multi-modello
echo   [4] Anthropic        - usa stessa key di HyperVibe
echo.
set VIBE_LLM=
set /p VIBE_LLM="  Scelta [1/2/3/4]: "

set VIBE_ENV_CONTENT=
if "!VIBE_LLM!"=="1" (
    set VIBE_PROVIDER=ollama
    if not "!OLLAMA_MODEL!"=="" (
        set VIBE_MODEL=!OLLAMA_MODEL!
    ) else (
        set VIBE_MODEL=qwen2.5:7b
    )
    set VIBE_ENV_CONTENT=LANGCHAIN_PROVIDER=ollama
    set VIBE_ENV_CONTENT=!VIBE_ENV_CONTENT!^
LANGCHAIN_MODEL_NAME=!VIBE_MODEL!
    set VIBE_ENV_CONTENT=!VIBE_ENV_CONTENT!^
OLLAMA_BASE_URL=http://localhost:11434/v1
)
if "!VIBE_LLM!"=="2" (
    set VIBE_PROVIDER=deepseek
    set /p VIBE_DS_KEY="  DeepSeek API Key (sk-...): "
    set VIBE_ENV_CONTENT=LANGCHAIN_PROVIDER=deepseek
    set VIBE_ENV_CONTENT=!VIBE_ENV_CONTENT!^
LANGCHAIN_MODEL_NAME=deepseek-chat
    set VIBE_ENV_CONTENT=!VIBE_ENV_CONTENT!^
DEEPSEEK_API_KEY=!VIBE_DS_KEY!
    set VIBE_ENV_CONTENT=!VIBE_ENV_CONTENT!^
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
)
if "!VIBE_LLM!"=="3" (
    set VIBE_PROVIDER=openrouter
    set /p VIBE_OR_KEY="  OpenRouter API Key (sk-or-...): "
    set /p VIBE_OR_MODEL="  Modello (es. deepseek/deepseek-v3.2): "
    if "!VIBE_OR_MODEL!"=="" set VIBE_OR_MODEL=deepseek/deepseek-v3.2
    set VIBE_ENV_CONTENT=LANGCHAIN_PROVIDER=openrouter
    set VIBE_ENV_CONTENT=!VIBE_ENV_CONTENT!^
LANGCHAIN_MODEL_NAME=!VIBE_OR_MODEL!
    set VIBE_ENV_CONTENT=!VIBE_ENV_CONTENT!^
OPENROUTER_API_KEY=!VIBE_OR_KEY!
    set VIBE_ENV_CONTENT=!VIBE_ENV_CONTENT!^
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
)
if "!VIBE_LLM!"=="4" (
    set VIBE_PROVIDER=anthropic-compat
    set VIBE_ENV_CONTENT=LANGCHAIN_PROVIDER=openai
    set VIBE_ENV_CONTENT=!VIBE_ENV_CONTENT!^
LANGCHAIN_MODEL_NAME=claude-haiku-4-5-20251001
    set VIBE_ENV_CONTENT=!VIBE_ENV_CONTENT!^
OPENAI_API_KEY=!FINAL_A!
    set VIBE_ENV_CONTENT=!VIBE_ENV_CONTENT!^
OPENAI_BASE_URL=https://api.anthropic.com/v1
)

REM ·· Scrivi .env di Vibe-Trading ─────────────────────────────────────────────
set VIBE_ENV_FILE=!VIBE_AGENT_DIR!\.env
(
    echo LANGCHAIN_TEMPERATURE=0.0
    echo TIMEOUT_SECONDS=180
    echo MAX_RETRIES=2
) >> "!VIBE_ENV_FILE!" 2>nul

REM Scrivi le righe provider riga per riga
if "!VIBE_LLM!"=="1" (
    (
        echo LANGCHAIN_PROVIDER=ollama
        echo LANGCHAIN_MODEL_NAME=!VIBE_MODEL!
        echo OLLAMA_BASE_URL=http://localhost:11434/v1
        echo LANGCHAIN_TEMPERATURE=0.0
        echo TIMEOUT_SECONDS=180
        echo MAX_RETRIES=2
    ) > "!VIBE_ENV_FILE!"
)
if "!VIBE_LLM!"=="2" (
    (
        echo LANGCHAIN_PROVIDER=deepseek
        echo LANGCHAIN_MODEL_NAME=deepseek-chat
        echo DEEPSEEK_API_KEY=!VIBE_DS_KEY!
        echo DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
        echo LANGCHAIN_TEMPERATURE=0.0
        echo TIMEOUT_SECONDS=180
        echo MAX_RETRIES=2
    ) > "!VIBE_ENV_FILE!"
)
if "!VIBE_LLM!"=="3" (
    (
        echo LANGCHAIN_PROVIDER=openrouter
        echo LANGCHAIN_MODEL_NAME=!VIBE_OR_MODEL!
        echo OPENROUTER_API_KEY=!VIBE_OR_KEY!
        echo OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
        echo LANGCHAIN_TEMPERATURE=0.0
        echo TIMEOUT_SECONDS=180
        echo MAX_RETRIES=2
    ) > "!VIBE_ENV_FILE!"
)
if "!VIBE_LLM!"=="4" (
    (
        echo LANGCHAIN_PROVIDER=openai
        echo LANGCHAIN_MODEL_NAME=claude-haiku-4-5-20251001
        echo OPENAI_API_KEY=!FINAL_A!
        echo OPENAI_BASE_URL=https://api.anthropic.com/v1
        echo LANGCHAIN_TEMPERATURE=0.0
        echo TIMEOUT_SECONDS=180
        echo MAX_RETRIES=2
    ) > "!VIBE_ENV_FILE!"
)

echo  OK - .env Vibe-Trading salvato in: !VIBE_ENV_FILE!
echo.
set INSTALL_VIBE_OK=1
set VIBE_DIR_FINAL=!VIBE_AGENT_DIR!
echo  OK - Vibe-Trading installato

REM ── Step 5: Scelta motore AI ─────────────────────────────────────────────────
:STEP5
echo [5/7] Motore AI...
echo.
echo   [1] Solo API          - Claude cloud (Anthropic), a pagamento
echo   [2] Solo Locale       - Ollama, GPU/CPU, 23+ modelli con tools
echo   [3] BitNet CPU-only   - Microsoft 1-bit, nessuna GPU, 82%% meno energia
echo   [4] Tri-Hybrid Engine - LLaMA+GPT+Claude con routing intelligente
echo.
set AI_CHOICE=
:ASK_AI
set /p AI_CHOICE="  Scelta [1/2/3/4]: "
if "!AI_CHOICE!"=="1" goto AI_ANTHROPIC
if "!AI_CHOICE!"=="2" goto AI_LOCAL_MENU
if "!AI_CHOICE!"=="3" goto AI_BITNET
if "!AI_CHOICE!"=="4" goto AI_TRIHYBRID
goto ASK_AI

REM ── Solo API ─────────────────────────────────────────────────────────────────
:AI_ANTHROPIC
set PROVIDER=anthropic
set OLLAMA_MODEL=
set CLAUDE_MODEL=claude-sonnet-4-20250514
set CUR_ANTHROPIC=
if exist "%ENV_FILE%" for /f "usebackq tokens=1,* delims==" %%a in ("%ENV_FILE%") do if "%%a"=="ANTHROPIC_API_KEY" set CUR_ANTHROPIC=%%b
echo.
if not "!CUR_ANTHROPIC!"=="" echo  Attuale: !CUR_ANTHROPIC:~0,20!...
set /p NEW_A="  Anthropic API Key (INVIO per mantenere): "
if "!NEW_A!"=="" (set FINAL_A=!CUR_ANTHROPIC!) else (set FINAL_A=!NEW_A!)
goto STEP6

REM ── Solo Locale: sottomenu modello (Ollama) ────────────────────────────────
:AI_LOCAL_MENU
echo.
echo   Tutti i modelli elencati supportano tools/function calling.
echo.
echo   -- LEGGERI (2-6 GB RAM) ------------------------------------------
echo   [1]  Llama 3.2 3B          - llama3.2:3b           ~2GB
echo   [2]  Gemma 3 4B            - gemma3:4b              ~3GB
echo   [3]  Phi-4 Mini            - phi4-mini              ~3GB
echo   [4]  Qwen3 4B              - qwen3:4b               ~3GB
echo   [5]  Mistral 7B            - mistral:7b             ~4GB
echo   [6]  Llama 3.1 8B          - llama3.1:8b            ~5GB
echo   [7]  Qwen 2.5 7B           - qwen2.5:7b             ~5GB
echo   [8]  Qwen3 8B              - qwen3:8b               ~5GB
echo   [9]  Gemma 3 9B            - gemma3:9b              ~6GB
echo.
echo   -- MEDI (8-16 GB RAM) --------------------------------------------
echo   [10] Qwen 2.5 14B          - qwen2.5:14b            ~9GB  (consigliato)
echo   [11] Qwen3 14B             - qwen3:14b              ~9GB
echo   [12] Phi-4 14B             - phi4:14b               ~9GB
echo   [13] Qwen 2.5 Coder 14B   - qwen2.5-coder:14b      ~9GB
echo   [14] Mistral Nemo 12B      - mistral-nemo            ~8GB
echo   [15] Granite 3.2 8B        - granite3.2:8b           ~5GB
echo   [16] Llama 3.3 70B Q4     - llama3.3:70b-q4_K_M   ~12GB
echo.
echo   -- PESANTI (20+ GB RAM) ------------------------------------------
echo   [17] Gemma 4 27B MoE       - gemma4:27b            ~20GB
echo   [18] Qwen3 32B             - qwen3:32b             ~22GB
echo   [19] Qwen 2.5 32B          - qwen2.5:32b           ~22GB
echo   [20] Mixtral 8x7B          - mixtral:8x7b          ~30GB
echo   [21] Llama 3.1 70B         - llama3.1:70b          ~48GB
echo   [22] Qwen3 72B             - qwen3:72b             ~48GB
echo.
echo   [23] Nome custom
echo.
echo   [24] Raccomandami tu (llmfit) - analisi automatica del tuo hardware
echo.
set LOCAL_CHOICE=
:ASK_LOCAL
set /p LOCAL_CHOICE="  Modello [1-23]: "
if "!LOCAL_CHOICE!"=="1"  ( set OLLAMA_MODEL=llama3.2:3b          & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="2"  ( set OLLAMA_MODEL=gemma3:4b             & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="3"  ( set OLLAMA_MODEL=phi4-mini             & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="4"  ( set OLLAMA_MODEL=qwen3:4b              & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="5"  ( set OLLAMA_MODEL=mistral:7b            & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="6"  ( set OLLAMA_MODEL=llama3.1:8b           & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="7"  ( set OLLAMA_MODEL=qwen2.5:7b            & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="8"  ( set OLLAMA_MODEL=qwen3:8b              & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="9"  ( set OLLAMA_MODEL=gemma3:9b             & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="10" ( set OLLAMA_MODEL=qwen2.5:14b           & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="11" ( set OLLAMA_MODEL=qwen3:14b             & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="12" ( set OLLAMA_MODEL=phi4:14b              & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="13" ( set OLLAMA_MODEL=qwen2.5-coder:14b     & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="14" ( set OLLAMA_MODEL=mistral-nemo          & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="15" ( set OLLAMA_MODEL=granite3.2:8b         & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="16" ( set OLLAMA_MODEL=llama3.3:70b-q4_K_M  & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="17" ( set OLLAMA_MODEL=gemma4:27b            & set FORCE_UPDATE_OLLAMA=1 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="18" ( set OLLAMA_MODEL=qwen3:32b             & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="19" ( set OLLAMA_MODEL=qwen2.5:32b           & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="20" ( set OLLAMA_MODEL=mixtral:8x7b          & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="21" ( set OLLAMA_MODEL=llama3.1:70b          & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="22" ( set OLLAMA_MODEL=qwen3:72b             & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="23" ( set /p OLLAMA_MODEL="  Tag Ollama: " & set FORCE_UPDATE_OLLAMA=0 & goto LOCAL_OK )
if "!LOCAL_CHOICE!"=="24" goto AI_LLMFIT_RECOMMEND
goto ASK_LOCAL


REM ── llmfit: raccomandazione automatica basata sull'hardware ─────────────────
:AI_LLMFIT_RECOMMEND
echo.
echo  ========================================================
echo   LLMFIT - Analisi automatica hardware in corso...
echo  ========================================================
echo.

set LLMFIT_ZIP=%TMP_DIR%\llmfit.zip
set LLMFIT_EXTRACT=%TMP_DIR%\llmfit_ext
set LLMFIT_PATH_FILE=%TMP_DIR%\llmfit_exe_path.txt
set LLMFIT_OUT=%TMP_DIR%\llmfit_rec.json

REM Verifica se llmfit e' gia' disponibile
llmfit --version >nul 2>&1
if %errorlevel% equ 0 goto LLMFIT_RUN

REM Prova installazione via Scoop
scoop --version >nul 2>&1
if %errorlevel% equ 0 (
    echo  [*] Installazione llmfit via Scoop...
    scoop install llmfit >nul 2>&1
    llmfit --version >nul 2>&1
    if %errorlevel% equ 0 goto LLMFIT_RUN
)

REM Fallback: download binario via PowerShell con GitHub API
echo  [*] Download llmfit da GitHub Releases...
if exist "%LLMFIT_EXTRACT%" rmdir /s /q "%LLMFIT_EXTRACT%" >nul 2>&1

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-RestMethod 'https://api.github.com/repos/AlexsJones/llmfit/releases/latest' -Headers @{'User-Agent'='HyperVibe'}; $a = $r.assets | Where-Object { $_.name -like '*x86_64-pc-windows-msvc.zip' } | Select-Object -First 1; if (-not $a) { throw 'asset non trovato' }; Write-Host ('  Download: ' + $a.name); Invoke-WebRequest $a.browser_download_url -OutFile '%LLMFIT_ZIP%' -UseBasicParsing; Expand-Archive '%LLMFIT_ZIP%' '%LLMFIT_EXTRACT%' -Force; $e = (Get-ChildItem '%LLMFIT_EXTRACT%' -Recurse -Filter llmfit.exe | Select-Object -First 1).FullName; Set-Content '%LLMFIT_PATH_FILE%' $e } catch { Set-Content '%LLMFIT_PATH_FILE%' ('ERROR:' + $_.Exception.Message) }"

if not exist "%LLMFIT_PATH_FILE%" (
    echo  ERRORE: download fallito. Continuo con selezione manuale.
    goto AI_LOCAL_MENU
)

set /p LLMFIT_EXE_PATH=<"%LLMFIT_PATH_FILE%"
if "!LLMFIT_EXE_PATH:~0,6!"=="ERROR:" (
    echo  ERRORE: !LLMFIT_EXE_PATH!
    echo  Continuo con selezione manuale.
    goto AI_LOCAL_MENU
)
if "!LLMFIT_EXE_PATH!"=="" (
    echo  ERRORE: llmfit.exe non trovato. Continuo con selezione manuale.
    goto AI_LOCAL_MENU
)

for %%D in ("!LLMFIT_EXE_PATH!") do set "LLMFIT_DIR=%%~dpD"
set "PATH=!LLMFIT_DIR!;!PATH!"
echo  OK - llmfit: !LLMFIT_EXE_PATH!

llmfit --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERRORE: llmfit non eseguibile. Continuo con selezione manuale.
    goto AI_LOCAL_MENU
)

:LLMFIT_RUN
echo  [*] Analisi hardware in corso... (pochi secondi)
echo.

llmfit recommend --use-case general --runtime llamacpp -n 5 > "%LLMFIT_OUT%" 2>nul
if %errorlevel% neq 0 (
    echo  ERRORE: llmfit recommend fallito. Continuo con selezione manuale.
    goto AI_LOCAL_MENU
)

REM Script PowerShell di parsing — scritto riga per riga con >> per evitare crash da parentesi
set LLMFIT_PS=%TMP_DIR%\llmfit_parse.ps1
if exist "%LLMFIT_PS%" del "%LLMFIT_PS%"

>>"%LLMFIT_PS%" echo $json = Get-Content '%LLMFIT_OUT%' -Raw ^| ConvertFrom-Json
>>"%LLMFIT_PS%" echo $models = $json.models
>>"%LLMFIT_PS%" echo if (-not $models -or $models.Count -eq 0) { Write-Output 'NOMODEL'; exit }
>>"%LLMFIT_PS%" echo function Map-ToOllama($name) {
>>"%LLMFIT_PS%" echo     $n = $name.ToLower()
>>"%LLMFIT_PS%" echo     # Salta modelli AWQ/GPTQ/MLX — non compatibili con Ollama
>>"%LLMFIT_PS%" echo     if ($n -match 'awq|gptq|mlx') { return $null }
>>"%LLMFIT_PS%" echo     # Qwen2.5 Coder
>>"%LLMFIT_PS%" echo     if ($n -match 'qwen2\.5-coder.*?(\d+)b') { return "qwen2.5-coder:$($Matches[1])b" }
>>"%LLMFIT_PS%" echo     # Qwen2.5
>>"%LLMFIT_PS%" echo     if ($n -match 'qwen2\.5.*?(\d+\.?\d*)b') { $s=$Matches[1]; return "qwen2.5:${s}b" }
>>"%LLMFIT_PS%" echo     # Qwen3 MoE (es. Qwen3-30B-A3B, Qwen3-235B-A22B)
>>"%LLMFIT_PS%" echo     if ($n -match 'qwen3.*?(\d+)b-a(\d+)b') { return "qwen3:$($Matches[1])b-a$($Matches[2])b" }
>>"%LLMFIT_PS%" echo     if ($n -match 'qwen3\.5.*?(\d+)b-a(\d+)b') { return "qwen3:$($Matches[1])b-a$($Matches[2])b" }
>>"%LLMFIT_PS%" echo     # Qwen3 standard
>>"%LLMFIT_PS%" echo     if ($n -match 'qwen3.*?(\d+)b') { return "qwen3:$($Matches[1])b" }
>>"%LLMFIT_PS%" echo     # Llama
>>"%LLMFIT_PS%" echo     if ($n -match 'llama.?3\.3.*?(\d+)b') { return "llama3.3:$($Matches[1])b" }
>>"%LLMFIT_PS%" echo     if ($n -match 'llama.?3\.2.*?(\d+)b') { return "llama3.2:$($Matches[1])b" }
>>"%LLMFIT_PS%" echo     if ($n -match 'llama.?3\.1.*?(\d+)b') { return "llama3.1:$($Matches[1])b" }
>>"%LLMFIT_PS%" echo     # Gemma
>>"%LLMFIT_PS%" echo     if ($n -match 'gemma.?4.*?(\d+)b') { return "gemma4:$($Matches[1])b" }
>>"%LLMFIT_PS%" echo     if ($n -match 'gemma.?3.*?(\d+)b') { return "gemma3:$($Matches[1])b" }
>>"%LLMFIT_PS%" echo     # Phi-4
>>"%LLMFIT_PS%" echo     if ($n -match 'phi.?4.?mini') { return 'phi4-mini' }
>>"%LLMFIT_PS%" echo     if ($n -match 'phi.?4.*?(\d+)b') { return "phi4:$($Matches[1])b" }
>>"%LLMFIT_PS%" echo     # Mistral
>>"%LLMFIT_PS%" echo     if ($n -match 'mistral.?nemo') { return 'mistral-nemo' }
>>"%LLMFIT_PS%" echo     if ($n -match 'mistral.*?7b') { return 'mistral:7b' }
>>"%LLMFIT_PS%" echo     # Granite
>>"%LLMFIT_PS%" echo     if ($n -match 'granite.*?8b') { return 'granite3.2:8b' }
>>"%LLMFIT_PS%" echo     return $null
>>"%LLMFIT_PS%" echo }
>>"%LLMFIT_PS%" echo $bestTag = $null; $best = $null
>>"%LLMFIT_PS%" echo foreach ($m in $models) {
>>"%LLMFIT_PS%" echo     $tag = Map-ToOllama $m.name
>>"%LLMFIT_PS%" echo     if ($tag -and -not $bestTag) { $best = $m; $bestTag = $tag }
>>"%LLMFIT_PS%" echo }
>>"%LLMFIT_PS%" echo if (-not $bestTag) { $best = $models[0]; $bestTag = 'NOMATCH' }
>>"%LLMFIT_PS%" echo $score = [math]::Round($best.score, 1)
>>"%LLMFIT_PS%" echo $tps   = [math]::Round($best.estimated_tps, 1)
>>"%LLMFIT_PS%" echo $ram   = [math]::Round($best.memory_required_gb, 1)
>>"%LLMFIT_PS%" echo Write-Output "$bestTag|$($best.name)|$score|$tps|$ram|$($best.fit_level)|$($best.best_quant)"

set LLMFIT_RESULT=
for /f "delims=" %%R in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%LLMFIT_PS%" 2^>nul') do set LLMFIT_RESULT=%%R

if "!LLMFIT_RESULT!"=="NOMODEL" (
    echo  Nessun modello compatibile trovato. Continuo con selezione manuale.
    goto AI_LOCAL_MENU
)
if "!LLMFIT_RESULT!"=="" (
    echo  ERRORE: parsing llmfit fallito. Continuo con selezione manuale.
    goto AI_LOCAL_MENU
)

REM Estrai i campi (pipe-delimitati)
for /f "tokens=1,2,3,4,5,6,7 delims=|" %%A in ("!LLMFIT_RESULT!") do (
    set LLMFIT_TAG=%%A
    set LLMFIT_NAME=%%B
    set LLMFIT_SCORE=%%C
    set LLMFIT_TPS=%%D
    set LLMFIT_RAM=%%E
    set LLMFIT_FIT=%%F
    set LLMFIT_QUANT=%%G
)

echo  ========================================================
echo   RACCOMANDAZIONE LLMFIT
echo  ========================================================
echo.
echo   Modello      : !LLMFIT_NAME!
if not "!LLMFIT_TAG!"=="NOMATCH" echo   Ollama tag   : !LLMFIT_TAG!
echo   Score        : !LLMFIT_SCORE!/100
echo   Stima tok/s  : ~!LLMFIT_TPS! t/s
echo   RAM richiesta: !LLMFIT_RAM! GB
echo   Fit          : !LLMFIT_FIT!
echo   Quantiz.     : !LLMFIT_QUANT!
echo.

if "!LLMFIT_TAG!"=="NOMATCH" (
    echo  ATTENZIONE: "!LLMFIT_NAME!" non ha un tag Ollama mappato.
    set /p CUSTOM_TAG="  Tag Ollama manuale (o INVIO per menu): "
    if "!CUSTOM_TAG!"=="" goto AI_LOCAL_MENU
    set OLLAMA_MODEL=!CUSTOM_TAG!
    set FORCE_UPDATE_OLLAMA=0
    goto LOCAL_OK
)

set /p LLMFIT_CONFIRM="  Usare !LLMFIT_TAG! come consigliato? (S/N): "
if /i "!LLMFIT_CONFIRM!"=="N" goto AI_LOCAL_MENU

set OLLAMA_MODEL=!LLMFIT_TAG!
set FORCE_UPDATE_OLLAMA=0
echo  OK - Selezionato: !OLLAMA_MODEL! (score !LLMFIT_SCORE!)

:LOCAL_OK
set PROVIDER=ollama
set FINAL_A=
set CLAUDE_MODEL=
echo  OK - Selezionato: !OLLAMA_MODEL!
goto OLLAMA_SETUP

REM ── BitNet CPU Engine ────────────────────────────────────────────────────────
:AI_BITNET
set PROVIDER=bitnet
set OLLAMA_MODEL=
set CLAUDE_MODEL=
set FINAL_A=
set BITNET_PORT=8080
set BITNET_MODEL=BitNet-b1.58-2B-4T
set BITNET_DIR=%HV_DIR%\bitnet

echo.
echo  -- BITNET CPU ENGINE ------------------------------------------------
echo   Inferenza 1-bit nativa Microsoft, nessuna GPU richiesta.
echo   Modello: BitNet b1.58 2B4T, circa 1.2GB, solo CPU.
echo.
echo   ATTENZIONE: tool/function calling NON supportato.
echo   HyperVibe funzionera' in modalita' CHAT/ANALISI.
echo.
echo   PREREQUISITI (installati automaticamente se mancanti):
echo     - Visual Studio con workload "C++ desktop" + componente Clang/LLVM
echo     - Python 3.11 (NON 3.12: torch 2.2.1 non supporta 3.12)
echo       https://www.python.org/downloads/release/python-3119/
echo.
set BITNET_OK=
set /p BITNET_OK="  Continuare con BitNet? (S/N): "
if /i "!BITNET_OK!" neq "S" goto STEP5

REM ·· Cerca VsDevCmd.bat via vswhere ──────────────────────────────────────────
echo.
echo  [*] Ricerca Visual Studio con workload C++...
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
set "VSDEVCMD="
set "VS_INSTALL_PATH="

if exist "%VSWHERE%" (
    for /f "usebackq delims=" %%P in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -find Common7\Tools\VsDevCmd.bat`) do set "VSDEVCMD=%%P"
    for /f "usebackq delims=" %%P in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VS_INSTALL_PATH=%%P"
)

if not defined VSDEVCMD (
    echo  Visual Studio con workload C++ non trovato. Provo installazione...
    winget install --id Microsoft.VisualStudio.2022.Community --silent --accept-package-agreements --accept-source-agreements --override "--wait --quiet --add Microsoft.VisualStudio.Workload.NativeDesktop --add Microsoft.VisualStudio.ComponentGroup.NativeDesktop.Llvm.Clang --includeRecommended"
)

if not defined VSDEVCMD if exist "%VSWHERE%" (
    for /f "usebackq delims=" %%P in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -find Common7\Tools\VsDevCmd.bat`) do set "VSDEVCMD=%%P"
    for /f "usebackq delims=" %%P in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VS_INSTALL_PATH=%%P"
)

if not defined VSDEVCMD (
    echo  ERRORE: VsDevCmd.bat non trovato. Installa VS con workload C++ e riesegui.
    pause
    goto STEP5
)
echo  OK - Trovato: !VSDEVCMD!

REM ·· CMake ───────────────────────────────────────────────────────────────────
echo  [*] Verifica CMake...
cmake --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  Installazione CMake via winget...
    winget install --id Kitware.CMake --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
    set "PATH=C:\Program Files\CMake\bin;%PATH%"
    cmake --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo  ERRORE: CMake non trovato. Installa da https://cmake.org e riesegui.
        pause
        goto STEP5
    )
)
echo  OK - CMake trovato

REM ·· clang-cl integrato in VS ────────────────────────────────────────────────
echo  [*] Verifica clang-cl integrato in Visual Studio...
set "CLANGCL_EXE="
if exist "%VSWHERE%" (
    for /f "usebackq delims=" %%P in (`"%VSWHERE%" -latest -products * -find "VC\Tools\Llvm\x64\bin\clang-cl.exe" 2^>nul`) do set "CLANGCL_EXE=%%P"
)
if not defined CLANGCL_EXE (
    if exist "!VS_INSTALL_PATH!\VC\Tools\Llvm\x64\bin\clang-cl.exe" (
        set "CLANGCL_EXE=!VS_INSTALL_PATH!\VC\Tools\Llvm\x64\bin\clang-cl.exe"
    )
)

if not defined CLANGCL_EXE (
    echo  clang-cl non trovato in VS. Installazione componente LLVM per VS...
    echo  Questa operazione puo' richiedere 5-10 minuti. Attendi.
    set "VS_INSTALLER=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vs_installer.exe"
    if not exist "!VS_INSTALLER!" (
        echo  ERRORE: vs_installer.exe non trovato.
        echo  Apri VS Installer manualmente:
        echo    Modifica - Componenti singoli - cerca Clang
        echo    - spunta C++ Clang tools for Windows - Modifica
        pause
        goto STEP5
    )
    "!VS_INSTALLER!" modify --installPath "!VS_INSTALL_PATH!" --add Microsoft.VisualStudio.ComponentGroup.NativeDesktop.Llvm.Clang --quiet --norestart
    ping -n 8 127.0.0.1 >nul 2>&1
    if exist "%VSWHERE%" (
        for /f "usebackq delims=" %%P in (`"%VSWHERE%" -latest -products * -find "VC\Tools\Llvm\x64\bin\clang-cl.exe" 2^>nul`) do set "CLANGCL_EXE=%%P"
    )
    if not defined CLANGCL_EXE (
        if exist "!VS_INSTALL_PATH!\VC\Tools\Llvm\x64\bin\clang-cl.exe" (
            set "CLANGCL_EXE=!VS_INSTALL_PATH!\VC\Tools\Llvm\x64\bin\clang-cl.exe"
        )
    )
    if not defined CLANGCL_EXE (
        echo.
        echo  ERRORE: clang-cl.exe non trovato dopo installazione.
        echo  Apri VS Installer manualmente, Modifica - Componenti singoli - cerca Clang.
        pause
        goto STEP5
    )
)
echo  OK - clang-cl trovato: !CLANGCL_EXE!

REM ·· LLVM standalone ─────────────────────────────────────────────────────────
echo  [*] Verifica LLVM/clang nel PATH...
set "LLVM_BIN="
clang --version >nul 2>&1
if %errorlevel% equ 0 ( set "LLVM_BIN=inpath" & goto LLVM_DONE )
if exist "C:\Program Files\LLVM\bin\clang.exe"        set "LLVM_BIN=C:\Program Files\LLVM\bin"
if exist "C:\Program Files (x86)\LLVM\bin\clang.exe"  set "LLVM_BIN=C:\Program Files (x86)\LLVM\bin"
if exist "%LOCALAPPDATA%\Programs\LLVM\bin\clang.exe" set "LLVM_BIN=%LOCALAPPDATA%\Programs\LLVM\bin"
if defined LLVM_BIN ( set "PATH=!LLVM_BIN!;!PATH!" & echo  OK - LLVM: !LLVM_BIN! & goto LLVM_DONE )
echo  LLVM standalone non trovato (non bloccante)
:LLVM_DONE

REM ·· Python 3.11 per BitNet ──────────────────────────────────────────────────
echo  [*] Verifica Python 3.11 per BitNet...
set "PYEXE="
py -3.11 --version >nul 2>&1
if %errorlevel% equ 0 ( set "PYEXE=py -3.11" & goto PYTHON_BITNET_OK )
python3.11 --version >nul 2>&1
if %errorlevel% equ 0 ( set "PYEXE=python3.11" & goto PYTHON_BITNET_OK )
if exist "C:\Python311\python.exe" ( set "PYEXE=C:\Python311\python.exe" & goto PYTHON_BITNET_OK )
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    set "PYEXE=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    goto PYTHON_BITNET_OK
)
echo  Python 3.11 non trovato. Installazione...
winget install --id Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements
set "PATH=%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python311\Scripts;%PATH%"
ping -n 3 127.0.0.1 >nul 2>&1
py -3.11 --version >nul 2>&1
if %errorlevel% equ 0 ( set "PYEXE=py -3.11" & goto PYTHON_BITNET_OK )
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    set "PYEXE=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    goto PYTHON_BITNET_OK
)
echo  ERRORE: Python 3.11 non raggiungibile. Chiudi e riapri il terminale.
pause
goto STEP5

:PYTHON_BITNET_OK
for /f "tokens=2" %%v in ('!PYEXE! --version 2^>^&1') do set PY_BITNET_VER=%%v
echo  OK - Python !PY_BITNET_VER!
!PYEXE! -c "import sys; sys.exit(0 if sys.version_info[:2]==(3,11) else 1)" >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERRORE: Python trovato ma non e' la versione 3.11.
    pause
    goto STEP5
)

!PYEXE! -m ensurepip --upgrade >nul 2>&1
!PYEXE! -m pip install --upgrade pip setuptools wheel --user --quiet --no-warn-script-location
!PYEXE! -m pip install "huggingface_hub>=0.34.0,<1.0" --user --quiet --no-warn-script-location
if %errorlevel% neq 0 ( echo  ERRORE: pip install huggingface_hub fallito. & pause & goto STEP5 )
echo  OK - huggingface-hub pronto

if not exist "%BITNET_DIR%\setup_env.py" (
    echo  Clone microsoft/BitNet...
    git clone --recursive https://github.com/microsoft/BitNet.git "%BITNET_DIR%"
    if %errorlevel% neq 0 ( echo  ERRORE: Clone BitNet fallito. & pause & goto STEP5 )
) else (
    git -C "%BITNET_DIR%" pull >nul 2>&1
)

git -C "%BITNET_DIR%" submodule update --init --recursive
if %errorlevel% neq 0 ( echo  ERRORE: submodule update fallito. & pause & goto STEP5 )

if exist "%BITNET_DIR%\build" rmdir /s /q "%BITNET_DIR%\build" >nul 2>&1

set BITNET_BUILD_BAT=%TMP_DIR%\bitnet_build.bat
(
    echo @echo off
    echo call "!VSDEVCMD!" -startdir=none -arch=x64 -host_arch=x64
    echo if errorlevel 1 exit /b 1
    echo cd /d "!BITNET_DIR!"
    echo !PYEXE! -m pip install -r requirements.txt --user --quiet --no-warn-script-location
    echo if errorlevel 1 exit /b 1
    echo !PYEXE! setup_env.py -md models/BitNet-b1.58-2B-4T -q i2_s
    echo if errorlevel 1 exit /b 1
) > "%BITNET_BUILD_BAT%"

echo.
echo  [*] Build BitNet + download modello (~1.2GB, 5-15 minuti)...
call "%BITNET_BUILD_BAT%"
if %errorlevel% neq 0 (
    echo  ERRORE: Build BitNet fallita. Controlla: !BITNET_DIR!\logs\
    pause
    goto STEP5
)
del "%BITNET_BUILD_BAT%" >nul 2>&1

if not exist "%BITNET_DIR%\models\BitNet-b1.58-2B-4T\ggml-model-i2_s.gguf" (
    echo  ERRORE: .gguf non trovato. Build incompleta.
    pause
    goto STEP5
)
echo  OK - BitNet compilato e modello pronto
goto STEP6

REM ── Ollama setup condiviso ───────────────────────────────────────────────────
:OLLAMA_SETUP
echo.
echo  Verifica Ollama...
ollama --version >nul 2>&1
if %errorlevel% neq 0 goto INSTALL_OLLAMA
if "!FORCE_UPDATE_OLLAMA!"=="1" (
    ollama --version > "%TMP_DIR%\olv.txt" 2>&1
    node -e "var s=require('fs').readFileSync(process.env.TEMP+'\\hypervibe_install\\olv.txt','utf8');var m=s.match(/(\d+)\.(\d+)/);process.exit(!m||parseInt(m[2])<20?1:0);" >nul 2>&1
    if !errorlevel! equ 0 ( echo  OK - Ollama gia' aggiornato & goto OLLAMA_READY )
    goto INSTALL_OLLAMA
)
goto OLLAMA_READY

:INSTALL_OLLAMA
echo  Download Ollama...
curl -L --progress-bar -o "%TMP_DIR%\OllamaSetup.exe" "https://ollama.com/download/OllamaSetup.exe"
if %errorlevel% neq 0 ( echo  ERRORE: Download Ollama fallito. & pause & exit /b 1 )
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
goto STEP6

REM ── Tri-Hybrid Engine ────────────────────────────────────────────────────────
:AI_TRIHYBRID
set PROVIDER=trihybrid
set OLLAMA_MODEL=
set CLAUDE_MODEL=
set FINAL_A=
set FINAL_OAI=
set THY_LLAMA_MODEL=llama3.1:8b
set THY_OPENAI_MODEL=gpt-4o-mini
set THY_CLAUDE_MODEL=claude-haiku-4-5-20251001
set THY_LLAMA_THRESHOLD=0.30
set THY_OPENAI_THRESHOLD=0.60
set THY_CONFIDENCE=0.55
set THY_MAX_ESC=2

echo.
echo  -- TRI-HYBRID ENGINE ------------------------------------------------
echo   Routing automatico: LLaMA locale / OpenAI GPT / Claude
echo.

echo  [*] Verifica Python 3.11+...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    winget install --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
    set "PATH=%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;%PATH%"
)
python -c "import sys; sys.exit(0 if sys.version_info>=(3,11) else 1)" >nul 2>&1
if %errorlevel% neq 0 ( echo  ERRORE: Python 3.11+ richiesto. & pause & exit /b 1 )
for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PY_VER=%%v
echo  OK - Python %PY_VER%

if not exist "%THY_DIR%\main.py" (
    if exist "%INSTALL_DIR%\tri_hybrid_engine\main.py" (
        xcopy "%INSTALL_DIR%\tri_hybrid_engine" "%THY_DIR%" /E /I /Q >nul 2>&1
        echo  OK - Engine copiato
    ) else (
        echo  ATTENZIONE: tri_hybrid_engine\ non trovato. Premi un tasto e ritenta.
        pause
        if not exist "%THY_DIR%\main.py" ( echo  ERRORE: Engine non trovato. & pause & exit /b 1 )
    )
) else ( echo  OK - Engine presente )

python -m ensurepip --upgrade --user >nul 2>&1
python -m pip install --upgrade pip --user --quiet 2>nul
python -m pip install "anthropic>=0.40.0" "openai>=1.50.0" "aiohttp>=3.9.0" "fastapi>=0.115.0" "uvicorn>=0.30.0" --user --quiet
if %errorlevel% neq 0 ( echo  ERRORE: pip install fallito. & pause & exit /b 1 )
echo  OK - Dipendenze Python installate

echo.
echo  Installare Ollama + LLaMA come tier economico? (senza: tier base = OpenAI)
set INSTALL_OLLAMA_THY=
set /p INSTALL_OLLAMA_THY="  (S/N): "
if /i "!INSTALL_OLLAMA_THY!"=="S" (
    ollama --version >nul 2>&1
    if %errorlevel% neq 0 (
        curl -L --progress-bar -o "%TMP_DIR%\OllamaSetup.exe" "https://ollama.com/download/OllamaSetup.exe"
        "%TMP_DIR%\OllamaSetup.exe" /S
        ping -n 10 127.0.0.1 >nul 2>&1
        set "PATH=%LOCALAPPDATA%\Programs\Ollama;%PATH%"
    )
    echo.
    echo   [1] llama3.2:3b  2GB   [2] llama3.1:8b  5GB (consigliato)
    echo   [3] qwen3:8b     5GB   [4] mistral:7b   4GB
    echo   [5] qwen2.5:14b  9GB   [6] custom
    echo.
    set LLAMA_PICK=
    set /p LLAMA_PICK="  Scelta [1-6]: "
    if "!LLAMA_PICK!"=="1" set THY_LLAMA_MODEL=llama3.2:3b
    if "!LLAMA_PICK!"=="2" set THY_LLAMA_MODEL=llama3.1:8b
    if "!LLAMA_PICK!"=="3" set THY_LLAMA_MODEL=qwen3:8b
    if "!LLAMA_PICK!"=="4" set THY_LLAMA_MODEL=mistral:7b
    if "!LLAMA_PICK!"=="5" set THY_LLAMA_MODEL=qwen2.5:14b
    if "!LLAMA_PICK!"=="6" set /p THY_LLAMA_MODEL="  Nome modello: "
    start /B ollama serve >nul 2>&1
    ping -n 5 127.0.0.1 >nul 2>&1
    ollama pull !THY_LLAMA_MODEL!
    if %errorlevel% equ 0 ( set OLLAMA_MODEL=!THY_LLAMA_MODEL! & echo  OK - !THY_LLAMA_MODEL! scaricato )
)

echo.
set CUR_A=
set CUR_OAI=
if exist "%ENV_FILE%" for /f "usebackq tokens=1,* delims==" %%a in ("%ENV_FILE%") do (
    if "%%a"=="ANTHROPIC_API_KEY" set CUR_A=%%b
    if "%%a"=="OPENAI_API_KEY"    set CUR_OAI=%%b
)
if not "!CUR_A!"==""   echo  Anthropic attuale: !CUR_A:~0,20!...
set /p NEW_A="  Anthropic API Key [INVIO per mantenere]: "
if "!NEW_A!"=="" (set FINAL_A=!CUR_A!) else (set FINAL_A=!NEW_A!)
if not "!CUR_OAI!"=="" echo  OpenAI attuale: !CUR_OAI:~0,20!...
set /p NEW_OAI="  OpenAI API Key [INVIO per mantenere]: "
if "!NEW_OAI!"=="" (set FINAL_OAI=!CUR_OAI!) else (set FINAL_OAI=!NEW_OAI!)

echo.
echo  Soglie routing (INVIO per default  0.30 / 0.60 / 0.55):
set /p THY_L="  LLAMA_THRESHOLD  [0.30]: "
set /p THY_O="  OPENAI_THRESHOLD [0.60]: "
set /p THY_C="  CONFIDENCE       [0.55]: "
if not "!THY_L!"=="" set THY_LLAMA_THRESHOLD=!THY_L!
if not "!THY_O!"=="" set THY_OPENAI_THRESHOLD=!THY_O!
if not "!THY_C!"=="" set THY_CONFIDENCE=!THY_C!

mkdir "%THY_DIR%\logs" >nul 2>&1
echo  OK - Tri-Hybrid Engine configurato
goto STEP6

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

if /i "!PROVIDER!"=="trihybrid" goto WRITE_TRIHYBRID_HEADER
if /i "!PROVIDER!"=="bitnet"    goto WRITE_BITNET_HEADER
echo PROVIDER=!PROVIDER!>>"%ENV_FILE%"
goto WRITE_COMMON

:WRITE_TRIHYBRID_HEADER
if not "!FINAL_A!"=="" (
    echo PROVIDER=anthropic>>"%ENV_FILE%"
) else (
    echo PROVIDER=ollama>>"%ENV_FILE%"
)
echo THY_PROVIDER=trihybrid>>"%ENV_FILE%"
echo ANTHROPIC_BASE_URL=http://127.0.0.1:3002>>"%ENV_FILE%"
goto WRITE_COMMON

:WRITE_BITNET_HEADER
echo PROVIDER=bitnet>>"%ENV_FILE%"
echo BITNET_DIR=!BITNET_DIR!>>"%ENV_FILE%"
echo BITNET_MODEL=!BITNET_MODEL!>>"%ENV_FILE%"
echo BITNET_PORT=!BITNET_PORT!>>"%ENV_FILE%"
echo BITNET_BASE_URL=http://127.0.0.1:!BITNET_PORT!>>"%ENV_FILE%"
echo BITNET_TOOLS_SUPPORTED=0>>"%ENV_FILE%"
goto WRITE_COMMON

:WRITE_COMMON
if not "!OLLAMA_MODEL!"=="" echo OLLAMA_MODEL=!OLLAMA_MODEL!>>"%ENV_FILE%"
if not "!OLLAMA_MODEL!"=="" echo OLLAMA_BASE_URL=http://localhost:11434>>"%ENV_FILE%"
if not "!FINAL_A!"==""      echo ANTHROPIC_API_KEY=!FINAL_A!>>"%ENV_FILE%"
if not "!CLAUDE_MODEL!"=="" echo CLAUDE_MODEL=!CLAUDE_MODEL!>>"%ENV_FILE%"
echo HL_WALLET_ADDRESS=!FINAL_W!>>"%ENV_FILE%"
echo HL_PRIVATE_KEY=!FINAL_K!>>"%ENV_FILE%"
echo HL_NETWORK=!FINAL_NET!>>"%ENV_FILE%"
echo PORT=3001>>"%ENV_FILE%"
if not "!FINAL_TGT!"=="" echo TELEGRAM_BOT_TOKEN=!FINAL_TGT!>>"%ENV_FILE%"
if not "!FINAL_TGC!"=="" echo TELEGRAM_CHAT_ID=!FINAL_TGC!>>"%ENV_FILE%"
if "!INSTALL_AUTOTRADE_OK!"=="1" (
    echo AUTOTRADE_DIR=!TOOLS_DIR!\autotrade>>"%ENV_FILE%"
    echo SIGNALS_DIR=!APP_DIR!\playbooks\signals>>"%ENV_FILE%"
)
if "!INSTALL_VIBE_OK!"=="1" (
    echo VIBE_TRADING_DIR=!VIBE_DIR_FINAL!>>"%ENV_FILE%"
    echo VIBE_TRADING_URL=http://localhost:8000>>"%ENV_FILE%"
)

if /i "!PROVIDER!" neq "trihybrid" goto WRITE_DONE

if not "!FINAL_OAI!"==""    echo OPENAI_API_KEY=!FINAL_OAI!>>"%ENV_FILE%"
echo OPENAI_MODEL=!THY_OPENAI_MODEL!>>"%ENV_FILE%"
if not "!OLLAMA_MODEL!"=="" echo LLAMA_MODEL=!OLLAMA_MODEL!>>"%ENV_FILE%"
echo CLAUDE_MODEL=!THY_CLAUDE_MODEL!>>"%ENV_FILE%"
echo LLAMA_THRESHOLD=!THY_LLAMA_THRESHOLD!>>"%ENV_FILE%"
echo OPENAI_THRESHOLD=!THY_OPENAI_THRESHOLD!>>"%ENV_FILE%"
echo CONFIDENCE_THRESHOLD=!THY_CONFIDENCE!>>"%ENV_FILE%"
echo MAX_ESCALATIONS=!THY_MAX_ESC!>>"%ENV_FILE%"
echo MAX_INPUT_TOKENS=3000>>"%ENV_FILE%"
echo MAX_OUTPUT_TOKENS=1024>>"%ENV_FILE%"
echo CONCURRENT_REQUESTS=10>>"%ENV_FILE%"
echo THY_ENGINE_DIR=!THY_DIR!>>"%ENV_FILE%"
echo LOG_DIR=!THY_DIR!\logs>>"%ENV_FILE%"

:WRITE_DONE
echo  OK - .env salvato
rmdir /s /q "%TMP_DIR%" >nul 2>&1

REM ── Riepilogo ────────────────────────────────────────────────────────────────
echo.
echo  ==========================================
echo   INSTALLAZIONE COMPLETATA
if /i "!PROVIDER!"=="trihybrid" (
    echo   Motore AI : TRI-HYBRID ENGINE
    if not "!OLLAMA_MODEL!"=="" echo   Tier 1    : LLaMA - !OLLAMA_MODEL!
    if "!FINAL_OAI!"=="" (
        echo   Tier 2    : OpenAI GPT ^(KEY NON INSERITA^)
    ) else (
        echo   Tier 2    : OpenAI !THY_OPENAI_MODEL!
    )
    if "!FINAL_A!"=="" (
        echo   Tier 3    : Claude ^(KEY NON INSERITA^)
    ) else (
        echo   Tier 3    : Claude !THY_CLAUDE_MODEL!
    )
    echo   Soglie    : LLaMA^<!THY_LLAMA_THRESHOLD! / OpenAI^<!THY_OPENAI_THRESHOLD! / Conf^<!THY_CONFIDENCE!
) else if /i "!PROVIDER!"=="ollama" (
    echo   Motore AI : LOCALE - !OLLAMA_MODEL!
) else if /i "!PROVIDER!"=="bitnet" (
    echo   Motore AI : BITNET CPU-ONLY - !BITNET_MODEL!
    echo   Python    : !PY_BITNET_VER!
    echo   clang-cl  : OK
    echo   Tools     : CHAT/ANALISI ONLY
    echo   Porta     : !BITNET_PORT!
) else (
    echo   Motore AI : API - !CLAUDE_MODEL!
)
echo   Network   : !FINAL_NET!
if "!INSTALL_AUTOTRADE_OK!"=="1" echo   Autotrade : INSTALLATO
if "!INSTALL_VIBE_OK!"=="1" (
    echo   Vibe-Trading : INSTALLATO ^(!VIBE_PROVIDER!^)
    echo   Swarm        : crypto_trading_desk, risk_committee
)
echo  ==========================================
echo.

set /p LAUNCH="  Avviare HyperVibe ora? (S/N): "
if /i "!LAUNCH!" neq "S" goto END_NOLAN

if /i "!PROVIDER!"=="bitnet"    goto LAUNCH_BITNET
if /i "!PROVIDER!"=="trihybrid" goto LAUNCH_TRIHYBRID
if /i "!PROVIDER!"=="ollama" (
    start /B ollama serve >nul 2>&1
    ping -n 3 127.0.0.1 >nul 2>&1
)
cd /d "%APP_DIR%"
call npm start
goto END_NOLAN

:LAUNCH_BITNET
echo  Avvio BitNet server su porta !BITNET_PORT!...
set BITNET_LAUNCH_BAT=%TEMP%\bitnet_launch.bat
(
    echo @echo off
    echo call "!VSDEVCMD!" -startdir=none -arch=x64 -host_arch=x64
    echo cd /d "!BITNET_DIR!"
    echo !PYEXE! run_inference.py -m models/BitNet-b1.58-2B-4T/ggml-model-i2_s.gguf -p "You are a helpful trading assistant" --host 127.0.0.1 --port !BITNET_PORT!
) > "%BITNET_LAUNCH_BAT%"
start "HyperVibe - BitNet Server" /min "%BITNET_LAUNCH_BAT%"
ping -n 6 127.0.0.1 >nul 2>&1
cd /d "%APP_DIR%"
call npm start
goto END_NOLAN

:LAUNCH_TRIHYBRID
echo  Avvio Tri-Hybrid Engine...
if not "!OLLAMA_MODEL!"=="" ( start /B ollama serve >nul 2>&1 & ping -n 4 127.0.0.1 >nul 2>&1 )
set THY_CMD=cd /d !THY_DIR! && python bridge.py
start "HyperVibe - Tri-Hybrid Bridge" /min cmd /k "!THY_CMD!"
ping -n 3 127.0.0.1 >nul 2>&1
cd /d "%APP_DIR%"
call npm start

:END_NOLAN
echo.
pause

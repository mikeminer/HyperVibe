@echo off
setlocal EnableDelayedExpansion
title HyperVibe Installer v3.4
chcp 437 >nul

set INSTALL_DIR=%~dp0
set INSTALL_DIR=%INSTALL_DIR:~0,-1%
set TMP_DIR=%TEMP%\hypervibe_install

echo.
echo  ==========================================
echo   HYPERVIBE - Installer v3.4
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

echo  Verifica Claude Code CLI...
call claude --version >nul 2>&1
if %errorlevel% equ 0 goto CLAUDE_OK

call npm.cmd --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERRORE: npm non trovato. Installa Node.js prima di continuare.
    pause & exit /b 1
)
call npm.cmd install -g @anthropic-ai/claude-code --silent
if %errorlevel% neq 0 (
    echo  ATTENZIONE: Claude Code CLI non installato.
    echo  Installa manualmente: npm install -g @anthropic-ai/claude-code
    pause & exit /b 1
)
call claude --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERRORE: Claude Code CLI non disponibile. Riapri il terminale e riesegui.
    pause & exit /b 1
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
set NEED_OLLAMA=0
set CUR_ANTHROPIC=
if exist "%ENV_FILE%" for /f "usebackq tokens=1,* delims==" %%a in ("%ENV_FILE%") do if "%%a"=="ANTHROPIC_API_KEY" set CUR_ANTHROPIC=%%b
echo.
if not "!CUR_ANTHROPIC!"=="" echo  Attuale: !CUR_ANTHROPIC:~0,20!...
set /p NEW_A="  Anthropic API Key (INVIO per mantenere): "
if "!NEW_A!"=="" (set FINAL_A=!CUR_ANTHROPIC!) else (set FINAL_A=!NEW_A!)
goto STEP6

REM ── Solo Locale: sottomenu modello (Ollama) ───────────────────────────────────
REM  Tutti i modelli elencati supportano tools/function calling su Ollama.
REM  Esclusi: deepseek-r1:*, qwq:* (HTTP 400 tools not supported).
:AI_LOCAL_MENU
echo.
echo   Tutti i modelli elencati supportano tools/function calling.
echo.
echo   ── LEGGERI (2-6 GB RAM) ─────────────────────────────────────────────
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
echo   ── MEDI (8-16 GB RAM) ───────────────────────────────────────────────
echo   [10] Qwen 2.5 14B          - qwen2.5:14b            ~9GB  (consigliato)
echo   [11] Qwen3 14B             - qwen3:14b              ~9GB
echo   [12] Phi-4 14B             - phi4:14b               ~9GB
echo   [13] Qwen 2.5 Coder 14B   - qwen2.5-coder:14b      ~9GB
echo   [14] Mistral Nemo 12B      - mistral-nemo            ~8GB
echo   [15] Granite 3.2 8B        - granite3.2:8b           ~5GB
echo   [16] Llama 3.3 70B Q4     - llama3.3:70b-q4_K_M   ~12GB
echo.
echo   ── PESANTI (20+ GB RAM) ─────────────────────────────────────────────
echo   [17] Gemma 4 27B MoE       - gemma4:27b            ~20GB
echo   [18] Qwen3 32B             - qwen3:32b             ~22GB
echo   [19] Qwen 2.5 32B          - qwen2.5:32b           ~22GB
echo   [20] Mixtral 8x7B          - mixtral:8x7b          ~30GB
echo   [21] Llama 3.1 70B         - llama3.1:70b          ~48GB
echo   [22] Qwen3 72B             - qwen3:72b             ~48GB
echo.
echo   [23] Nome custom (inserisci tag Ollama manualmente)
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
if "!LOCAL_CHOICE!"=="23" (
    set /p OLLAMA_MODEL="  Tag Ollama (es. qwen3:30b-a3b): "
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

REM ── BitNet CPU Engine (Microsoft 1-bit LLM) ───────────────────────────────────
:AI_BITNET
set PROVIDER=bitnet
set OLLAMA_MODEL=
set CLAUDE_MODEL=
set FINAL_A=
set BITNET_PORT=8080
set BITNET_MODEL=BitNet-b1.58-2B-4T
set BITNET_DIR=%HV_DIR%\bitnet

echo.
echo  ── BITNET CPU ENGINE ────────────────────────────────────────────────────
echo   Inferenza 1-bit nativa, nessuna GPU richiesta.
echo   Modello: BitNet b1.58 2B4T (~1.2GB)
echo   Vantaggi: 82%% risparmio energetico, fino a 6x piu' veloce su CPU x86
echo.
echo   ATTENZIONE: tool/function calling NON ancora supportato ufficialmente.
echo   HyperVibe funzionera' in modalita' CHAT/ANALISI:
echo     Segnali e analisi testuali : OK
echo     Esecuzione ordini autonoma : NON DISPONIBILE
echo.
echo   PREREQUISITI RICHIESTI (installazione manuale se assenti):
echo     - Visual Studio 2022 Community/BuildTools con "Sviluppo C++"
echo       https://visualstudio.microsoft.com/it/downloads/
echo     - CMake 3.22+  (winget install Kitware.CMake)
echo     - Python 3.9+  (gia' verificato al passo precedente)
echo     - Hugging Face CLI  (pip install huggingface_hub[cli])
echo.
set /p BITNET_OK="  Continuare con BitNet? (S/N): "
if /i "!BITNET_OK!" neq "S" goto STEP5

REM ·· Verifica VS2022 - solo check, NO auto-install ····························
echo.
echo  [*] Verifica Visual Studio 2022...
set VS_CMD=
if exist "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat"   set "VS_CMD=C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat"
if exist "C:\Program Files\Microsoft Visual Studio\2022\Professional\Common7\Tools\VsDevCmd.bat" set "VS_CMD=C:\Program Files\Microsoft Visual Studio\2022\Professional\Common7\Tools\VsDevCmd.bat"
if exist "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\Common7\Tools\VsDevCmd.bat"   set "VS_CMD=C:\Program Files\Microsoft Visual Studio\2022\Enterprise\Common7\Tools\VsDevCmd.bat"
if exist "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"   set "VS_CMD=C:\Program Files\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"

if "!VS_CMD!"=="" (
    echo.
    echo  ERRORE: Visual Studio 2022 non trovato.
    echo  Installa Visual Studio 2022 Community (gratuito) con il workload
    echo  "Sviluppo di applicazioni desktop con C++" da:
    echo  https://visualstudio.microsoft.com/it/downloads/
    echo.
    echo  Dopo l'installazione riesegui questo installer.
    pause
    goto STEP5
)
echo  OK - VS2022 trovato: !VS_CMD!

REM ·· Inizializza ambiente VS (senza call che puo' crashare la sessione) ········
echo  [*] Inizializzazione ambiente di build...
cmd /c "call "!VS_CMD!" -startdir=none -arch=x64 -host_arch=x64 && cmake --version" >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERRORE: Impossibile inizializzare l'ambiente VS2022.
    echo  Esegui questo installer dallo "Developer Command Prompt for VS 2022".
    pause
    goto STEP5
)
echo  OK - Ambiente VS2022 inizializzato

REM ·· CMake ····················································
echo  [*] Verifica CMake...
cmake --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  CMake non trovato. Installazione via winget...
    winget install --id Kitware.CMake --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
    set "PATH=C:\Program Files\CMake\bin;%PATH%"
    cmake --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo  ERRORE: CMake non installato. Installa manualmente da https://cmake.org
        pause
        goto STEP5
    )
)
for /f "tokens=3" %%v in ('cmake --version 2^>nul ^| findstr /i "version"') do set CMAKE_VER=%%v
echo  OK - CMake !CMAKE_VER!

REM ·· Python + huggingface-cli ·················································
echo  [*] Installazione huggingface-cli...
python -m pip install "huggingface_hub[cli]" --quiet 2>nul
if %errorlevel% neq 0 (
    echo  ERRORE: pip install huggingface_hub fallito.
    pause
    goto STEP5
)
echo  OK - huggingface-cli pronto

REM ·· Clone microsoft/BitNet ···················································
echo  [*] Verifica BitNet repo...
if not exist "!BITNET_DIR!\setup_env.py" (
    echo  Clone microsoft/BitNet con submoduli (~500MB)...
    git clone --recursive https://github.com/microsoft/BitNet.git "!BITNET_DIR!"
    if %errorlevel% neq 0 (
        echo  ERRORE: Clone BitNet fallito. Controlla la connessione internet.
        pause
        goto STEP5
    )
    echo  OK - BitNet clonato
) else (
    echo  OK - BitNet gia' presente, aggiorno...
    git -C "!BITNET_DIR!" pull >nul 2>&1
    git -C "!BITNET_DIR!" submodule update --recursive >nul 2>&1
)

REM ·· Dipendenze Python BitNet ·················································
echo  [*] Installazione requirements.txt BitNet...
cd /d "!BITNET_DIR!"
python -m pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo  ERRORE: pip install requirements.txt fallito.
    pause
    goto STEP5
)
echo  OK - Dipendenze Python BitNet installate

REM ·· Build + download modello (lanciato dentro Developer Command Prompt) ······
echo.
echo  [*] Download BitNet b1.58 2B4T + compilazione kernel...
echo      (download ~1.2GB + build, richiede 5-15 minuti)
echo      IMPORTANTE: se la build fallisce, riesegui dallo
echo      "Developer Command Prompt for VS 2022" e lancia manualmente:
echo      cd !BITNET_DIR! ^&^& python setup_env.py -md models/BitNet-b1.58-2B-4T -q i2_s
echo.
cmd /c "call "!VS_CMD!" -startdir=none -arch=x64 -host_arch=x64 && cd /d "!BITNET_DIR!" && python setup_env.py -md models/BitNet-b1.58-2B-4T -q i2_s"
if %errorlevel% neq 0 (
    echo.
    echo  ERRORE: setup_env.py fallito.
    echo  Prova a eseguire manualmente dallo Developer Command Prompt VS2022:
    echo    cd !BITNET_DIR!
    echo    python setup_env.py -md models/BitNet-b1.58-2B-4T -q i2_s
    pause
    goto STEP5
)
echo  OK - BitNet compilato e modello pronto
echo  OK - BitNet Engine configurato
goto STEP6

REM ── Ollama setup condiviso (Solo Locale) ─────────────────────────────────────
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

REM ────────────────────────────────────────────────────────────────────────────
REM [4] TRI-HYBRID ENGINE
REM ────────────────────────────────────────────────────────────────────────────
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
echo  ── TRI-HYBRID ENGINE ────────────────────────────────────────────────────
echo   Routing automatico: LLaMA (locale) - GPT (media complessita') - Claude (massima)
echo   Il motore calcola un value_score per ogni prompt e sceglie il modello
echo   piu' economico in grado di rispondere con confidenza sufficiente.
echo.

REM ·· Python 3.11+ ·············································
echo  [*] Verifica Python 3.11+...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    winget install --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
    set "PATH=%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;%PATH%"
    python --version >nul 2>&1
    if %errorlevel% neq 0 ( echo  ERRORE: Installa Python 3.11+ da https://python.org & pause & exit /b 1 )
)
python -c "import sys; sys.exit(0 if sys.version_info>=(3,11) else 1)" >nul 2>&1
if %errorlevel% neq 0 ( echo  ERRORE: Python 3.11+ richiesto. & pause & exit /b 1 )
for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PY_VER=%%v
echo  OK - Python %PY_VER%

REM ·· Copia tri_hybrid_engine ··················································
echo  [*] Verifica cartella Tri-Hybrid Engine...
if not exist "%THY_DIR%\main.py" (
    if exist "%INSTALL_DIR%\tri_hybrid_engine\main.py" (
        xcopy "%INSTALL_DIR%\tri_hybrid_engine" "%THY_DIR%" /E /I /Q >nul 2>&1
        echo  OK - Engine copiato in %THY_DIR%
    ) else (
        echo  ATTENZIONE: tri_hybrid_engine\ non trovato accanto all'installer.
        pause
        if not exist "%THY_DIR%\main.py" ( echo  ERRORE: Engine non trovato. & pause & exit /b 1 )
    )
) else (
    echo  OK - Engine gia' presente in %THY_DIR%
)

REM ·· Dipendenze Python ·······················································
echo  [*] Installazione dipendenze Python...
python -m ensurepip --upgrade --user >nul 2>&1
python -m pip --version >nul 2>&1
if %errorlevel% neq 0 (
    curl -L --progress-bar -o "%TMP_DIR%\get-pip.py" "https://bootstrap.pypa.io/get-pip.py"
    python "%TMP_DIR%\get-pip.py" --user --quiet
)
python -m pip install --upgrade pip --user --quiet 2>nul
python -m pip install "anthropic>=0.40.0" "openai>=1.50.0" "aiohttp>=3.9.0" "fastapi>=0.115.0" "uvicorn>=0.30.0" --user --quiet
if %errorlevel% neq 0 ( echo  ERRORE: pip install fallito. & pause & exit /b 1 )
echo  OK - anthropic, openai, aiohttp installati

REM ·· Ollama + LLaMA locale ···················································
echo.
echo  [*] Vuoi usare un modello LLaMA locale come tier economico?
echo      (Senza LLaMA, il tier base sara' OpenAI GPT)
echo.
set INSTALL_OLLAMA_THY=
set /p INSTALL_OLLAMA_THY="  Installare Ollama + LLaMA? (S/N): "
if /i "!INSTALL_OLLAMA_THY!"=="S" (
    ollama --version >nul 2>&1
    if %errorlevel% neq 0 (
        curl -L --progress-bar -o "%TMP_DIR%\OllamaSetup.exe" "https://ollama.com/download/OllamaSetup.exe"
        if %errorlevel% neq 0 ( echo  ERRORE: Download Ollama fallito. & pause & exit /b 1 )
        "%TMP_DIR%\OllamaSetup.exe" /S
        ping -n 10 127.0.0.1 >nul 2>&1
        set "PATH=%LOCALAPPDATA%\Programs\Ollama;%PATH%"
    )
    echo.
    echo  Modelli disponibili per tier LLaMA (tutti con tools support):
    echo   [1] llama3.2:3b    (2GB  - leggero)
    echo   [2] llama3.1:8b    (5GB  - bilanciato, consigliato)
    echo   [3] qwen3:8b       (5GB  - alternativa capace)
    echo   [4] mistral:7b     (4GB  - veloce)
    echo   [5] qwen2.5:14b    (9GB  - qualita' alta)
    echo   [6] Nome custom
    echo.
    set LLAMA_PICK=
    set /p LLAMA_PICK="  Scelta [1-6]: "
    if "!LLAMA_PICK!"=="1" set THY_LLAMA_MODEL=llama3.2:3b
    if "!LLAMA_PICK!"=="2" set THY_LLAMA_MODEL=llama3.1:8b
    if "!LLAMA_PICK!"=="3" set THY_LLAMA_MODEL=qwen3:8b
    if "!LLAMA_PICK!"=="4" set THY_LLAMA_MODEL=mistral:7b
    if "!LLAMA_PICK!"=="5" set THY_LLAMA_MODEL=qwen2.5:14b
    if "!LLAMA_PICK!"=="6" set /p THY_LLAMA_MODEL="  Nome modello: "
    echo  Download !THY_LLAMA_MODEL!...
    start /B ollama serve >nul 2>&1
    ping -n 5 127.0.0.1 >nul 2>&1
    ollama pull !THY_LLAMA_MODEL!
    if %errorlevel% neq 0 (
        echo  ATTENZIONE: pull fallito. Il tier base sara' OpenAI.
    ) else (
        echo  OK - !THY_LLAMA_MODEL! scaricato
        set OLLAMA_MODEL=!THY_LLAMA_MODEL!
    )
)

REM ·· API Keys ·················································
echo.
echo  Inserisci le API Key per i tier cloud (lascia vuoto per saltare il tier).
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

REM ·· Soglie di routing ·······················································
echo.
echo  Soglie di routing (INVIO per default):
echo   value_score ^< LLAMA_THRESHOLD  → LLaMA locale
echo   value_score ^< OPENAI_THRESHOLD → OpenAI GPT
echo   value_score ^>= OPENAI_THRESHOLD → Claude
echo.
set /p THY_LLAMA_THRESHOLD_IN="  LLAMA_THRESHOLD  [default 0.30]: "
set /p THY_OPENAI_THRESHOLD_IN="  OPENAI_THRESHOLD [default 0.60]: "
set /p THY_CONFIDENCE_IN="  CONFIDENCE_THRESHOLD [default 0.55]: "
if not "!THY_LLAMA_THRESHOLD_IN!"==""  set THY_LLAMA_THRESHOLD=!THY_LLAMA_THRESHOLD_IN!
if not "!THY_OPENAI_THRESHOLD_IN!"=="" set THY_OPENAI_THRESHOLD=!THY_OPENAI_THRESHOLD_IN!
if not "!THY_CONFIDENCE_IN!"==""       set THY_CONFIDENCE=!THY_CONFIDENCE_IN!

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

REM ── PROVIDER ─────────────────────────────────────────────────────────────────
if /i "!PROVIDER!"=="trihybrid" (
    if not "!FINAL_A!"=="" (
        >>"%ENV_FILE%" echo PROVIDER=anthropic
    ) else (
        >>"%ENV_FILE%" echo PROVIDER=ollama
    )
    >>"%ENV_FILE%" echo THY_PROVIDER=trihybrid
    >>"%ENV_FILE%" echo ANTHROPIC_BASE_URL=http://127.0.0.1:3002
) else if /i "!PROVIDER!"=="bitnet" (
    >>"%ENV_FILE%" echo PROVIDER=bitnet
    >>"%ENV_FILE%" echo BITNET_DIR=!BITNET_DIR!
    >>"%ENV_FILE%" echo BITNET_MODEL=!BITNET_MODEL!
    >>"%ENV_FILE%" echo BITNET_PORT=!BITNET_PORT!
    >>"%ENV_FILE%" echo BITNET_BASE_URL=http://127.0.0.1:!BITNET_PORT!
    >>"%ENV_FILE%" echo BITNET_TOOLS_SUPPORTED=0
) else (
    >>"%ENV_FILE%" echo PROVIDER=!PROVIDER!
)

REM ── Variabili comuni ─────────────────────────────────────────────────────────
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

REM ── Variabili Tri-Hybrid ─────────────────────────────────────────────────────
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
    echo   Motore AI : LOCALE (Ollama) - !OLLAMA_MODEL!
) else if "!PROVIDER!"=="bitnet" (
    echo   Motore AI : BITNET CPU-ONLY
    echo   Modello   : !BITNET_MODEL! ^(1-bit, nessuna GPU^)
    echo   Porta     : !BITNET_PORT!
    echo   Tools     : CHAT/ANALISI ONLY
) else (
    echo   Motore AI : API - !CLAUDE_MODEL!
)
echo   Network   : !FINAL_NET!
if "!INSTALL_AUTOTRADE_OK!"=="1" echo   Autotrade : INSTALLATO
echo  ==========================================
echo.

set /p LAUNCH="  Avviare HyperVibe ora? (S/N): "
if /i "!LAUNCH!" neq "S" goto END_NOLAN

REM ── Sequenza di avvio ────────────────────────────────────────────────────────
if /i "!PROVIDER!"=="trihybrid" goto LAUNCH_TRIHYBRID
if /i "!PROVIDER!"=="bitnet"    goto LAUNCH_BITNET
if /i "!PROVIDER!"=="ollama" (
    start /B ollama serve >nul 2>&1
    ping -n 3 127.0.0.1 >nul 2>&1
)
cd /d "%APP_DIR%"
call npm start
goto END_NOLAN

:LAUNCH_BITNET
echo.
echo  Avvio BitNet inference server (porta !BITNET_PORT!)...
start "HyperVibe - BitNet Server" /min cmd /k ^
    "cd /d "!BITNET_DIR!" && python run_inference.py -m models/BitNet-b1.58-2B-4T/ggml-model-i2_s.gguf -p "You are a helpful trading assistant" --host 127.0.0.1 --port !BITNET_PORT!"
echo  Attendo avvio server...
ping -n 6 127.0.0.1 >nul 2>&1
echo  Avvio HyperVibe Node.js...
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
ping -n 3 127.0.0.1 >nul 2>&1
echo  [*] Avvio HyperVibe Node.js...
cd /d "%APP_DIR%"
call npm start

:END_NOLAN
echo.
pause

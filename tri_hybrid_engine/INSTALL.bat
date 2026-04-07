@echo off
setlocal EnableDelayedExpansion
title Tri-Hybrid AI Engine — Installer ^& Launcher
color 0A

:: ─── Banner ──────────────────────────────────────────────────────────────────
echo.
echo  ████████╗██████╗ ██╗      ██╗  ██╗██╗   ██╗██████╗ ██████╗ ██╗██████╗
echo  ╚══██╔══╝██╔══██╗██║      ██║  ██║╚██╗ ██╔╝██╔══██╗██╔══██╗██║██╔══██╗
echo     ██║   ██████╔╝██║█████╗███████║ ╚████╔╝ ██████╔╝██████╔╝██║██║  ██║
echo     ██║   ██╔══██╗██║╚════╝██╔══██║  ╚██╔╝  ██╔══██╗██╔══██╗██║██║  ██║
echo     ██║   ██║  ██║██║      ██║  ██║   ██║   ██████╔╝██║  ██║██║██████╔╝
echo     ╚═╝   ╚═╝  ╚═╝╚═╝      ╚═╝  ╚═╝   ╚═╝   ╚═════╝ ╚═╝  ╚═╝╚═╝╚═════╝
echo.
echo              Tri-Hybrid AI Engine  ^|  HyperVibe Integration
echo  ═══════════════════════════════════════════════════════════════════════════
echo.

:: ─── Menu ─────────────────────────────────────────────────────────────────────
echo  [1]  Install Tri-Hybrid Engine
echo  [2]  Run Engine (Interactive Mode)
echo  [3]  Run Engine (Demo Mode)
echo  [4]  Run Engine (Health Check)
echo  [5]  Configure API Keys
echo  [6]  Install Ollama + Pull LLaMA Model
echo  [0]  Exit
echo.
set /p CHOICE="  Select option: "

if "%CHOICE%"=="1" goto :INSTALL
if "%CHOICE%"=="2" goto :RUN_REPL
if "%CHOICE%"=="3" goto :RUN_DEMO
if "%CHOICE%"=="4" goto :RUN_HEALTH
if "%CHOICE%"=="5" goto :CONFIGURE_KEYS
if "%CHOICE%"=="6" goto :INSTALL_OLLAMA
if "%CHOICE%"=="0" goto :EOF

echo  [!] Invalid option.
pause
goto :EOF


:: ════════════════════════════════════════════════════════════════════════════
:INSTALL
:: ════════════════════════════════════════════════════════════════════════════
echo.
echo  ── INSTALLATION ────────────────────────────────────────────────────────
echo.

:: Check Python
echo  [*] Checking Python version...
python --version >nul 2>&1
if errorlevel 1 (
    echo  [!] Python not found. Please install Python 3.11+ from https://python.org
    pause
    goto :EOF
)
for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PY_VER=%%v
echo  [+] Python %PY_VER% found.

:: Check Python 3.11+
python -c "import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)" >nul 2>&1
if errorlevel 1 (
    echo  [!] Python 3.11+ required. Current version: %PY_VER%
    pause
    goto :EOF
)

:: Check pip
echo  [*] Checking pip...
python -m pip --version >nul 2>&1
if errorlevel 1 (
    echo  [!] pip not found. Installing...
    python -m ensurepip --upgrade
)
echo  [+] pip ready.

:: Upgrade pip
echo  [*] Upgrading pip...
python -m pip install --upgrade pip --quiet

:: Install dependencies
echo  [*] Installing Python dependencies...
if not exist "requirements.txt" (
    echo  [!] requirements.txt not found. Ensure you are in the engine directory.
    pause
    goto :EOF
)
python -m pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo  [!] Dependency installation failed. Check your internet connection.
    pause
    goto :EOF
)
echo  [+] Dependencies installed.

:: Create directories
echo  [*] Creating directories...
if not exist "logs" mkdir logs
if not exist "data" mkdir data
echo  [+] Directories created.

:: Copy env template if .env does not exist
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo  [+] .env created from template. Edit it with your API keys!
    ) else (
        echo  [!] .env.example not found. Create .env manually.
    )
) else (
    echo  [+] .env already exists.
)

echo.
echo  ══════════════════════════════════════════════════════════════════════
echo  [+] INSTALLATION COMPLETE
echo      Next step: Edit .env with your API keys, then select option [2]
echo  ══════════════════════════════════════════════════════════════════════
echo.
pause
goto :EOF


:: ════════════════════════════════════════════════════════════════════════════
:RUN_REPL
:: ════════════════════════════════════════════════════════════════════════════
echo.
echo  [*] Starting Tri-Hybrid Engine (Interactive Mode)...
echo.
call :CHECK_ENV
python main.py
pause
goto :EOF


:: ════════════════════════════════════════════════════════════════════════════
:RUN_DEMO
:: ════════════════════════════════════════════════════════════════════════════
echo.
echo  [*] Running Demo Mode...
echo.
call :CHECK_ENV
python main.py --demo
pause
goto :EOF


:: ════════════════════════════════════════════════════════════════════════════
:RUN_HEALTH
:: ════════════════════════════════════════════════════════════════════════════
echo.
echo  [*] Running Health Check...
echo.
call :CHECK_ENV
python main.py --health
pause
goto :EOF


:: ════════════════════════════════════════════════════════════════════════════
:CONFIGURE_KEYS
:: ════════════════════════════════════════════════════════════════════════════
echo.
echo  ── API KEY CONFIGURATION ────────────────────────────────────────────────
echo.

if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
    ) else (
        echo ANTHROPIC_API_KEY=> .env
        echo OPENAI_API_KEY=>> .env
        echo LLAMA_MODEL=llama3.2>> .env
        echo OPENAI_MODEL=gpt-4o-mini>> .env
        echo CLAUDE_MODEL=claude-haiku-4-5-20251001>> .env
        echo OLLAMA_BASE_URL=http://localhost:11434>> .env
        echo LLAMA_THRESHOLD=0.30>> .env
        echo OPENAI_THRESHOLD=0.60>> .env
        echo CONFIDENCE_THRESHOLD=0.55>> .env
        echo MAX_ESCALATIONS=2>> .env
        echo MAX_INPUT_TOKENS=3000>> .env
        echo MAX_OUTPUT_TOKENS=1024>> .env
        echo CONCURRENT_REQUESTS=10>> .env
    )
)

echo  Enter your API keys below (leave blank to skip):
echo.
set /p ANT_KEY="  Anthropic API Key (sk-ant-...): "
set /p OAI_KEY="  OpenAI API Key    (sk-...):      "

:: Write keys to .env using PowerShell for reliability
if not "%ANT_KEY%"=="" (
    powershell -Command "(Get-Content .env) -replace 'ANTHROPIC_API_KEY=.*', 'ANTHROPIC_API_KEY=%ANT_KEY%' | Set-Content .env"
    echo  [+] Anthropic key saved.
)
if not "%OAI_KEY%"=="" (
    powershell -Command "(Get-Content .env) -replace 'OPENAI_API_KEY=.*', 'OPENAI_API_KEY=%OAI_KEY%' | Set-Content .env"
    echo  [+] OpenAI key saved.
)

echo.
echo  [+] Configuration saved to .env
echo      Run option [4] to verify connectivity.
echo.
pause
goto :EOF


:: ════════════════════════════════════════════════════════════════════════════
:INSTALL_OLLAMA
:: ════════════════════════════════════════════════════════════════════════════
echo.
echo  ── OLLAMA INSTALLATION ──────────────────────────────────────────────────
echo.
echo  [*] Checking if Ollama is installed...
ollama --version >nul 2>&1
if errorlevel 1 (
    echo  [*] Ollama not found. Downloading installer...
    powershell -Command "Invoke-WebRequest -Uri 'https://ollama.ai/download/OllamaSetup.exe' -OutFile '%TEMP%\OllamaSetup.exe'"
    echo  [*] Launching Ollama installer...
    start "" "%TEMP%\OllamaSetup.exe"
    echo  [!] Please complete the Ollama installation, then re-run this script.
    pause
    goto :EOF
) else (
    echo  [+] Ollama already installed.
)

echo.
echo  Available LLaMA models to pull:
echo  [1] llama3.2       (2GB)  - Recommended
echo  [2] llama3.1       (4GB)  - Larger, smarter
echo  [3] mistral        (4GB)  - Alternative
echo  [4] phi3           (2GB)  - Microsoft, fast
echo  [5] Custom model name
echo.
set /p MODEL_CHOICE="  Select model: "

if "%MODEL_CHOICE%"=="1" set PULL_MODEL=llama3.2
if "%MODEL_CHOICE%"=="2" set PULL_MODEL=llama3.1
if "%MODEL_CHOICE%"=="3" set PULL_MODEL=mistral
if "%MODEL_CHOICE%"=="4" set PULL_MODEL=phi3
if "%MODEL_CHOICE%"=="5" (
    set /p PULL_MODEL="  Enter model name: "
)

if "%PULL_MODEL%"=="" (
    echo  [!] No model selected.
    pause
    goto :EOF
)

echo.
echo  [*] Pulling %PULL_MODEL% (this may take several minutes)...
ollama pull %PULL_MODEL%
if errorlevel 1 (
    echo  [!] Pull failed. Check your internet connection.
) else (
    echo  [+] %PULL_MODEL% ready.
    :: Update .env with selected model
    if exist ".env" (
        powershell -Command "(Get-Content .env) -replace 'LLAMA_MODEL=.*', 'LLAMA_MODEL=%PULL_MODEL%' | Set-Content .env"
        echo  [+] .env updated with LLAMA_MODEL=%PULL_MODEL%
    )
)
pause
goto :EOF


:: ════════════════════════════════════════════════════════════════════════════
:CHECK_ENV
:: ════════════════════════════════════════════════════════════════════════════
if not exist ".env" (
    echo  [!] .env not found. Run option [5] to configure API keys first.
    pause
    goto :EOF
)
if not exist "main.py" (
    echo  [!] main.py not found. Ensure you are in the engine root directory.
    echo  [!] Current directory: %CD%
    pause
    goto :EOF
)
goto :EOF

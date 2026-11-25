@echo off
rem Inicia o painel administrativo do Versao Brasileira em http://127.0.0.1:8765
setlocal
cd /d "%~dp0TranslationStore-Admin"

set "PY="
where py >nul 2>&1 && set "PY=py -3"
if not defined PY (
    where python >nul 2>&1 && set "PY=python"
)
if not defined PY (
    echo Python nao encontrado. Instale o Python 3 em https://www.python.org/downloads/
    echo e marque "Add python.exe to PATH" durante a instalacao.
    pause
    exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
    echo Preparando o ambiente do painel ^(so na primeira vez^)...
    %PY% -m venv .venv
    if errorlevel 1 (
        echo Nao foi possivel criar o ambiente Python.
        pause
        exit /b 1
    )
)

".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q -r requirements.txt
if errorlevel 1 (
    echo Nao foi possivel instalar as bibliotecas do painel. Verifique a internet.
    pause
    exit /b 1
)

echo.
echo Painel em http://127.0.0.1:8765  -  feche esta janela para encerrar.
echo.
set "ABRIR_NAVEGADOR=http://127.0.0.1:8765"
".venv\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port 8765
pause

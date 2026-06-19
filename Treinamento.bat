@echo off
REM Duplo-clique para abrir o Tree Tower em MODO TREINO (local, seguro, nao toca o banco real).
REM Requer Node.js instalado. Abra http://localhost:3200 no navegador apos iniciar.
cd /d "%~dp0"
echo Iniciando o ambiente de TREINO do Tree Tower...
echo Apos aparecer "Ready", abra: http://localhost:3200
echo.
powershell -ExecutionPolicy Bypass -File "scripts\treino.ps1"
pause

@echo off
REM Configuracao UNICA: libera a porta 3200 no firewall do Windows para que
REM outros PCs/celulares acessem o modo treino pela rede.
REM Da duplo-clique uma vez e clique SIM na permissao de administrador.
cd /d "%~dp0"
echo Vai pedir permissao de administrador para liberar o acesso pela rede...
powershell -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-ExecutionPolicy Bypass -File \"%~dp0scripts\liberar-firewall.ps1\"'"

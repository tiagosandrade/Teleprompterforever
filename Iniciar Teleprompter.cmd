@echo off
rem Atalho de duplo clique: sobe o servidor local do teleprompter (server.mjs).
chcp 65001 >nul
title Teleprompter
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 goto sem_node

node server.mjs
echo.
echo   Pode fechar esta janela.
pause
exit /b 0

:sem_node
echo.
echo   O Node.js não foi encontrado neste computador.
echo   Baixe e instale a versão LTS em https://nodejs.org
echo   e depois abra este arquivo de novo.
echo.
pause
exit /b 1

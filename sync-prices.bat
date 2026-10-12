@echo off
title ForgePC - Sync Prices
echo Syncing ForgePC prices (best-effort, keeps existing cache on failure)...
node "%~dp0js\update-prices.mjs"
echo.
echo Tip: pass --import path\to\prices-today.json to apply manually-verified prices.
pause
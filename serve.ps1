# Serves the PC Builder locally and opens it in your default browser.
# Requires Node.js. Usage:  .\serve.ps1  (or  .\serve.ps1 8080 )

param([int]$Port = 5173)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js is required but was not found on PATH." -ForegroundColor Red
    exit 1
}

Write-Host "Starting ForgePC on port $Port ..." -ForegroundColor Cyan
Start-Job -ScriptBlock {
    param($p)
    Start-Sleep -Milliseconds 900
    Start-Process "http://localhost:$p"
} -ArgumentList $Port | Out-Null

node server.mjs $Port

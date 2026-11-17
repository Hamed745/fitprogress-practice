# Запускайте из корня проекта: .\START-WINDOWS.ps1
$ErrorActionPreference = 'Stop'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Write-Host 'Docker Desktop is not installed.'; exit 1 }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { Write-Host 'Node.js/npm is not installed.'; exit 1 }
Set-Location $PSScriptRoot
Write-Host 'Starting local PostgreSQL...'
docker compose up -d
if (-not (Test-Path './backend/.env')) { Copy-Item './backend/.env.example' './backend/.env' }
Write-Host 'Installing dependencies...'
Push-Location ./backend
npm.cmd install
Pop-Location
Push-Location ./frontend
npm.cmd install
Pop-Location
Write-Host 'Starting API in a new window...'
Start-Process powershell.exe -ArgumentList '-NoExit','-Command',("Set-Location '" + "$PSScriptRoot\backend'" + '; npm.cmd run dev')
Write-Host 'Starting frontend in a new window...'
Start-Process powershell.exe -ArgumentList '-NoExit','-Command',("Set-Location '" + "$PSScriptRoot\frontend'" + '; npm.cmd run dev')
Write-Host 'Open http://localhost:5173 (after backend has initialized).'

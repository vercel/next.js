@echo off
setlocal

set "DIR=%~dp0"

:: Try native binary from @next/cli-* package
if exist "%DIR%..\node_modules\@next\cli-win32-x64-msvc\next.exe" (
  "%DIR%..\node_modules\@next\cli-win32-x64-msvc\next.exe" %*
  exit /b %errorlevel%
)
if exist "%DIR%..\node_modules\@next\cli-win32-arm64-msvc\next.exe" (
  "%DIR%..\node_modules\@next\cli-win32-arm64-msvc\next.exe" %*
  exit /b %errorlevel%
)

:: Try local native binary (for development)
if exist "%DIR%next-native.exe" (
  "%DIR%next-native.exe" %*
  exit /b %errorlevel%
)

:: Fall back to Node.js entry point
node "%DIR%..\dist\bin\next" %*

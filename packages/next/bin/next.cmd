@echo off
:: Next.js CLI entry point
::
:: Tries to use the native Rust binary for faster restarts, falls back to Node.js.
:: The Rust binary is distributed via @next/cli-* platform-specific packages.

setlocal

set "DIR=%~dp0"

:: Production: try native binary from @next/cli-* package (hoisted to node_modules/@next/cli-*)
if exist "%DIR%..\..\@next\cli-win32-x64-msvc\next.exe" (
  "%DIR%..\..\@next\cli-win32-x64-msvc\next.exe" %*
  exit /b %errorlevel%
)
if exist "%DIR%..\..\@next\cli-win32-arm64-msvc\next.exe" (
  "%DIR%..\..\@next\cli-win32-arm64-msvc\next.exe" %*
  exit /b %errorlevel%
)

:: Fallback: Node.js (also used for in-repo development)
node "%DIR%..\dist\bin\next" %*

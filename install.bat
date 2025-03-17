@echo off
setlocal enabledelayedexpansion

echo =======================================
echo  Notion MCP Server Installation
echo =======================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed.
    echo Please install Node.js ^(v16 or higher^) from https://nodejs.org/
    exit /b 1
)

:: Check Node.js version
for /f "tokens=1,2,3 delims=." %%a in ('node -v') do (
    set NODE_VERSION=%%a.%%b.%%c
    set NODE_MAJOR=%%a
)
set NODE_MAJOR=!NODE_MAJOR:~1!

if !NODE_MAJOR! LSS 16 (
    echo ERROR: Node.js version must be 16 or higher. Found: v!NODE_VERSION!
    echo Please upgrade your Node.js installation.
    exit /b 1
)

:: Check if npm is installed
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm is not installed.
    echo Please install npm.
    exit /b 1
)

echo [✓] Node.js v!NODE_VERSION! detected

:: Install dependencies
echo.
echo Installing dependencies...
call npm install

if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to install dependencies.
    exit /b 1
)

:: Build the project
echo.
echo Building the project...
call npm run build

if %ERRORLEVEL% neq 0 (
    echo ERROR: Build failed.
    exit /b 1
)

:: Check for .env file
if not exist .env (
    echo.
    echo Creating .env file...
    copy .env.example .env >nul
    echo Please edit the .env file to add your Notion API key.
) else (
    echo.
    echo [✓] .env file already exists
)

:: Configure Claude for Desktop
echo.
echo Claude for Desktop Configuration
echo To use this server with Claude for Desktop, add the following to your Claude config:
echo.

:: Get the absolute path to the build file
set "SCRIPT_DIR=%~dp0"
set "BUILD_PATH=%SCRIPT_DIR%build\index.js"
set "BUILD_PATH=%BUILD_PATH:\=\\%"

echo {
echo   "mcpServers": {
echo     "notion": {
echo       "command": "node",
echo       "args": ["%BUILD_PATH%"],
echo       "env": {
echo         "NOTION_API_KEY": "your_notion_api_key_here"
echo       }
echo     }
echo   }
echo }
echo.

:: Configuration file path
echo Config file path: %%APPDATA%%\Claude\claude_desktop_config.json

:: Installation complete
echo.
echo =======================================
echo  Installation Complete!
echo =======================================
echo.
echo To start the server:
echo   npm start
echo.
echo For development mode:
echo   npm run dev
echo.
echo Remember to add your Notion API key to the .env file.

endlocal
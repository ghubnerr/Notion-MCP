@echo off
setlocal

echo =======================================
echo  Notion MCP Server
echo =======================================
echo.

:: Check if .env file exists
if not exist .env (
    echo Warning: .env file not found. Creating a template...
    (
        echo # Required
        echo NOTION_API_KEY=your_notion_api_key_here
        echo.
        echo # Optional settings
        echo DEBUG=false
        echo REQUIRE_CONFIRMATION_FOR_CREATE=true
        echo REQUIRE_CONFIRMATION_FOR_UPDATE=true
        echo REQUIRE_CONFIRMATION_FOR_DELETE=true
        echo UPDATE_POLLING_INTERVAL=60000
        echo MAX_BLOCK_DEPTH=3
        echo BACKUP_DIR=./backups
        echo BACKUP_RETENTION_DAYS=30
        echo MAX_BACKUPS_PER_PAGE=5
    ) > .env
    echo Please edit the .env file to add your Notion API key.
    exit /b 1
)

:: Check if the NOTION_API_KEY is set in .env
findstr /C:"NOTION_API_KEY=your_notion_api_key_here" .env > nul
if %ERRORLEVEL% EQU 0 (
    echo Warning: Notion API key not set in .env file.
    echo Please edit the .env file to add your Notion API key.
    exit /b 1
)

:: Check if we need to build first
if not exist "build\index.js" (
    echo Build directory not found or incomplete. Building...
    call npm run build
    
    if %ERRORLEVEL% NEQ 0 (
        echo Build failed. Please check for errors.
        exit /b 1
    )
)

:: Start the server
echo Starting Notion MCP Server...
echo Press Ctrl+C to stop the server
echo.

node build\index.js

endlocal
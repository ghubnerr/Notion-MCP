#!/bin/bash

# Notion MCP Server startup script

# Terminal colors
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Notion MCP Server                     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Warning: .env file not found. Creating a template...${NC}"
    cat > .env << EOF
# Required
NOTION_API_KEY=your_notion_api_key_here

# Optional settings
DEBUG=false
REQUIRE_CONFIRMATION_FOR_CREATE=true
REQUIRE_CONFIRMATION_FOR_UPDATE=true
REQUIRE_CONFIRMATION_FOR_DELETE=true
UPDATE_POLLING_INTERVAL=60000
MAX_BLOCK_DEPTH=3
BACKUP_DIR=./backups
BACKUP_RETENTION_DAYS=30
MAX_BACKUPS_PER_PAGE=5
EOF
    echo -e "${YELLOW}Please edit the .env file to add your Notion API key.${NC}"
    exit 1
fi

# Check if the NOTION_API_KEY is set in .env
if grep -q "NOTION_API_KEY=your_notion_api_key_here" .env; then
    echo -e "${YELLOW}Warning: Notion API key not set in .env file.${NC}"
    echo -e "${YELLOW}Please edit the .env file to add your Notion API key.${NC}"
    exit 1
fi

# Check if we need to build first
if [ ! -d "build" ] || [ ! -f "build/index.js" ]; then
    echo -e "${YELLOW}Build directory not found or incomplete. Building...${NC}"
    npm run build
    
    if [ $? -ne 0 ]; then
        echo -e "${YELLOW}Build failed. Please check for errors.${NC}"
        exit 1
    fi
fi

# Start the server
echo -e "${GREEN}Starting Notion MCP Server...${NC}"
echo -e "${BLUE}Press Ctrl+C to stop the server${NC}"
echo ""

node build/index.js
#!/bin/bash

# Notion MCP Server Installation Script

# Terminal colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Notion MCP Server Installation        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed.${NC}"
    echo -e "${YELLOW}Please install Node.js (v16 or higher) from https://nodejs.org/${NC}"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d 'v' -f 2)
NODE_MAJOR_VERSION=$(echo $NODE_VERSION | cut -d '.' -f 1)

if [ $NODE_MAJOR_VERSION -lt 16 ]; then
    echo -e "${RED}Node.js version must be 16 or higher. Found: v${NODE_VERSION}${NC}"
    echo -e "${YELLOW}Please upgrade your Node.js installation.${NC}"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm is not installed.${NC}"
    echo -e "${YELLOW}Please install npm.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js v${NODE_VERSION} detected${NC}"

# Install dependencies
echo -e "\n${BLUE}Installing dependencies...${NC}"
npm install

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to install dependencies.${NC}"
    exit 1
fi

# Build the project
echo -e "\n${BLUE}Building the project...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}Build failed.${NC}"
    exit 1
fi

# Check for .env file
if [ ! -f .env ]; then
    echo -e "\n${YELLOW}Creating .env file...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}Please edit the .env file to add your Notion API key.${NC}"
else
    echo -e "\n${GREEN}✓ .env file already exists${NC}"
fi

# Configure Claude for Desktop
echo -e "\n${BLUE}Claude for Desktop Configuration${NC}"
echo -e "${YELLOW}To use this server with Claude for Desktop, add the following to your Claude config:${NC}"

# Get the absolute path to the build file
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BUILD_PATH="$SCRIPT_DIR/build/index.js"

echo -e "${GREEN}"
echo '{
  "mcpServers": {
    "notion": {
      "command": "node",
      "args": ["'$BUILD_PATH'"],
      "env": {
        "NOTION_API_KEY": "your_notion_api_key_here"
      }
    }
  }
}'
echo -e "${NC}"

# Configuration file path based on OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    CONFIG_PATH="~/Library/Application Support/Claude/claude_desktop_config.json"
elif [[ "$OSTYPE" == "msys"* || "$OSTYPE" == "win32" ]]; then
    CONFIG_PATH="%APPDATA%\\Claude\\claude_desktop_config.json"
else
    CONFIG_PATH="(platform not detected)"
fi

echo -e "${YELLOW}Config file path: ${CONFIG_PATH}${NC}"

# Installation complete
echo -e "\n${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Installation Complete!                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo -e "\n${BLUE}To start the server:${NC}"
echo -e "  npm start"
echo -e "\n${BLUE}For development mode:${NC}"
echo -e "  npm run dev"
echo -e "\n${YELLOW}Remember to add your Notion API key to the .env file.${NC}"
# Notion MCP Server - Directory Structure

```
notion-mcp-server/
├── .env                              # Environment variables (with your Notion API key)
├── .env.example                      # Example environment variable file
├── .gitignore                        # Git ignore configuration
├── claude_desktop_config.example.json # Example Claude Desktop configuration
├── install.bat                       # Windows installation script
├── install.sh                        # Unix installation script
├── LICENSE                           # MIT License file
├── package.json                      # Project metadata and dependencies
├── README.md                         # Project documentation
├── tsconfig.json                     # TypeScript configuration
├── build/                            # Compiled JavaScript (generated after build)
│   ├── index.js                      # Main server file (compiled)
│   └── notion-api.js                 # Notion API integration (compiled)
└── src/                              # Source code
    ├── index.ts                      # Main server entry point
    └── notion-api.ts                 # Notion API integration

# Generated directories (not in version control)
node_modules/                         # Node.js dependencies
```

## Key Files

- **src/index.ts**: Main entry point for the MCP server
- **src/notion-api.ts**: Handles all interactions with the Notion API
- **.env**: Configuration file for your Notion API key
- **install.sh/install.bat**: Installation and setup scripts

## Build Output

After running `npm run build`, the TypeScript files will be compiled to JavaScript and placed in the `build/` directory.

## Getting Started

1. Clone the repository
2. Run the installation script (`install.sh` or `install.bat`)
3. Add your Notion API key to the `.env` file
4. Configure Claude for Desktop to use the server
5. Start the server with `npm start`

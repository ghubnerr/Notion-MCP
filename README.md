# Notion MCP Server

A Model Context Protocol (MCP) server for integrating with Notion workspaces. This server provides a standardized interface for AI models to access, query, and modify content in Notion.

## Prerequisites

- Node.js (v16 or higher)
- Notion API Key (from your [Notion integrations](https://www.notion.so/my-integrations))
- Connected Notion workspace with appropriate permissions

## Installation

1. Clone this repository:

   ```
   git clone https://github.com/yourusername/notion-mcp-server.git
   cd notion-mcp-server
   ```

2. Install dependencies:

   ```
   npm install
   ```

3. Create a `.env` file in the root directory with your Notion API key:

   ```
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
   ```

4. Build the project:

   ```
   npm run build
   ```

5. Start the server:
   ```
   npm start
   ```

## Using with Claude for Desktop

To use this Notion MCP server with Claude for Desktop:

1. Ensure Claude for Desktop is installed and updated to the latest version
2. Open Claude for Desktop's configuration file:

   - On macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - On Windows: `%APPDATA%\Claude\claude_desktop_config.json`

3. Add the server configuration:

   ```json
   {
     "mcpServers": {
       "notion": {
         "command": "node",
         "args": ["/path/to/notion-mcp-server/build/index.js"],
         "env": {
           "NOTION_API_KEY": "your_notion_api_key_here"
         }
       }
     }
   }
   ```

4. Save the file and restart Claude for Desktop

## Resources

The server exposes the following resources:

| Resource URI                              | Description                                           |
| ----------------------------------------- | ----------------------------------------------------- |
| `notion://databases`                      | Lists all databases in the workspace                  |
| `notion://databases/{databaseId}/schema`  | Retrieves the schema of a specific database           |
| `notion://databases/{databaseId}/content` | Retrieves all pages/items from a specific database    |
| `notion://pages/{pageId}`                 | Retrieves the content of a specific page              |
| `notion://updates`                        | Retrieves recent updates and changes in the workspace |

# Tools

The server provides the following tools:

## Prompts

The server includes these pre-configured prompts:

| Prompt Name          | Description                       |
| -------------------- | --------------------------------- |
| `upcoming-deadlines` | Get a list of upcoming deadlines  |
| `project-status`     | Summarize the status of a project |
| `daily-tasks`        | Get a list of tasks for today     |

## Example Queries

Once connected to Claude, you can ask natural language questions about your Notion workspace:

1. "What tasks are due today in my workspace?"
2. "Show me the status of Project X"
3. "Create a new page in my 'Ideas' database with title 'New Feature Concept'"
4. "Update the status of task Y to 'Completed'"
5. "What changes were made to my workspace in the last 24 hours?"
6. "Summarize the upcoming deadlines for the next week"
7. "Show me all backups for page abc123"
8. "Restore page abc123 from the backup file page_abc123_2023-01-01.json"

### Extending the Server

To add new functionality:

1. **Add Resources**: Extend the resource handlers in `index.ts`
2. **Add Tools**: Create new tool definitions in `index.ts`
3. **Add Prompts**: Define new prompt templates in `index.ts`
4. **Enhance API Integration**: Add new API functions in `notion-api.ts`

### Logs

Check server logs for detailed error information:

- **Claude for Desktop Logs**: Look in the Claude logs directory for MCP-related logs
- **Server Output**: Check standard output and error streams for server logs


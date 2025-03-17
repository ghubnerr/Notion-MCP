import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Client, LogLevel } from "@notionhq/client";
import dotenv from "dotenv";
import {
  fetchDatabases,
  fetchPages,
  fetchPageContent,
  createPage,
  updatePage,
  deletePage,
  searchNotion,
  fetchRecentUpdates,
} from "./notion-api.js";
import {
  backupPage,
  listPageBackups,
  restoreFromBackup,
  createBackupDatabase,
  recordBackupInNotion,
  cleanupOldBackups,
} from "./backup-utils.js";

// Load environment variables
dotenv.config();

// Configuration settings
const CONFIG = {
  NOTION_API_KEY: process.env.NOTION_API_KEY,
  DEBUG: process.env.DEBUG === "true",
  REQUIRE_CONFIRMATION_FOR_CREATE:
    process.env.REQUIRE_CONFIRMATION_FOR_CREATE !== "false",
  REQUIRE_CONFIRMATION_FOR_UPDATE:
    process.env.REQUIRE_CONFIRMATION_FOR_UPDATE !== "false",
  REQUIRE_CONFIRMATION_FOR_DELETE:
    process.env.REQUIRE_CONFIRMATION_FOR_DELETE !== "false",
  UPDATE_POLLING_INTERVAL: parseInt(
    process.env.UPDATE_POLLING_INTERVAL || "60000",
    10
  ),
  MAX_BLOCK_DEPTH: parseInt(process.env.MAX_BLOCK_DEPTH || "3", 10),
  BACKUP_DIR: process.env.BACKUP_DIR || "./backups",
  BACKUP_RETENTION_DAYS: parseInt(
    process.env.BACKUP_RETENTION_DAYS || "30",
    10
  ),
  MAX_BACKUPS_PER_PAGE: parseInt(process.env.MAX_BACKUPS_PER_PAGE || "5", 10),
};

// Check for required environment variables
if (!CONFIG.NOTION_API_KEY) {
  console.error("Error: NOTION_API_KEY is required");
  process.exit(1);
}

// Setup debug logging (writes to stderr so it won't interfere with JSON responses)
const debug = (message: string, ...args: any[]) => {
  if (CONFIG.DEBUG) {
    console.error(`[DEBUG] ${message}`, ...args);
  }
};

debug("Configuration loaded:", CONFIG);

// Initialize Notion client
const notion = new Client({
  auth: CONFIG.NOTION_API_KEY as string,
  logLevel: CONFIG.DEBUG ? LogLevel.DEBUG : LogLevel.WARN,
});

// Create MCP server instance
const server = new McpServer({
  name: "notion-mcp-server",
  version: "1.0.0",
});

// ========== RESOURCES ==========

// Resource: List databases in the workspace
server.resource("Notion Databases", "notion://databases", async () => {
  try {
    const databases = await fetchDatabases(notion);
    const jsonContent = JSON.stringify(databases, null, 2);
    return {
      contents: [
        {
          uri: "notion://databases",
          text: jsonContent,
          mimeType: "application/json",
        },
      ],
    };
  } catch (error) {
    console.error("Error fetching databases:", error);
    throw new Error(
      `Failed to fetch databases: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
});

// Resource: Database Schema
server.resource(
  "Database Schema",
  "notion://databases/{databaseId}/schema",
  async (uri) => {
    try {
      const url = new URL(uri.toString());
      const matches = url.pathname.match(/\/databases\/([^\/]+)\/schema/);
      if (!matches || !matches[1]) {
        throw new Error("Invalid database ID in resource URI");
      }
      const databaseId = matches[1];
      const response = await notion.databases.retrieve({
        database_id: databaseId,
      });
      const jsonContent = JSON.stringify(response.properties, null, 2);
      return {
        contents: [
          {
            uri: uri.toString(),
            text: jsonContent,
            mimeType: "application/json",
          },
        ],
      };
    } catch (error) {
      console.error(`Error fetching database schema:`, error);
      throw new Error(
        `Failed to fetch database schema: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
);

// Resource: Database Content
server.resource(
  "Database Content",
  "notion://databases/{databaseId}/content",
  async (uri) => {
    try {
      const url = new URL(uri.toString());
      const matches = url.pathname.match(/\/databases\/([^\/]+)\/content/);
      if (!matches || !matches[1]) {
        throw new Error("Invalid database ID in resource URI");
      }
      const databaseId = matches[1];
      const pages = await fetchPages(notion, databaseId);
      const jsonContent = JSON.stringify(pages, null, 2);
      return {
        contents: [
          {
            uri: uri.toString(),
            text: jsonContent,
            mimeType: "application/json",
          },
        ],
      };
    } catch (error) {
      console.error(`Error fetching database content:`, error);
      throw new Error(
        `Failed to fetch database content: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
);

// Resource: Page Content
server.resource("Page Content", "notion://pages/{pageId}", async (uri) => {
  try {
    const url = new URL(uri.toString());
    const matches = url.pathname.match(/\/pages\/([^\/]+)/);
    if (!matches || !matches[1]) {
      throw new Error("Invalid page ID in resource URI");
    }
    const pageId = matches[1];
    const content = await fetchPageContent(notion, pageId);
    const jsonContent = JSON.stringify(content, null, 2);
    return {
      contents: [
        {
          uri: uri.toString(),
          text: jsonContent,
          mimeType: "application/json",
        },
      ],
    };
  } catch (error) {
    console.error(`Error fetching page content:`, error);
    throw new Error(
      `Failed to fetch page content: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
});

// Resource: Recent Updates
server.resource("Recent Updates", "notion://updates", async (uri) => {
  try {
    const updates = await fetchRecentUpdates(notion);
    const jsonContent = JSON.stringify(updates, null, 2);
    return {
      contents: [
        {
          uri: uri.toString(),
          text: jsonContent,
          mimeType: "application/json",
        },
      ],
    };
  } catch (error) {
    console.error("Error fetching recent updates:", error);
    throw new Error(
      `Failed to fetch recent updates: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
});

server.resource("Help", "notion://help", async (uri) => {
  try {
    const helpContent = `
# Help Documentation

This documentation provides detailed information about the available Notion API endpoints, tools, and prompts provided by this MCP server. Use this guide to understand commands, their parameters, and expected outputs.

---

## Endpoints

### 1. List Databases
**URI:** \`notion://databases\`  
**Description:** Lists all databases in the workspace.  
**Example Usage:**  
\`\`\`
GET notion://databases
\`\`\`
**Response:** A JSON array of databases with their IDs, titles, URLs, creation time, and last edited time.

---

### 2. Retrieve Database Schema
**URI:** \`notion://databases/{databaseId}/schema\`  
**Description:** Retrieves the schema of a specific database.  
**Example Usage:**  
\`\`\`
GET notion://databases/abc123/schema
\`\`\`
**Response:** A JSON object containing property definitions for the database (e.g., field names and types).

---

### 3. Retrieve Database Content
**URI:** \`notion://databases/{databaseId}/content\`  
**Description:** Retrieves the content (pages) of a specific database.  
**Example Usage:**  
\`\`\`
GET notion://databases/abc123/content
\`\`\`
**Response:** A JSON object containing pages with their IDs, titles, URLs, creation time, last edited time, and properties.

---

### 4. Retrieve Page Content
**URI:** \`notion://pages/{pageId}\`  
**Description:** Retrieves the content of a specific page.  
**Example Usage:**  
\`\`\`
GET notion://pages/xyz456
\`\`\`
**Response:** A JSON object containing page properties and blocks (nested content).

---

### 5. Recent Updates
**URI:** \`notion://updates\`  
**Description:** Retrieves recent updates in the workspace.  
**Example Usage:**  
\`\`\`
GET notion://updates
\`\`\`
**Response:** A JSON array of recently updated items (pages or databases) with their IDs, titles, URLs, and last edited times.

---

## Tools

### 1. Search Notion
**Name:** \`search-notion\`  
**Description:** Search for content in Notion using a query string and optional filters.  
**Parameters:**
- \`query (string)\`: The search query.
- \`filter (object)\`: Optional filters (e.g., object type: "page" or "database").  

**Example Usage:**
\`\`\`
POST search-notion
{
  "query": "Project",
  "filter": { "object": "page" }
}
\`\`\`

---

### 2. Create Page
**Name:** \`create-page\`  
**Description:** Create a new page in Notion under a specified parent (database or page).  
**Parameters:**
- \`parent (object)\`: Parent container for the new page (\`databaseId\` or \`pageId\`).  
- \`properties (object)\`: Page properties according to database schema.  
- \`content (array)\`: Optional content blocks for the page.

---

### 3. Update Page
**Name:** \`update-page\`  
**Description:** Update an existing page's properties or content blocks in Notion.  
**Parameters:**
- \`pageId (string)\`: ID of the page to update.
- \`properties (object)\`: Page properties to update.
- \`content (array)\`: New page content blocks.
- \`skipBackup (boolean)\`: Skip creating a backup before updating.

---

### 4. Delete Page
**Name:** \`delete-page\`  
**Description:** Archive a page in Notion (mark it as deleted).  
**Parameters:**
- \`pageId (string)\`: ID of the page to delete.
- \`skipBackup (boolean)\`: Skip creating a backup before deletion.

---

### 5. Manage Backups
**Name:** \`manage-backups\`  
**Description:** Perform actions on backups for pages in Notion.  
**Parameters:**
- \`action (string)\`: Action to perform (\`list\`, \`restore\`, or \`cleanup\`).  
- \`pageId (string)\`: ID of the page for backup operations.
- Additional parameters depend on the action.

---

### 6. Generate Context Summary
**Name:** \`generate-context-summary\`  
**Description:** Generate a summary of recent updates in the workspace context.  
**Parameters:**
- \`maxItems (number)\`: Maximum number of items to include in the summary.

---

## Prompts

### 1. Upcoming Deadlines
**Name:** \`upcoming-deadlines\`  
**Description:** Get a list of upcoming deadlines from tasks in Notion databases within a specified time frame.  

---

### 2. Project Status
**Name:** \`project-status\`  
**Description:** Summarize the status of a project including completion percentage, milestones achieved, upcoming deadlines, blockers, and team members involved.

---

### 3. Daily Tasks
**Name:** \`daily-tasks\`  
**Description:** Get a list of tasks due today with priority levels and dependencies.

---

## Notes

For more details on Notion API capabilities, refer to [Notion API Documentation](https://developers.notion.com/docs). This MCP server integrates directly with Notion's API to provide seamless functionality.
    `;

    return {
      contents: [
        {
          uri: uri.toString(),
          text: helpContent,
          mimeType: "text/plain",
        },
      ],
    };
  } catch (error) {
    console.error("Error providing help context:", error);
    throw new Error("Failed to provide help context.");
  }
});

// ========== TOOLS ==========

// Tool: Search Notion
server.tool(
  "search-notion",
  "Search for content in Notion",
  {
    query: z.string().describe("The search query"),
    filter: z
      .object({
        object: z
          .enum(["page", "database"])
          .optional()
          .describe("Type of object to search for"),
        property: z.string().optional().describe("Property to filter by"),
        value: z.string().optional().describe("Value to filter by"),
      })
      .optional()
      .describe("Optional filters for the search"),
  },
  async ({ query, filter }) => {
    try {
      const results = await searchNotion(notion, query, filter);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error("Error searching Notion:", error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error searching Notion: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }
);

server.tool(
  "create-database",
  "Create new database",
  {
    parentPageId: z.string(),
    title: z.string(),
    properties: z.record(z.any()),
  },
  async ({ parentPageId, title, properties }) => {
    try {
      const newDatabase = await notion.databases.create({
        parent: { page_id: parentPageId },
        title: [{ text: { content: title } }],
        properties,
      });

      return {
        content: [
          {
            type: "text",
            text: `Database created successfully. ID: ${newDatabase.id}`,
          },
        ],
      };
    } catch (error) {
      console.error("Error creating database:", error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error creating database: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }
);

// Tool: Create a new page
server.tool(
  "create-page",
  "Create a new page in Notion",
  {
    parent: z
      .object({
        databaseId: z
          .string()
          .optional()
          .describe("Database ID if creating a page in a database"),
        pageId: z.string().optional().describe("Page ID if creating a subpage"),
      })
      .describe("Parent container for the new page"),
    properties: z
      .record(z.any())
      .describe("Page properties according to database schema"),
    content: z.array(z.any()).optional().describe("Page content blocks"),
  },
  async ({ parent, properties, content }) => {
    try {
      if (!parent.databaseId && !parent.pageId) {
        throw new Error("Either databaseId or pageId is required in parent");
      }
      const parentType = parent.databaseId ? "database" : "page";
      const parentId = parent.databaseId || parent.pageId;
      const confirmationMessage = `You are about to create a new page in ${parentType} (${parentId}). Do you want to proceed?`;
      debug(confirmationMessage);

      const newPage = await createPage(notion, parent, properties, content);
      return {
        content: [
          {
            type: "text",
            text: `Page created successfully. New page ID: ${newPage.id}`,
          },
        ],
      };
    } catch (error) {
      console.error("Error creating page:", error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error creating page: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }
);

// Tool: Update a page
server.tool(
  "update-page",
  "Update an existing page in Notion",
  {
    pageId: z.string().describe("ID of the page to update"),
    properties: z
      .record(z.any())
      .optional()
      .describe("Page properties to update"),
    content: z.array(z.any()).optional().describe("New page content blocks"),
    skipBackup: z
      .boolean()
      .optional()
      .default(false)
      .describe("Skip creating a backup before updating (not recommended)"),
  },
  async ({ pageId, properties, content, skipBackup }) => {
    try {
      if (!properties && !content) {
        throw new Error("Either properties or content must be provided");
      }
      const confirmationMessage = `You are about to update page (${pageId}). This will modify its content. Do you want to proceed?`;
      debug(confirmationMessage);

      let backupInfo = null;
      if (!skipBackup) {
        try {
          backupInfo = await backupPage(notion, pageId);
          debug(`Created backup at ${backupInfo.backupPath}`);
        } catch (backupError) {
          console.error("Failed to create backup:", backupError);
        }
      }
      await updatePage(notion, pageId, properties, content);
      return {
        content: [
          {
            type: "text",
            text: `Page ${pageId} updated successfully.${
              backupInfo ? ` A backup was created before the update.` : ""
            }`,
          },
        ],
      };
    } catch (error) {
      console.error("Error updating page:", error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error updating page: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }
);

// Tool: Delete a page
server.tool(
  "delete-page",
  "Delete a page in Notion",
  {
    pageId: z.string().describe("ID of the page to delete"),
    skipBackup: z
      .boolean()
      .optional()
      .default(false)
      .describe("Skip creating a backup before deleting (not recommended)"),
  },
  async ({ pageId, skipBackup }) => {
    try {
      const confirmationMessage = `⚠️ WARNING: You are about to DELETE page (${pageId}). This action cannot be undone. Do you want to proceed?`;
      debug(confirmationMessage);

      let backupInfo = null;
      if (!skipBackup) {
        try {
          backupInfo = await backupPage(notion, pageId);
          debug(`Created backup at ${backupInfo.backupPath} before deletion`);
        } catch (backupError) {
          console.error(
            "Failed to create backup before deletion:",
            backupError
          );
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Safety procedure failed: Could not create backup before deletion. Operation aborted. Error: ${
                  backupError instanceof Error
                    ? backupError.message
                    : String(backupError)
                }`,
              },
            ],
          };
        }
      }
      await deletePage(notion, pageId);
      return {
        content: [
          {
            type: "text",
            text: `Page ${pageId} has been deleted.${
              backupInfo ? ` A backup was created before deletion.` : ""
            }`,
          },
        ],
      };
    } catch (error) {
      console.error("Error deleting page:", error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error deleting page: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }
);

// Tool: Generate context summary
server.tool(
  "generate-context-summary",
  "Generate a summary of current Notion workspace context",
  {
    maxItems: z
      .number()
      .optional()
      .default(5)
      .describe("Maximum number of items to include in the summary"),
  },
  async ({ maxItems }) => {
    try {
      const updates = await fetchRecentUpdates(notion, maxItems);
      let summary = "## Notion Workspace Summary\n\n";
      if (updates.length === 0) {
        summary += "No recent updates in your workspace.\n";
      } else {
        summary += "### Recent Updates\n";
        updates.forEach((update, index) => {
          summary += `${index + 1}. ${update.title} - ${update.lastEdited}\n`;
          if (update.type === "page" && "parent" in update) {
            summary += `   Page in ${update.parent}\n`;
          } else if (update.type === "database" && "itemCount" in update) {
            summary += `   Database with ${update.itemCount} items\n`;
          }
        });
      }
      return {
        content: [
          {
            type: "text",
            text: summary,
          },
        ],
      };
    } catch (error) {
      console.error("Error generating context summary:", error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error generating context summary: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }
);

// Tool: Manage backups
server.tool(
  "manage-backups",
  "Manage page backups",
  {
    action: z
      .enum(["list", "restore", "cleanup"])
      .describe("Action to perform on backups"),
    pageId: z
      .string()
      .optional()
      .describe("ID of the page for backup operations"),
    backupFilename: z
      .string()
      .optional()
      .describe("Specific backup filename to restore"),
    maxBackupsPerPage: z
      .number()
      .optional()
      .default(5)
      .describe("Maximum number of backups to keep per page when cleaning up"),
    maxBackupAgeDays: z
      .number()
      .optional()
      .default(30)
      .describe("Maximum age of backups in days when cleaning up"),
  },
  async ({
    action,
    pageId,
    backupFilename,
    maxBackupsPerPage,
    maxBackupAgeDays,
  }) => {
    try {
      switch (action) {
        case "list":
          if (!pageId) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: "Error: pageId is required for listing backups",
                },
              ],
            };
          }
          const backups = listPageBackups(pageId);
          if (backups.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `No backups found for page ${pageId}.`,
                },
              ],
            };
          }
          let backupsList = `Available backups for page ${pageId}:\n\n`;
          backups.forEach((backup, index) => {
            backupsList += `${index + 1}. ${backup.filename}\n`;
            backupsList += `   Created: ${new Date(
              backup.created
            ).toLocaleString()}\n`;
            backupsList += `   Size: ${Math.round(backup.size / 1024)} KB\n\n`;
          });
          return {
            content: [{ type: "text", text: backupsList }],
          };

        case "restore":
          if (!backupFilename) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: "Error: backupFilename is required for restore operation",
                },
              ],
            };
          }
          debug(
            `You are about to restore page from backup ${backupFilename}. This will overwrite the current page content. Do you want to proceed?`
          );
          const restoreResult = await restoreFromBackup(notion, backupFilename);
          return {
            content: [
              {
                type: "text",
                text: `Page ${restoreResult.pageId} has been restored from backup ${backupFilename}.`,
              },
            ],
          };

        case "cleanup":
          const cleanupResult = cleanupOldBackups(
            maxBackupsPerPage,
            maxBackupAgeDays
          );
          return {
            content: [
              {
                type: "text",
                text: cleanupResult
                  ? `Backup cleanup completed successfully. Kept ${maxBackupsPerPage} most recent backups per page, and removed backups older than ${maxBackupAgeDays} days.`
                  : "Backup cleanup failed. Check server logs for details.",
              },
            ],
          };

        default:
          return {
            isError: true,
            content: [{ type: "text", text: `Unknown action: ${action}` }],
          };
      }
    } catch (error) {
      console.error(`Error in manage-backups tool:`, error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error managing backups: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }
);

// ========== PROMPTS ==========

server.prompt(
  "upcoming-deadlines",
  "Get a list of upcoming deadlines",
  {
    databaseId: z
      .string()
      .optional()
      .describe("Optional database ID to search for deadlines"),
    days: z.string().optional().describe("Number of days to look ahead"),
  },
  async (args) => {
    const { databaseId, days = "7" } = args;
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Show me all upcoming deadlines${
              databaseId ? " in the specified database" : ""
            } for the next ${days} days. For each task with a deadline, include: 1) the task name, 2) the exact deadline date, 3) the current status, and 4) assigned person if applicable.`,
          },
        },
      ],
    };
  }
);

server.prompt(
  "project-status",
  "Summarize the status of a project",
  {
    projectId: z.string().describe("ID of the project page or database"),
  },
  async (args) => {
    const { projectId } = args;
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Summarize the current status of the project with ID ${projectId}. Include: 1) overall completion percentage, 2) recent milestones achieved, 3) upcoming deadlines, 4) any blockers or issues, and 5) team members involved.`,
          },
        },
      ],
    };
  }
);

server.prompt("daily-tasks", "Get a list of tasks for today", {}, async () => {
  const today = new Date().toISOString().split("T")[0];
  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `List all tasks due today (${today}). For each task, provide: 1) task name, 2) priority, 3) estimated time to complete, and 4) any dependencies or blockers.`,
        },
      },
    ],
  };
});

// Start the server
async function main() {
  try {
    const fs = await import("fs");
    if (!fs.existsSync(CONFIG.BACKUP_DIR)) {
      fs.mkdirSync(CONFIG.BACKUP_DIR, { recursive: true });
      debug(`Created backup directory: ${CONFIG.BACKUP_DIR}`);
    }

    debug("Testing Notion API connection...");
    try {
      const user = await notion.users.me({});
      console.error(`Connected to Notion as ${user.name} (${user.type})`);
    } catch (error) {
      console.error("Error connecting to Notion API:", error);
      console.error("Please check your NOTION_API_KEY environment variable.");
      process.exit(1);
    }

    const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // Once per day
    setInterval(() => {
      debug(`Running scheduled backup cleanup...`);
      cleanupOldBackups(
        CONFIG.MAX_BACKUPS_PER_PAGE,
        CONFIG.BACKUP_RETENTION_DAYS
      );
    }, CLEANUP_INTERVAL);

    debug(`Running initial backup cleanup...`);
    cleanupOldBackups(
      CONFIG.MAX_BACKUPS_PER_PAGE,
      CONFIG.BACKUP_RETENTION_DAYS
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Notion MCP Server running on stdio");

    process.on("SIGINT", async () => {
      console.error("Shutting down Notion MCP Server...");
      try {
        await server.close();
      } catch (error) {
        console.error("Error during shutdown:", error);
      }
      process.exit(0);
    });
  } catch (error) {
    console.error("Fatal error during server initialization:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});

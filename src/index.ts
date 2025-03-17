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
  // Required settings
  NOTION_API_KEY: process.env.NOTION_API_KEY,

  // Optional settings with defaults
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

// Setup debug logging
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

// Resource: Database schema (structure, fields, etc.)
server.resource(
  "Database Schema",
  "notion://databases/{databaseId}/schema",
  async (uri) => {
    try {
      // Extract databaseId from URL parameters
      const url = new URL(uri.toString());
      const path = url.pathname;
      const matches = path.match(/\/databases\/([^\/]+)\/schema/);

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

// Resource: Database content (all pages/items in a database)
server.resource(
  "Database Content",
  "notion://databases/{databaseId}/content",
  async (uri) => {
    try {
      // Extract databaseId from URL parameters
      const url = new URL(uri.toString());
      const path = url.pathname;
      const matches = path.match(/\/databases\/([^\/]+)\/content/);

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

// Resource: Page content
server.resource("Page Content", "notion://pages/{pageId}", async (uri) => {
  try {
    // Extract pageId from URL parameters
    const url = new URL(uri.toString());
    const path = url.pathname;
    const matches = path.match(/\/pages\/([^\/]+)/);

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

// Resource: Recent updates (activity feed)
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
      // Validation - must have either databaseId or pageId
      if (!parent.databaseId && !parent.pageId) {
        throw new Error("Either databaseId or pageId is required in parent");
      }

      // Create confirmation message
      const parentType = parent.databaseId ? "database" : "page";
      const parentId = parent.databaseId || parent.pageId;
      const confirmationMessage = `You are about to create a new page in ${parentType} (${parentId}). Do you want to proceed?`;

      // This would normally require user confirmation
      console.log(confirmationMessage);

      // Proceed with creation
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
      // Validation - must have either properties or content
      if (!properties && !content) {
        throw new Error("Either properties or content must be provided");
      }

      // Create confirmation message
      const confirmationMessage = `You are about to update page (${pageId}). This will modify its content. Do you want to proceed?`;

      // This would normally require user confirmation
      console.log(confirmationMessage);

      // Create a backup first unless explicitly skipped
      let backupInfo = null;
      if (!skipBackup) {
        try {
          backupInfo = await backupPage(notion, pageId);
          console.log(`Created backup at ${backupInfo.backupPath}`);
        } catch (backupError) {
          console.error("Failed to create backup:", backupError);
          // Continue with the update, but log the backup failure
        }
      }

      // Proceed with update
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
      // Create confirmation message with strong warning
      const confirmationMessage = `⚠️ WARNING: You are about to DELETE page (${pageId}). This action cannot be undone. Do you want to proceed?`;

      // This would normally require user confirmation
      console.log(confirmationMessage);

      // Create a backup first unless explicitly skipped (crucial for delete operations)
      let backupInfo = null;
      if (!skipBackup) {
        try {
          backupInfo = await backupPage(notion, pageId);
          console.log(
            `Created backup at ${backupInfo.backupPath} before deletion`
          );
        } catch (backupError) {
          console.error(
            "Failed to create backup before deletion:",
            backupError
          );
          // For deletion, we might want to abort if backup fails
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

      // In a real implementation, this would wait for user confirmation
      // For now, we'll proceed with deletion
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

          // This would normally require user confirmation
          console.log(
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

      // Format the updates into a readable summary
      let summary = "## Notion Workspace Summary\n\n";

      if (updates.length === 0) {
        summary += "No recent updates in your workspace.\n";
      } else {
        summary += "### Recent Updates\n";
        updates.forEach((update, index) => {
          summary += `${index + 1}. ${update.title} - ${update.lastEdited}\n`;

          // Type guard to check for specific update types
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

// ========== PROMPTS ==========

// Prompt: Upcoming deadlines
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

    // This would typically format a good query for an LLM to process
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

// Prompt: Summarize project status
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

// Prompt: Daily task list
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
    // Create backup directory if it doesn't exist
    const fs = await import("fs");
    if (!fs.existsSync(CONFIG.BACKUP_DIR)) {
      fs.mkdirSync(CONFIG.BACKUP_DIR, { recursive: true });
      debug(`Created backup directory: ${CONFIG.BACKUP_DIR}`);
    }

    // Test Notion connection
    debug("Testing Notion API connection...");
    try {
      const user = await notion.users.me({});
      console.error(`Connected to Notion as ${user.name} (${user.type})`);
    } catch (error) {
      console.error("Error connecting to Notion API:", error);
      console.error("Please check your NOTION_API_KEY environment variable.");
      process.exit(1);
    }

    // Schedule periodic backup cleanups
    const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // Once per day
    setInterval(() => {
      debug(`Running scheduled backup cleanup...`);
      cleanupOldBackups(
        CONFIG.MAX_BACKUPS_PER_PAGE,
        CONFIG.BACKUP_RETENTION_DAYS
      );
    }, CLEANUP_INTERVAL);

    // Run initial backup cleanup
    debug(`Running initial backup cleanup...`);
    cleanupOldBackups(
      CONFIG.MAX_BACKUPS_PER_PAGE,
      CONFIG.BACKUP_RETENTION_DAYS
    );

    // Initialize with stdio transport for local usage
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("Notion MCP Server running on stdio");

    // Set up graceful shutdown
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

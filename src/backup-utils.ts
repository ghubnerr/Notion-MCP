import { Client } from "@notionhq/client";
import fs from "fs";
import path from "path";
import { fetchPageContent } from "./notion-api.js";

// Directory for storing backups
const BACKUP_DIR =
  process.env.BACKUP_DIR || path.join(process.cwd(), "backups");

/**
 * Creates a backup of a Notion page before modifying it
 * @param notion Notion client
 * @param pageId ID of the page to backup
 * @returns Object with backup details
 */
export async function backupPage(notion: Client, pageId: string) {
  try {
    // Create backup directory if it doesn't exist
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    // Fetch page content
    const pageContent = await fetchPageContent(notion, pageId);

    // Generate backup filename
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const backupFilename = `page_${pageId}_${timestamp}.json`;
    const backupPath = path.join(BACKUP_DIR, backupFilename);

    // Write backup to file
    fs.writeFileSync(backupPath, JSON.stringify(pageContent, null, 2));

    return {
      success: true,
      backupPath,
      timestamp,
      pageId,
    };
  } catch (error) {
    console.error(`Error backing up page ${pageId}:`, error);
    throw new Error(
      `Failed to backup page: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Lists all available backups for a specific page
 * @param pageId ID of the page to list backups for
 * @returns Array of backup information
 */
export function listPageBackups(pageId: string) {
  try {
    // Create backup directory if it doesn't exist
    if (!fs.existsSync(BACKUP_DIR)) {
      return [];
    }

    // Find all backup files for this page
    const files = fs.readdirSync(BACKUP_DIR);
    const pageBackups = files.filter(
      (file) => file.startsWith(`page_${pageId}_`) && file.endsWith(".json")
    );

    // Sort backups by timestamp (most recent first)
    pageBackups.sort().reverse();

    // Extract backup details
    return pageBackups
      .map((filename) => {
        const match = filename.match(/page_(.+)_(.+)\.json/);
        if (!match) return null;

        const [_, backupPageId, timestamp] = match;
        const backupPath = path.join(BACKUP_DIR, filename);
        const stats = fs.statSync(backupPath);

        return {
          pageId: backupPageId,
          timestamp: timestamp.replace(/-/g, ":"),
          filename,
          path: backupPath,
          size: stats.size,
          created: stats.mtime,
        };
      })
      .filter((backup) => backup !== null);
  } catch (error) {
    console.error("Error listing backups:", error);
    return [];
  }
}

/**
 * Restores a page from a backup
 * @param notion Notion client
 * @param backupFilename Filename of the backup to restore
 * @returns Status of the restore operation
 */
export async function restoreFromBackup(
  notion: Client,
  backupFilename: string
) {
  try {
    const backupPath = path.join(BACKUP_DIR, backupFilename);

    // Check if backup exists
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupFilename}`);
    }

    // Read backup file
    const backupContent = JSON.parse(fs.readFileSync(backupPath, "utf8"));

    // Extract page ID and content
    const pageId = backupContent.page.id;
    const properties = backupContent.page.properties;
    const blocks = backupContent.blocks;

    // First update page properties
    await notion.pages.update({
      page_id: pageId,
      properties,
    });

    // Then clear existing blocks
    const existingBlocks = await notion.blocks.children.list({
      block_id: pageId,
    });

    for (const block of existingBlocks.results) {
      await notion.blocks.delete({
        block_id: block.id,
      });
    }

    // Recreate blocks (recursive structure is complex, we'll simplify here)
    const topLevelBlocks = blocks.map((block: any) => {
      // Remove id to let Notion create new IDs
      const { id, children, ...blockContent } = block;
      return blockContent;
    });

    // Add blocks back to the page
    await notion.blocks.children.append({
      block_id: pageId,
      children: topLevelBlocks,
    });

    return {
      success: true,
      pageId,
      backupFile: backupFilename,
      message: "Page restored successfully",
    };
  } catch (error) {
    console.error(`Error restoring from backup:`, error);
    throw new Error(
      `Failed to restore from backup: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Creates a backup database in Notion to store backup metadata
 * @param notion Notion client
 * @returns ID of the backup database
 */
export async function createBackupDatabase(notion: Client) {
  try {
    // Create a database to track backups
    const response = await notion.databases.create({
      parent: {
        type: "page_id",
        page_id: "", // This needs to be a valid page ID
        // Remove the workspace type that's causing the error
      },
      title: [
        {
          type: "text",
          text: {
            content: "MCP Server Backups",
          },
        },
      ],
      properties: {
        "Page ID": {
          type: "title",
          title: {},
        },
        "Backup Time": {
          type: "date",
          date: {},
        },
        "Backup Path": {
          type: "rich_text",
          rich_text: {},
        },
        Status: {
          type: "select",
          select: {
            options: [
              { name: "Active", color: "green" },
              { name: "Restored", color: "blue" },
              { name: "Failed", color: "red" },
            ],
          },
        },
        Size: {
          type: "number",
          number: {
            format: "number",
          },
        },
      },
    });

    return response.id;
  } catch (error) {
    console.error("Error creating backup database:", error);
    throw new Error(
      `Failed to create backup database: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Records a backup operation in the backup tracking database
 * @param notion Notion client
 * @param backupDatabaseId ID of the backup tracking database
 * @param backupInfo Information about the backup
 * @returns ID of the created record
 */
export async function recordBackupInNotion(
  notion: Client,
  backupDatabaseId: string,
  backupInfo: any
) {
  try {
    const response = await notion.pages.create({
      parent: {
        database_id: backupDatabaseId,
      },
      properties: {
        "Page ID": {
          title: [
            {
              text: {
                content: backupInfo.pageId,
              },
            },
          ],
        },
        "Backup Time": {
          date: {
            start: new Date(backupInfo.timestamp).toISOString(),
          },
        },
        "Backup Path": {
          rich_text: [
            {
              text: {
                content: backupInfo.backupPath,
              },
            },
          ],
        },
        Status: {
          select: {
            name: "Active",
          },
        },
        Size: {
          number: backupInfo.size || 0,
        },
      },
    });

    return response.id;
  } catch (error) {
    console.error("Error recording backup in Notion:", error);
    // Don't throw - this is a non-critical operation
    return null;
  }
}

/**
 * Deletes old backups to maintain storage limits
 * @param maxBackupsPerPage Maximum number of backups to keep per page
 * @param maxBackupAge Maximum age of backups in days
 */
export function cleanupOldBackups(maxBackupsPerPage = 5, maxBackupAge = 30) {
  try {
    // Create backup directory if it doesn't exist
    if (!fs.existsSync(BACKUP_DIR)) {
      return;
    }

    // Get all backup files
    const files = fs.readdirSync(BACKUP_DIR);
    const backupFiles = files.filter((file) => file.match(/page_.+_.+\.json/));

    // Group backups by page ID
    const backupsByPage: Record<string, string[]> = {};

    backupFiles.forEach((file) => {
      const match = file.match(/page_(.+)_(.+)\.json/);
      if (!match) return;

      const [_, pageId] = match;

      if (!backupsByPage[pageId]) {
        backupsByPage[pageId] = [];
      }

      backupsByPage[pageId].push(file);
    });

    // For each page, keep only the most recent backups
    Object.entries(backupsByPage).forEach(([pageId, pageBackups]) => {
      // Sort backups by date (oldest first)
      pageBackups.sort();

      // If we have more than the maximum, delete the oldest
      if (pageBackups.length > maxBackupsPerPage) {
        const backupsToDelete = pageBackups.slice(
          0,
          pageBackups.length - maxBackupsPerPage
        );

        backupsToDelete.forEach((file) => {
          const backupPath = path.join(BACKUP_DIR, file);
          fs.unlinkSync(backupPath);
          console.log(`Deleted old backup: ${file}`);
        });
      }
    });

    // Delete backups older than maxBackupAge days
    const now = new Date();
    const maxAge = maxBackupAge * 24 * 60 * 60 * 1000; // days to ms

    backupFiles.forEach((file) => {
      const backupPath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(backupPath);
      const fileAge = now.getTime() - stats.mtime.getTime();

      if (fileAge > maxAge) {
        fs.unlinkSync(backupPath);
        console.log(`Deleted expired backup: ${file}`);
      }
    });

    return true;
  } catch (error) {
    console.error("Error cleaning up old backups:", error);
    return false;
  }
}

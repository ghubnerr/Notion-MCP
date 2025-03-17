import { Client } from "@notionhq/client";
import { LogLevel } from "@notionhq/client";

// Configure default page size for pagination
const DEFAULT_PAGE_SIZE = 100;

/**
 * Fetch all databases from the Notion workspace
 */
export async function fetchDatabases(notion: Client) {
  try {
    const response = await notion.search({
      filter: {
        property: "object",
        value: "database",
      },
      page_size: DEFAULT_PAGE_SIZE,
    });

    return response.results.map((database: any) => ({
      id: database.id,
      title: extractDatabaseTitle(database),
      url: database.url,
      created_time: database.created_time,
      last_edited_time: database.last_edited_time,
    }));
  } catch (error) {
    console.error("Error fetching databases:", error);
    throw error;
  }
}

/**
 * Fetch pages from a specific database
 */
export async function fetchPages(notion: Client, databaseId: string) {
  try {
    // First, get the database to understand its schema
    const database = await notion.databases.retrieve({
      database_id: databaseId,
    });

    // Fetch pages from the database
    const response = await notion.databases.query({
      database_id: databaseId,
      page_size: DEFAULT_PAGE_SIZE,
    });

    // Process the pages to extract key information
    return {
      database: {
        id: database.id,
        title: extractDatabaseTitle(database),
      },
      pages: await Promise.all(
        response.results.map(async (page: any) => {
          // Extract page title (if available)
          let title = "Untitled";

          // Find title property (usually "Name", "Title", etc.)
          const titleProperty = Object.entries(page.properties).find(
            ([_, value]: [string, any]) => value.type === "title"
          );

          if (
            titleProperty &&
            titleProperty[1] &&
            (titleProperty[1] as any).title
          ) {
            const titleValue = (titleProperty[1] as any).title;
            title =
              titleValue.length > 0 ? titleValue[0].plain_text : "Untitled";
          }

          // Return formatted page data
          return {
            id: page.id,
            title,
            url: page.url,
            created_time: page.created_time,
            last_edited_time: page.last_edited_time,
            properties: page.properties,
          };
        })
      ),
    };
  } catch (error) {
    console.error(`Error fetching pages from database ${databaseId}:`, error);
    throw error;
  }
}

/**
 * Fetch content of a specific page
 */
export async function fetchPageContent(notion: Client, pageId: string) {
  try {
    // Get the page itself
    const page = await notion.pages.retrieve({
      page_id: pageId,
    });

    // Get the page blocks (content)
    const blocks = await fetchAllBlocks(notion, pageId);

    return {
      page: {
        id: page.id,
        url: (page as any).url, // Type assertion for properties not in PartialPageObjectResponse
        created_time: (page as any).created_time,
        last_edited_time: (page as any).last_edited_time,
        properties: (page as any).properties,
      },
      blocks,
    };
  } catch (error) {
    console.error(`Error fetching content for page ${pageId}:`, error);
    throw error;
  }
}

/**
 * Recursively fetch all blocks for a page, including nested blocks
 */
async function fetchAllBlocks(
  notion: Client,
  blockId: string,
  maxDepth = 3,
  currentDepth = 0
) {
  // Prevent excessive recursion
  if (currentDepth >= maxDepth) {
    return [];
  }

  try {
    const blocks: any[] = [];
    let hasMore = true;
    let cursor: string | undefined = undefined;

    while (hasMore) {
      const response = await notion.blocks.children.list({
        block_id: blockId,
        page_size: DEFAULT_PAGE_SIZE,
        ...(cursor ? { start_cursor: cursor } : {}),
      });

      blocks.push(...response.results);
      hasMore = response.has_more;
      cursor = response.next_cursor || undefined;
    }

    // Process blocks and fetch children if needed
    const processedBlocks = [];
    for (const block of blocks) {
      const processedBlock: any = {
        id: block.id,
        type: block.type,
        has_children: block.has_children,
        created_time: block.created_time,
        last_edited_time: block.last_edited_time,
        ...block[block.type as string], // Spread the content based on block type
      };

      // Recursively fetch children if this block has them
      if (block.has_children) {
        processedBlock.children = await fetchAllBlocks(
          notion,
          block.id,
          maxDepth,
          currentDepth + 1
        );
      }

      processedBlocks.push(processedBlock);
    }

    return processedBlocks;
  } catch (error) {
    console.error(`Error fetching blocks for ${blockId}:`, error);
    throw error;
  }
}

/**
 * Search for content in Notion
 */
export async function searchNotion(
  notion: Client,
  query: string,
  filter?: any
) {
  try {
    // Prepare the search parameters
    const searchParams: any = {
      query,
      page_size: DEFAULT_PAGE_SIZE,
    };

    // Add filter if provided
    if (filter?.object) {
      searchParams.filter = {
        property: "object",
        value: filter.object,
      };
    }

    // Execute the search
    const response = await notion.search(searchParams);

    // Process and return search results
    return {
      results: response.results.map((result: any) => {
        // Common properties for all result types
        const common = {
          id: result.id,
          object: result.object,
          url: result.url,
          created_time: result.created_time,
          last_edited_time: result.last_edited_time,
        };

        // Add object-specific properties
        if (result.object === "page") {
          return {
            ...common,
            title: extractPageTitle(result),
            parent: result.parent,
          };
        } else if (result.object === "database") {
          return {
            ...common,
            title: extractDatabaseTitle(result),
            properties: result.properties,
          };
        } else {
          return {
            ...common,
            // Add any other object type properties as needed
          };
        }
      }),
      next_cursor: response.next_cursor,
      has_more: response.has_more,
    };
  } catch (error) {
    console.error(`Error searching Notion with query "${query}":`, error);
    throw error;
  }
}

/**
 * Create a new page in Notion
 */
export async function createPage(
  notion: Client,
  parent: { databaseId?: string; pageId?: string },
  properties: any,
  content?: any[]
) {
  try {
    // Prepare the parent object based on provided IDs
    let parentObject: any = {};
    if (parent.databaseId) {
      parentObject.database_id = parent.databaseId;
    } else if (parent.pageId) {
      parentObject.page_id = parent.pageId;
    } else {
      throw new Error("Either databaseId or pageId must be provided");
    }

    // Create the page
    const newPage = await notion.pages.create({
      parent: parentObject,
      properties,
    });

    // If content blocks are provided, add them to the page
    if (content && content.length > 0) {
      await addBlocksToPage(notion, newPage.id, content);
    }

    return newPage;
  } catch (error) {
    console.error("Error creating page:", error);
    throw error;
  }
}

/**
 * Update an existing page in Notion
 */
export async function updatePage(
  notion: Client,
  pageId: string,
  properties?: any,
  content?: any[]
) {
  try {
    let updatedPage;

    // Update properties if provided
    if (properties) {
      updatedPage = await notion.pages.update({
        page_id: pageId,
        properties,
      });
    }

    // If content blocks are provided, replace the page's content
    if (content && content.length > 0) {
      // First, clear existing blocks
      const blocks = await notion.blocks.children.list({
        block_id: pageId,
      });

      for (const block of blocks.results) {
        await notion.blocks.delete({
          block_id: block.id,
        });
      }

      // Then add new blocks
      await addBlocksToPage(notion, pageId, content);
    }

    return updatedPage || { id: pageId };
  } catch (error) {
    console.error(`Error updating page ${pageId}:`, error);
    throw error;
  }
}

/**
 * Delete a page in Notion (archive it)
 */
export async function deletePage(notion: Client, pageId: string) {
  try {
    // In Notion, "deleting" a page actually archives it
    await notion.pages.update({
      page_id: pageId,
      archived: true,
    });

    return { success: true };
  } catch (error) {
    console.error(`Error deleting page ${pageId}:`, error);
    throw error;
  }
}

/**
 * Add blocks to a page
 */
async function addBlocksToPage(notion: Client, pageId: string, blocks: any[]) {
  try {
    await notion.blocks.children.append({
      block_id: pageId,
      children: blocks,
    });

    return { success: true };
  } catch (error) {
    console.error(`Error adding blocks to page ${pageId}:`, error);
    throw error;
  }
}

/**
 * Fetch recent updates from the workspace
 */
export async function fetchRecentUpdates(notion: Client, maxItems = 10) {
  try {
    // Search for recently modified pages and databases
    const response = await notion.search({
      sort: {
        direction: "descending",
        timestamp: "last_edited_time",
      },
      page_size: maxItems,
    });

    // Process the results
    return response.results.map((item: any) => {
      const common = {
        id: item.id,
        lastEdited: item.last_edited_time,
        url: item.url,
        type: item.object,
      };

      if (item.object === "page") {
        return {
          ...common,
          title: extractPageTitle(item),
          parent:
            item.parent.type === "database_id"
              ? "database"
              : item.parent.type === "page_id"
              ? "page"
              : "workspace",
        };
      } else if (item.object === "database") {
        return {
          ...common,
          title: extractDatabaseTitle(item),
          itemCount: 0, // We would need an additional query to get this
        };
      } else {
        return {
          ...common,
          title: "Unknown item",
        };
      }
    });
  } catch (error) {
    console.error("Error fetching recent updates:", error);
    throw error;
  }
}

/**
 * Helper function to extract a page title
 */
function extractPageTitle(page: any): string {
  // Look for a title property in the page
  if (page.properties) {
    const titleProperty = Object.entries(page.properties).find(
      ([_, value]: [string, any]) => value.type === "title"
    );

    if (titleProperty && titleProperty[1] && (titleProperty[1] as any).title) {
      const titleValue = (titleProperty[1] as any).title;
      if (titleValue?.length > 0) {
        return titleValue[0].plain_text;
      }
    }
  }

  // Fallback if no title property is found
  return "Untitled";
}

/**
 * Helper function to extract a database title
 */
function extractDatabaseTitle(database: any): string {
  if (
    database.title &&
    Array.isArray(database.title) &&
    database.title.length > 0
  ) {
    return database.title.map((t: any) => t.plain_text).join("");
  }
  return "Untitled Database";
}

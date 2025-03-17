import { Client } from "@notionhq/client";
import { LogLevel } from "@notionhq/client";

// Configure default page size for pagination
const DEFAULT_PAGE_SIZE = 100;

/**
 * Validates each block in the provided blocks array.
 * If a block is missing the required content property, logs an error and replaces it with a safe default paragraph block.
 */
function validateBlocks(blocks: any[]): any[] {
  return blocks.map((block, index) => {
    if (!block.type) {
      console.error(
        `Block at index ${index} is missing the 'type' field. Replacing with default paragraph block.`
      );
      return {
        type: "paragraph",
        object: "block",
        paragraph: {
          rich_text: [
            { text: { content: "Invalid block removed." }, type: "text" },
          ],
        },
      };
    }
    if (typeof block[block.type] === "undefined") {
      console.error(
        `Block at index ${index} of type ${block.type} is missing its content property. Replacing with default paragraph block.`
      );
      return {
        type: "paragraph",
        object: "block",
        paragraph: {
          rich_text: [
            { text: { content: "Invalid block removed." }, type: "text" },
          ],
        },
      };
    }
    return block;
  });
}

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
    const database = await notion.databases.retrieve({
      database_id: databaseId,
    });
    const response = await notion.databases.query({
      database_id: databaseId,
      page_size: DEFAULT_PAGE_SIZE,
    });
    return {
      database: {
        id: database.id,
        title: extractDatabaseTitle(database),
      },
      pages: await Promise.all(
        response.results.map(async (page: any) => {
          let title = "Untitled";
          const titleProperty = Object.entries(page.properties).find(
            ([, value]: [string, any]) => value.type === "title"
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
    const page = await notion.pages.retrieve({
      page_id: pageId,
    });
    const blocks = await fetchAllBlocks(notion, pageId);
    return {
      page: {
        id: page.id,
        url: (page as any).url,
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
    const processedBlocks = [];
    for (const block of blocks) {
      const processedBlock: any = {
        id: block.id,
        type: block.type,
        has_children: block.has_children,
        created_time: block.created_time,
        last_edited_time: block.last_edited_time,
        ...block[block.type as string],
      };
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
    const searchParams: any = {
      query,
      page_size: DEFAULT_PAGE_SIZE,
    };
    if (filter?.object) {
      searchParams.filter = {
        property: "object",
        value: filter.object,
      };
    }
    const response = await notion.search(searchParams);
    return {
      results: response.results.map((result: any) => {
        const common = {
          id: result.id,
          object: result.object,
          url: result.url,
          created_time: result.created_time,
          last_edited_time: result.last_edited_time,
        };
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
    let parentObject: any = {};
    if (parent.databaseId) {
      parentObject.database_id = parent.databaseId;
    } else if (parent.pageId) {
      parentObject.page_id = parent.pageId;
    } else {
      throw new Error("Either databaseId or pageId must be provided");
    }
    const newPage = await notion.pages.create({
      parent: parentObject,
      properties,
    });
    if (content && content.length > 0) {
      const validatedContent = validateBlocks(content);
      await addBlocksToPage(notion, newPage.id, validatedContent);
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
    if (properties) {
      updatedPage = await notion.pages.update({
        page_id: pageId,
        properties,
      });
    }
    if (content && content.length > 0) {
      const blocks = await notion.blocks.children.list({ block_id: pageId });
      for (const block of blocks.results) {
        await notion.blocks.delete({ block_id: block.id });
      }
      const validatedContent = validateBlocks(content);
      await addBlocksToPage(notion, pageId, validatedContent);
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
    const validatedBlocks = validateBlocks(blocks);
    await notion.blocks.children.append({
      block_id: pageId,
      children: validatedBlocks,
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
    const response = await notion.search({
      sort: {
        direction: "descending",
        timestamp: "last_edited_time",
      },
      page_size: maxItems,
    });
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
          itemCount: 0,
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
  if (page.properties) {
    const titleProperty = Object.entries(page.properties).find(
      ([, value]: [string, any]) => value.type === "title"
    );
    if (titleProperty && titleProperty[1] && (titleProperty[1] as any).title) {
      const titleValue = (titleProperty[1] as any).title;
      if (titleValue?.length > 0) {
        return titleValue[0].plain_text;
      }
    }
  }
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

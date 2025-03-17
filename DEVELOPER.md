# Developer Guide for Notion MCP Server

This document provides detailed guidance for developers who want to extend or modify the Notion MCP Server.

## Architecture Overview

The Notion MCP Server is built with a modular design that separates the MCP protocol handling from the Notion API integration:

1. **MCP Protocol Layer** (`index.ts`): Implements the Model Context Protocol server interface, exposing resources, tools, and prompts.
2. **Notion API Layer** (`notion-api.ts`): Handles all communication with the Notion API, including authentication, data fetching, and manipulation.

## Adding New Features

### Adding a New Resource

To add a new resource to the server:

1. Define a new resource handler in `index.ts`:

```typescript
server.resource(
  "notion://my-new-resource/{param}", // URI template
  "My New Resource", // Human-readable name
  "Description of the resource", // Description
  async ({ param }) => {
    // Handler function
    try {
      // Implement resource retrieval logic
      const data = await myCustomFunction(notion, param);
      return JSON.stringify(data, null, 2);
    } catch (error) {
      console.error(`Error in my-new-resource:`, error);
      throw new Error(`Failed to fetch resource: ${error.message}`);
    }
  }
);
```

2. Implement any necessary API functions in `notion-api.ts`.

### Adding a New Tool

To add a new tool:

1. Define the tool in `index.ts`:

```typescript
server.tool(
  "my-new-tool", // Tool name
  "Description of the tool", // Tool description
  {
    // Define parameters using Zod schema
    param1: z.string().describe("Description of param1"),
    param2: z.number().describe("Description of param2"),
  },
  async ({ param1, param2 }) => {
    // Handler function
    try {
      // Implement tool logic
      const result = await myCustomToolLogic(notion, param1, param2);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error("Error in my-new-tool:", error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error: ${error.message}`,
          },
        ],
      };
    }
  }
);
```

2. Implement any necessary API functions in `notion-api.ts`.

### Adding a New Prompt

To add a new prompt template:

```typescript
server.prompt(
  "my-new-prompt", // Prompt name
  "Description of the prompt", // Prompt description
  {
    // Define parameters using Zod schema
    param1: z.string().describe("Description of param1"),
  },
  async (args) => {
    const { param1 } = args;

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Custom prompt text that uses ${param1} in its formatting.`,
          },
        },
      ],
    };
  }
);
```

## Working with the Notion API

### Authentication

The server uses the Notion JavaScript client to communicate with Notion's API. The client requires an API key, which is provided through the `NOTION_API_KEY` environment variable.

### Rate Limiting

Notion's API has rate limits. For heavy usage, consider implementing:

1. Request throttling
2. Exponential backoff for retries
3. Caching frequently accessed data

Example retry logic:

```typescript
async function fetchWithRetry(fetchFn, maxRetries = 3, initialDelay = 1000) {
  let retries = 0;
  let delay = initialDelay;

  while (true) {
    try {
      return await fetchFn();
    } catch (error) {
      if (error.status === 429 || error.status >= 500) {
        retries++;
        if (retries > maxRetries) {
          throw error;
        }

        // Exponential backoff with jitter
        const jitter = Math.random() * 0.3 + 0.85; // 0.85-1.15
        await new Promise((r) => setTimeout(r, delay * jitter));
        delay *= 2;
      } else {
        throw error;
      }
    }
  }
}
```

### Pagination

For endpoints that return large amounts of data, you'll need to handle pagination:

```typescript
async function fetchAllItems(fetchPage) {
  let allItems = [];
  let hasMore = true;
  let cursor = undefined;

  while (hasMore) {
    const response = await fetchPage(cursor);
    allItems = allItems.concat(response.results);

    hasMore = response.has_more;
    cursor = response.next_cursor;
  }

  return allItems;
}
```

## Testing

### Unit Testing

Unit tests can be added using Jest. Create a `__tests__` directory in the `src` folder:

```typescript
// src/__tests__/notion-api.test.ts
import { fetchDatabases } from "../notion-api";

// Mock the Notion client
jest.mock("@notionhq/client", () => {
  return {
    Client: jest.fn().mockImplementation(() => {
      return {
        search: jest.fn().mockResolvedValue({
          results: [{ id: "db1", title: [{ plain_text: "Test DB" }] }],
        }),
      };
    }),
  };
});

describe("fetchDatabases", () => {
  it("should return formatted database list", async () => {
    const mockNotion = new (require("@notionhq/client").Client)();
    const result = await fetchDatabases(mockNotion);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("db1");
    expect(result[0].title).toBe("Test DB");
  });
});
```

### Integration Testing

For integration testing with actual Notion API, create a separate `.env.test` file with test credentials and use a dedicated test workspace.

## Logging and Error Handling

The server includes basic logging to the console. For production use, consider:

1. Implementing a more robust logging system
2. Adding structured logging
3. Sending logs to a monitoring service

### Example Enhanced Logging

```typescript
function logger(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...data,
  };

  // For local development
  console[level === "error" ? "error" : "log"](
    `[${timestamp}] [${level.toUpperCase()}] ${message}`,
    Object.keys(data).length ? data : ""
  );

  // For production, you might send to a logging service
  // sendToLoggingService(logEntry);
}

// Usage
logger("info", "Database fetched", { databaseId: "db123", count: 5 });
logger("error", "Failed to update page", {
  pageId: "page123",
  error: err.message,
});
```

## Security Considerations

Since this server can modify Notion content, security is critical:

1. **API Key Security**: Never commit API keys to version control
2. **Input Validation**: Validate all inputs before using them in API calls
3. **Limited Scope**: Use the most limited permissions needed for your integration
4. **Confirmation for Destructive Actions**: Always confirm before deleting or overwriting data
5. **User Identification**: Consider tracking which user initiated each action
6. **Audit Logging**: Maintain detailed logs of all write operations

## Performance Optimization

For larger workspaces, consider:

1. **Caching**: Cache frequently accessed resources
2. **Selective Loading**: Only fetch the specific data needed
3. **Batching**: Combine related requests when possible
4. **Asynchronous Processing**: Use Promise.all for parallel operations

## Deployment

For production deployment options:

1. **Local Service**: Run as a local service on the user's machine
2. **Docker Container**: Package as a Docker container for easy deployment
3. **Cloud Function**: Deploy as a serverless function (AWS Lambda, Google Cloud Functions, etc.)

## Contributing

When contributing changes:

1. Follow the existing code style
2. Add tests for new functionality
3. Document API changes
4. Keep backwards compatibility in mind
5. Update the README with any new features or usage instructions

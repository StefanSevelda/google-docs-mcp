# Tools Architecture

This directory contains all MCP tool implementations organized by functionality.

## Structure

Each tool category is implemented as a class with a static `registerTools()` method:

```typescript
export class CategoryTools {
    static registerTools(server: FastMCP) {
        this.registerToolOne(server);
        this.registerToolTwo(server);
        // ...
    }

    private static registerToolOne(server: FastMCP) {
        server.addTool({
            name: 'toolName',
            description: 'Tool description',
            parameters: /* zod schema */,
            execute: async (args, { log }) => {
                // Implementation
            }
        });
    }
}
```

## Tool Categories

1. **DocumentTools** - Basic document operations (read, append, insert, delete)
2. **FormattingTools** - Text and paragraph styling
3. **StructureTools** - Document structure (insert table, page break, images)
4. **TableTools** - Table management (list, get, update cells, rows, columns)
5. **CommentTools** - Comment management
6. **DriveTools** - Google Drive file operations
7. **ChatTools** - Google Chat integration
8. **CalendarTools** - Google Calendar integration
9. **GmailTools** - Gmail operations

## Usage in server.ts

```typescript
import {
    DocumentTools,
    FormattingTools,
    StructureTools,
    TableTools,
    CommentTools,
    DriveTools,
    ChatTools,
    CalendarTools,
    GmailTools
} from './tools/index.js';

// Register all tools
DocumentTools.registerTools(server);
FormattingTools.registerTools(server);
StructureTools.registerTools(server);
TableTools.registerTools(server);
CommentTools.registerTools(server);
DriveTools.registerTools(server);
ChatTools.registerTools(server);
CalendarTools.registerTools(server);
GmailTools.registerTools(server);
```

## Benefits

- **Modularity**: Each category is self-contained
- **Maintainability**: Easy to find and update specific tools
- **Testability**: Can test categories independently
- **Clarity**: Clear separation of concerns
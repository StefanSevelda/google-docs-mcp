# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a comprehensive MCP (Model Context Protocol) server that provides programmatic access to Google Docs and Google Drive through 30+ tools. It uses FastMCP, TypeScript, and the Google APIs client library to enable AI assistants to read, write, format, and manage Google Documents and Drive files.

## Development Commands

### Building
```bash
npm run build    # Compile TypeScript to JavaScript in dist/
```

### Testing
```bash
npm test         # Run tests in tests/ directory
```

### Running the Server Manually
```bash
node ./dist/server.js   # Run after building
```

Note: The server is typically run by Claude Desktop via stdio transport, not manually.

## Architecture Overview

### Core Module Structure

**src/server.ts** - Main server with 30+ MCP tool definitions
- Initializes Google API clients with OAuth2
- Defines all MCP tools using FastMCP
- Handles tool execution and error handling
- Uses stdio transport for MCP communication

**src/auth.ts** - OAuth2 authentication module
- Manages OAuth2 flow with Google APIs
- Loads credentials from `credentials.json`
- Persists tokens to `token.json`
- Required scopes: `documents`, `drive`

**src/types.ts** - Type definitions and validation schemas
- Zod schemas for parameter validation
- Reusable schema fragments (DocumentIdParameter, RangeParameters, etc.)
- Type definitions exported from Zod schemas
- Utility functions (hex color validation/conversion)
- Custom error classes (NotImplementedError)

**src/googleDocsApiHelpers.ts** - Helper functions for Google APIs
- `executeBatchUpdate()` - Safe batch request execution
- `findTextRange()` - Intelligent text search with multi-segment support
- `getParagraphRange()` - Find paragraph boundaries
- Style request builders (text and paragraph)
- Image upload and insertion helpers
- Table and structure manipulation helpers

### Tool Categories (30+ Tools)

1. **Document Access & Editing** (4 tools)
   - readGoogleDoc, appendToGoogleDoc, insertText, deleteRange

2. **Formatting & Styling** (3 tools)
   - applyTextStyle, applyParagraphStyle, formatMatchingText (legacy)

3. **Document Structure** (5 tools)
   - insertTable, editTableCell, insertPageBreak, insertImageFromUrl, insertLocalImage

4. **Comment Management** (6 tools)
   - listComments, getComment, addComment, replyToComment, resolveComment, deleteComment

5. **Google Drive Integration** (12+ tools)
   - Discovery: listGoogleDocs, searchGoogleDocs, getRecentGoogleDocs, getDocumentInfo
   - Folders: createFolder, listFolderContents, getFolderInfo
   - File Operations: moveFile, copyFile, renameFile, deleteFile
   - Creation: createDocument, createFromTemplate

6. **Experimental/Stub Tools** (2 tools)
   - fixListFormatting, findElement (not implemented)

### Key Design Patterns

**Text Finding with Instance Support**
- The `findTextRange()` helper can find the Nth instance of text
- Handles text spanning multiple TextRun segments
- Maps text positions to document indices accurately

**Flexible Targeting**
- Tools support multiple targeting methods:
  - By exact index range (startIndex/endIndex)
  - By finding text (textToFind + matchInstance)
  - By index within paragraph (for paragraph operations)

**Batch Operations**
- All document modifications use Google's batchUpdate API
- Helper functions build proper request objects
- Error handling translates API errors to UserError

**Markdown Conversion**
- `readGoogleDoc` with format='markdown' converts Docs to markdown
- Preserves headings, lists, tables, bold, italic, links
- Handles nested structures and complex formatting

**Image Handling**
- `insertImageFromUrl` - Direct insertion from public URLs
- `insertLocalImage` - Uploads to Drive, makes public, then inserts
- Supports dimension specification and folder placement

## Important Implementation Details

### Index Handling
- Google Docs uses 1-based indexing (document starts at index 1)
- Ranges are [startIndex, endIndex) - start inclusive, end exclusive
- Text insertion happens before the specified index
- Always validate that endIndex > startIndex

### Authentication Flow
- First run requires manual authorization in browser
- User must be added as Test User in OAuth consent screen
- Token persists in `token.json` for subsequent runs
- Re-authorization needed if token expires or scopes change

### Error Handling
- Use `UserError` from FastMCP for client-facing errors
- API errors are translated to meaningful UserError messages
- Internal errors use standard Error class
- NotImplementedError indicates stub features

### Style Application
- Text styles: character-level formatting (bold, colors, fonts)
- Paragraph styles: block-level formatting (alignment, spacing, headings)
- Hex colors must be converted to RGB objects (0.0-1.0 range)
- Style requests use field masks to specify which properties to update

### Comment System
- Comments use Google Drive API (not Docs API)
- Comments are anchored to text ranges
- Support for replies, resolution, deletion
- `listComments` includes quoted text context for better UX

### Drive Integration
- Document discovery supports folders and search queries
- Template creation allows variable replacement ({{variable}})
- File operations maintain folder structure
- Search uses Drive API query syntax

## Common Development Patterns

### Adding a New Tool
1. Define Zod schema in types.ts or inline
2. Add tool definition in server.ts using `server.addTool()`
3. Implement helper functions in googleDocsApiHelpers.ts if complex
4. Handle errors with try/catch and UserError
5. Update documentation

### Working with Document Structure
1. Get document with appropriate fields parameter
2. Navigate body.content array for structural elements
3. Check element types (paragraph, table, sectionBreak, etc.)
4. Extract startIndex/endIndex for range operations

### Testing Changes
1. Build with `npm run build`
2. Run manually with `node ./dist/server.js`
3. Test authorization flow if scopes changed
4. Use Claude Desktop for integration testing
5. Check console.error logs for debugging (stdout is reserved for MCP)

## Security Considerations

### Critical Security Fixes Applied

**Date**: 2025-10-17
**Version**: Post-security-audit fixes

The following HIGH-severity security vulnerabilities have been fixed:

1. **Query Injection Prevention** (src/server.ts)
   - Added `escapeDriveQuery()` helper function to sanitize user inputs
   - All Drive API query strings now escape single quotes and backslashes
   - Prevents injection attacks in `listGoogleDocs`, `searchGoogleDocs`

2. **SSRF Protection** (src/googleDocsApiHelpers.ts:insertInlineImage)
   - URL protocol validation: Only HTTP/HTTPS allowed
   - Private IP blocking: Prevents access to localhost, 10.x.x.x, 192.168.x.x, 172.16-31.x.x, link-local addresses
   - Blocks internal network scanning attempts

3. **Path Traversal Prevention** (src/googleDocsApiHelpers.ts:uploadImageToDrive)
   - Validates paths don't contain '..' or '~' components
   - Uses path.resolve() to normalize paths
   - Verifies files are regular files (not directories/special files)
   - Only allows supported image formats

4. **Error Handler Removal** (src/server.ts)
   - Removed dangerous global uncaughtException and unhandledRejection handlers
   - Implements fail-fast security model
   - Individual tool error handlers provide proper error handling

### Remaining Security Concerns

- **credentials.json** contains OAuth client secrets (gitignored) - **PLAINTEXT**
- **token.json** contains user refresh tokens (gitignored) - **PLAINTEXT WARNING**
- Token storage is not encrypted - consider using OS keychain (keytar) for production
- Local image uploads are made publicly readable for document insertion
- Drive API has full access scope (`https://www.googleapis.com/auth/drive`)
- Consider using more restrictive scopes in production

### Secure Development Practices

1. **Never commit credentials or tokens** to version control
2. **Validate all user inputs** before using in API calls
3. **Use escapeDriveQuery()** for any user-controlled Drive API query strings
4. **Validate URLs** before fetching external resources
5. **Normalize file paths** before file system operations
6. **Log security events** to console.error for debugging

## Markdown Conversion Logic

The `convertDocsJsonToMarkdown()` function in googleDocsApiHelpers.ts handles complex document structure conversion:
- Recursively processes document elements
- Maintains formatting (bold, italic, code, links)
- Handles nested lists with proper indentation
- Converts tables to markdown table syntax
- Preserves heading hierarchy
- Uses context tracking for multi-line list items

## When Modifying This Codebase

1. **Changing Authentication Scopes**: Update SCOPES array in auth.ts, delete token.json, re-authorize
2. **Adding Document Operations**: Use batchUpdate pattern with executeBatchUpdate helper
3. **Text Finding**: Use findTextRange helper instead of reimplementing
4. **Style Changes**: Use style builder functions for proper field mask generation
5. **Drive Operations**: Most Drive features require Drive API client, not Docs client
6. **Error Messages**: Provide actionable guidance - include document IDs, indices, or text that failed

## File Structure Notes

- `dist/` - Compiled JavaScript (gitignored, regenerated on build)
- `tests/` - Test files using Node.js test runner
- `docs/` - Documentation website (separate from this file)
- `backup/` - Backup files (*.bak)
- Root files: credentials.json, token.json (gitignored), package.json, tsconfig.json

# Google Docs & Drive MCP Server

![Demo Animation](assets/google.docs.mcp.1.gif)

Connect Claude Desktop, Claude Code, or other MCP clients to your Google Docs and Google Drive!

> 🔥 **Check out [15 powerful tasks](SAMPLE_TASKS.md) you can accomplish with this server!**

A comprehensive MCP server providing 30+ tools for reading, writing, formatting Google Documents, managing Drive files, and handling comments—all through natural language commands.

## Key Features

**Documents:** Read, write, format text/paragraphs, insert tables/images, manage structure
**Drive:** List/search/create documents, manage folders, move/copy/rename/delete files
**Comments:** List, add, reply, resolve, and delete document comments
**Authentication:** Secure OAuth 2.0 with Google APIs

**Full feature list:** [SAMPLE_TASKS.md](SAMPLE_TASKS.md) | **Architecture:** [CLAUDE.md](CLAUDE.md)

---

## Prerequisites

- **Node.js 18+** and npm ([download](https://nodejs.org/))
- **Git** ([download](https://git-scm.com/downloads))
- **Google Account** with access to your documents
- **Claude Desktop or Claude Code** (optional, for MCP integration)

---

## Quick Setup

### 1. Google Cloud Credentials

Create OAuth credentials to access Google APIs:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create/select a project
3. Enable **Google Docs API** and **Google Drive API**
4. Configure OAuth Consent Screen:
   - User Type: **External**
   - Add scopes: `https://www.googleapis.com/auth/documents` and `https://www.googleapis.com/auth/drive`
   - Add yourself as Test User
5. Create Credentials → OAuth client ID → **Desktop app**
6. Download JSON → Rename to `credentials.json`

⚠️ **Keep `credentials.json` secure—never commit to version control!**

### 2. Install & Build

```bash
# Clone repository
git clone https://github.com/a-bonus/google-docs-mcp.git mcp-googledocs-server
cd mcp-googledocs-server

# Place credentials.json in this folder

# Install dependencies
npm install

# Build TypeScript
npm run build
```

### 3. First-Time Authorization

Run once to authenticate with Google:

```bash
node ./dist/server.js
```

1. Copy the authorization URL from terminal
2. Open in browser, sign in with your Google account
3. After allowing access, browser shows "can't be reached" (this is normal!)
4. Copy the code from URL bar (between `code=` and `&scope`)
5. Paste code into terminal

✅ You should see `token.json` created—keep this file secure!

---

## Integration with Claude

### Option 1: Claude Desktop

Edit your Claude Desktop config file:

**Config Location:**
- macOS: `~/Library/Application Support/Claude/mcp_config.json`
- Windows: `%APPDATA%\Claude\mcp_config.json`
- Linux: `~/.config/Claude/mcp_config.json`

**Add this configuration:**
```json
{
  "mcpServers": {
    "google-docs-mcp": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/mcp-googledocs-server/dist/server.js"],
      "env": {}
    }
  }
}
```

Replace `/ABSOLUTE/PATH/TO/` with your actual path (use `pwd` command to find it).

Restart Claude Desktop after saving.

### Option 2: Claude Code

Claude Code can connect to MCP servers through configuration:

1. **Open Claude Code settings** (use Command Palette: "Claude Code: Open Settings")

2. **Add MCP server configuration:**
   - Navigate to MCP Servers section
   - Click "Add Server"
   - Or edit `~/.config/claude-code/config.json` directly:

```json
{
  "mcpServers": {
    "google-docs-mcp": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/mcp-googledocs-server/dist/server.js"],
      "env": {}
    }
  }
}
```

3. **Restart Claude Code** or reload the window

4. **Verify connection:**
   - Type `/mcp` in Claude Code to see available servers
   - You should see "google-docs-mcp" listed with all available tools

**Using in Claude Code:**
```
"Use the google-docs-mcp server to read document ID abc123"
"List my recent Google Docs"
"Create a new document titled 'Meeting Notes'"
```

Claude Code will automatically launch the MCP server when needed.

---

## Usage Examples

**Get document ID:** Find the long string between `/d/` and `/edit` in your Google Doc URL.

**Basic operations:**
```
"Read document abc123"
"List my recent Google Docs"
"Create a new document titled 'Meeting Notes'"
"Append 'Hello World' to document abc123"
```

**Formatting:**
```
"Make the text 'Important' bold and red in document abc123"
"Center-align the paragraph containing 'Title' in document abc123"
"Insert a 3x4 table at index 500 in document abc123"
```

**Images:**
```
"Insert image from https://example.com/logo.png at index 100"
"Upload /path/to/chart.png and insert at index 200"
```

**Comments:**
```
"List all comments in document abc123"
"Add comment 'Needs review' to text at indices 50-100"
```

See [SAMPLE_TASKS.md](SAMPLE_TASKS.md) for 15 detailed task examples.

---

## Troubleshooting

**MCP connection issues:**
- Verify absolute path in config file is correct
- Ensure `npm run build` completed and `dist/` folder exists
- Test manually: `node /path/to/dist/server.js`
- Check Claude logs for detailed errors

**Authorization errors:**
- Confirm Google Docs & Drive APIs are enabled
- Verify your email is added as Test User
- Check `credentials.json` is in project root
- Delete `token.json` and re-authorize if needed

**Security Notes:**
- `credentials.json` and `token.json` are git-ignored automatically
- Consider using system keychain for production deployments
- See [CLAUDE.md](CLAUDE.md) for security audit details

---

## Documentation

- **[SAMPLE_TASKS.md](SAMPLE_TASKS.md)** - 15 example tasks you can accomplish
- **[CLAUDE.md](CLAUDE.md)** - Detailed architecture and security information
- **[vscode.md](vscode.md)** - VS Code MCP extension setup

## License

MIT License - See LICENSE file for details.

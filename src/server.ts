// src/server.ts
import { FastMCP } from 'fastmcp';

// Import client management functions
import { initializeGoogleClient } from './clients/googleClients.js';

// Import tool classes
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

// SECURITY NOTE: Previously had global error handlers here that suppressed all exceptions.
// This was dangerous as it could mask security violations and attacks.
// Error handlers removed for fail-fast security model. Individual tool error handlers
// provide appropriate error handling without suppressing critical failures.

const server = new FastMCP({
  name: 'Ultimate Google Docs MCP Server',
  version: '1.0.0'
});

// Register all tools from tool classes
DocumentTools.registerTools(server);
FormattingTools.registerTools(server);
StructureTools.registerTools(server);
TableTools.registerTools(server);
CommentTools.registerTools(server);
DriveTools.registerTools(server);
ChatTools.registerTools(server);
CalendarTools.registerTools(server);
GmailTools.registerTools(server);

// --- Server Startup ---
async function startServer() {
  try {
    await initializeGoogleClient(); // Authorize BEFORE starting listeners
    console.error("Starting Ultimate Google Docs MCP server...");

    // Using stdio as before
    const configToUse = {
      transportType: "stdio" as const,
    };

    // Start the server with proper error handling
    server.start(configToUse);
    console.error(`MCP Server running using ${configToUse.transportType}. Awaiting client connection...`);

  } catch(startError: any) {
    console.error("FATAL: Server failed to start:", startError.message || startError);
    process.exit(1);
  }
}

startServer(); // Removed .catch here, let errors propagate if startup fails critically
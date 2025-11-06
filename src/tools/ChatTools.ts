// src/tools/ChatTools.ts
import { FastMCP, UserError } from 'fastmcp';
import { z } from 'zod';
import { getChatClient } from '../clients/googleClients.js';
import * as GChatHelpers from '../googleChatApiHelpers.js';

/**
 * Google Chat Tools class - handles all Google Chat operations
 * Includes: list spaces, get space, list messages, get message
 */
export class ChatTools {
    /**
     * Register all Chat tools with the MCP server
     */
    static registerTools(server: FastMCP) {
        this.registerListChatSpacesTool(server);
        this.registerGetChatSpaceTool(server);
        this.registerListChatMessagesTool(server);
        this.registerGetChatMessageTool(server);
    }

    private static registerListChatSpacesTool(server: FastMCP) {
        server.addTool({
            name: 'listChatSpaces',
            description: 'Lists Google Chat spaces (rooms and DMs) that the authenticated user has access to.',
            parameters: z.object({
                pageSize: z.number().int().min(1).max(100).optional().default(50).describe('Maximum number of spaces to return (1-100).'),
                pageToken: z.string().optional().describe('Token for pagination. Use the nextPageToken from a previous response to get the next page.'),
                filter: z.string().optional().describe('Optional filter string (e.g., "spaceType = SPACE" for rooms only or "spaceType = DIRECT_MESSAGE" for DMs only).'),
            }),
            execute: async (args, { log }) => {
                const chat = await getChatClient();
                log.info(`Listing Chat spaces. PageSize: ${args.pageSize}, Filter: ${args.filter || 'none'}`);

                try {
                    const result = await GChatHelpers.listSpaces(chat, args.pageSize, args.pageToken, args.filter);
                    const spaces = result.spaces;

                    if (spaces.length === 0) {
                        return "No Chat spaces found. You may not have access to any spaces or they don't match the filter criteria.";
                    }

                    let output = `Found ${spaces.length} Google Chat space${spaces.length !== 1 ? 's' : ''}:\n\n`;

                    spaces.forEach((space, index) => {
                        output += `${index + 1}. ${GChatHelpers.formatSpaceDetails(space)}\n`;
                    });

                    if (result.nextPageToken) {
                        output += `\n**More results available.** Use pageToken="${result.nextPageToken}" to get the next page.`;
                    }

                    return output;
                } catch (error: any) {
                    log.error(`Error listing Chat spaces: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to list Chat spaces: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerGetChatSpaceTool(server: FastMCP) {
        server.addTool({
            name: 'getChatSpace',
            description: 'Gets detailed information about a specific Google Chat space (room or DM).',
            parameters: z.object({
                spaceName: z.string().describe('The resource name of the space (e.g., "spaces/SPACE_ID"). You can get this from listChatSpaces.'),
            }),
            execute: async (args, { log }) => {
                const chat = await getChatClient();
                log.info(`Getting Chat space details: ${args.spaceName}`);

                try {
                    // Validate space name format
                    if (!GChatHelpers.validateSpaceName(args.spaceName)) {
                        throw new UserError(`Invalid space name format: ${args.spaceName}. Expected format: "spaces/SPACE_ID"`);
                    }

                    const space = await GChatHelpers.getSpace(chat, args.spaceName);

                    let output = '**Google Chat Space Details:**\n\n';
                    output += GChatHelpers.formatSpaceDetails(space);

                    // Add additional details
                    if (space.spaceDetails?.description) {
                        output += `\n**Description:** ${space.spaceDetails.description}`;
                    }

                    if (space.spaceDetails?.guidelines) {
                        output += `\n**Guidelines:** ${space.spaceDetails.guidelines}`;
                    }

                    return output;
                } catch (error: any) {
                    log.error(`Error getting Chat space: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to get Chat space: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerListChatMessagesTool(server: FastMCP) {
        server.addTool({
            name: 'listChatMessages',
            description: 'Lists messages from a specific Google Chat space. Returns recent messages with sender information and content.',
            parameters: z.object({
                spaceName: z.string().describe('The resource name of the space (e.g., "spaces/SPACE_ID"). Get this from listChatSpaces.'),
                pageSize: z.number().int().min(1).max(100).optional().default(25).describe('Maximum number of messages to return (1-100).'),
                pageToken: z.string().optional().describe('Token for pagination. Use the nextPageToken from a previous response.'),
                orderBy: z.string().optional().describe('Ordering of messages. Use "createTime desc" for newest first (default) or "createTime asc" for oldest first.'),
                filter: z.string().optional().describe('Optional filter string for messages.'),
            }),
            execute: async (args, { log }) => {
                const chat = await getChatClient();
                log.info(`Listing messages in Chat space: ${args.spaceName}`);

                try {
                    // Validate space name format
                    if (!GChatHelpers.validateSpaceName(args.spaceName)) {
                        throw new UserError(`Invalid space name format: ${args.spaceName}. Expected format: "spaces/SPACE_ID"`);
                    }

                    const result = await GChatHelpers.listMessages(
                        chat,
                        args.spaceName,
                        args.pageSize,
                        args.pageToken,
                        args.orderBy,
                        args.filter
                    );

                    const messages = result.messages;

                    if (messages.length === 0) {
                        return `No messages found in space ${args.spaceName}. The space may be empty or you may not have permission to read messages.`;
                    }

                    let output = `Found ${messages.length} message${messages.length !== 1 ? 's' : ''} in space:\n\n`;

                    messages.forEach((message, index) => {
                        output += `${index + 1}. ${GChatHelpers.formatMessageDetails(message)}\n`;
                    });

                    if (result.nextPageToken) {
                        output += `\n**More messages available.** Use pageToken="${result.nextPageToken}" to get the next page.`;
                    }

                    return output;
                } catch (error: any) {
                    log.error(`Error listing Chat messages: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to list Chat messages: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerGetChatMessageTool(server: FastMCP) {
        server.addTool({
            name: 'getChatMessage',
            description: 'Gets the full details of a specific message from Google Chat, including complete text content and metadata.',
            parameters: z.object({
                messageName: z.string().describe('The resource name of the message (e.g., "spaces/SPACE_ID/messages/MESSAGE_ID"). Get this from listChatMessages.'),
            }),
            execute: async (args, { log }) => {
                const chat = await getChatClient();
                log.info(`Getting Chat message: ${args.messageName}`);

                try {
                    // Validate message name format
                    if (!GChatHelpers.validateMessageName(args.messageName)) {
                        throw new UserError(`Invalid message name format: ${args.messageName}. Expected format: "spaces/SPACE_ID/messages/MESSAGE_ID"`);
                    }

                    const message = await GChatHelpers.getMessage(chat, args.messageName);

                    let output = '**Google Chat Message Details:**\n\n';
                    output += GChatHelpers.formatMessageDetails(message);

                    // Add full text content
                    const fullText = GChatHelpers.extractMessageText(message);
                    if (fullText !== '[No text content]') {
                        output += `\n**Full Text Content:**\n${fullText}\n`;
                    }

                    // Add attachment details if present
                    if (message.attachment && message.attachment.length > 0) {
                        output += `\n**Attachments:**\n`;
                        message.attachment.forEach((attachment, index) => {
                            output += `${index + 1}. ${attachment.name || 'Unnamed attachment'}\n`;
                            if (attachment.contentType) {
                                output += `   Type: ${attachment.contentType}\n`;
                            }
                            if (attachment.source) {
                                output += `   Source: ${attachment.source}\n`;
                            }
                        });
                    }

                    return output;
                } catch (error: any) {
                    log.error(`Error getting Chat message: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to get Chat message: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }
}

// src/tools/GmailTools.ts
import { FastMCP, UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../clients/googleClients.js';
import * as GmailHelpers from '../gmailHelpers.js';
import {
    ListEmailsParameters,
    GetEmailParameters,
    SearchEmailsParameters,
    ArchiveEmailParameters,
    ModifyEmailLabelsParameters,
    MarkEmailParameters,
    CreateLabelParameters,
    DeleteLabelParameters
} from '../types.js';

/**
 * Gmail Tools class - handles all Gmail operations
 * Includes: list, get, search emails; archive; modify labels; mark emails; manage labels
 */
export class GmailTools {
    /**
     * Register all Gmail tools with the MCP server
     */
    static registerTools(server: FastMCP) {
        this.registerListEmailsTool(server);
        this.registerGetEmailTool(server);
        this.registerSearchEmailsTool(server);
        this.registerArchiveEmailTool(server);
        this.registerModifyEmailLabelsTool(server);
        this.registerMarkEmailTool(server);
        this.registerListLabelsTool(server);
        this.registerCreateLabelTool(server);
        this.registerDeleteLabelTool(server);
    }

    private static registerListEmailsTool(server: FastMCP) {
        server.addTool({
            name: 'listEmails',
            description: 'Lists emails from Gmail inbox with optional filtering. Perfect for getting an overview of your emails.',
            parameters: ListEmailsParameters,
            execute: async (args, { log }) => {
                const gmail = await getGmailClient();
                log.info(`Listing emails. Max: ${args.maxResults}, Labels: ${args.labelIds?.join(',') || 'none'}, Query: ${args.query || 'none'}`);

                try {
                    // Validate query if provided
                    if (args.query) {
                        GmailHelpers.validateGmailQuery(args.query);
                    }

                    const response = await gmail.users.messages.list({
                        userId: 'me',
                        maxResults: args.maxResults,
                        pageToken: args.pageToken,
                        labelIds: args.labelIds,
                        q: args.query,
                        includeSpamTrash: args.includeSpamTrash,
                    });

                    const messages = response.data.messages || [];

                    if (messages.length === 0) {
                        return 'No emails found matching your criteria.';
                    }

                    // Fetch full message details for all messages
                    log.info(`Fetching details for ${messages.length} messages...`);
                    const fullMessages = await Promise.all(
                        messages.map(msg =>
                            gmail.users.messages.get({
                                userId: 'me',
                                id: msg.id!,
                                format: 'metadata',
                                metadataHeaders: ['From', 'To', 'Subject', 'Date'],
                            })
                        )
                    );

                    let result = `Found ${messages.length} email${messages.length !== 1 ? 's' : ''}:\n\n`;

                    fullMessages.forEach((msgResponse, index) => {
                        const formatted = GmailHelpers.formatEmail(msgResponse.data, false);
                        result += `${index + 1}. **${formatted.subject}**\n`;
                        result += `   From: ${formatted.from}\n`;
                        result += `   Date: ${formatted.date}\n`;
                        result += `   ${formatted.isUnread ? '🔵 UNREAD' : ''}${formatted.isStarred ? ' ⭐ STARRED' : ''}${formatted.hasAttachments ? ' 📎 HAS ATTACHMENTS' : ''}\n`;
                        result += `   Preview: ${formatted.snippet}\n`;
                        result += `   Message ID: ${formatted.id}\n\n`;
                    });

                    if (response.data.nextPageToken) {
                        result += `\n**More emails available.** Use pageToken="${response.data.nextPageToken}" to get the next page.`;
                    }

                    return result;
                } catch (error: any) {
                    log.error(`Error listing emails: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    if (error.code === 403) throw new UserError('Permission denied. Make sure you have granted Gmail access.');
                    throw new UserError(`Failed to list emails: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerGetEmailTool(server: FastMCP) {
        server.addTool({
            name: 'getEmail',
            description: 'Gets the full content of a specific email, including the complete body text.',
            parameters: GetEmailParameters,
            execute: async (args, { log }) => {
                const gmail = await getGmailClient();
                log.info(`Getting email ${args.messageId} with format ${args.format}`);

                try {
                    const response = await gmail.users.messages.get({
                        userId: 'me',
                        id: args.messageId,
                        format: args.format,
                    });

                    const message = response.data;
                    const formatted = GmailHelpers.formatEmail(message, args.format === 'full');

                    let result = `**Email Details:**\n\n`;
                    result += `**Subject:** ${formatted.subject}\n`;
                    result += `**From:** ${formatted.from}\n`;
                    result += `**To:** ${formatted.to}\n`;
                    result += `**Date:** ${formatted.date}\n`;
                    result += `**Message ID:** ${formatted.id}\n`;
                    result += `**Thread ID:** ${formatted.threadId}\n`;
                    result += `**Labels:** ${formatted.labels.join(', ') || 'None'}\n`;
                    result += `**Status:** ${formatted.isUnread ? 'Unread' : 'Read'}${formatted.isStarred ? ', Starred' : ''}\n\n`;

                    if (formatted.hasAttachments) {
                        result += `**📎 This email has attachments**\n\n`;
                    }

                    if (args.format === 'full' && formatted.body) {
                        result += `**Body:**\n${formatted.body}\n`;
                    } else {
                        result += `**Preview:**\n${formatted.snippet}\n`;
                    }

                    return result;
                } catch (error: any) {
                    log.error(`Error getting email: ${error.message || error}`);
                    if (error.code === 404) throw new UserError(`Email not found (ID: ${args.messageId}).`);
                    if (error.code === 403) throw new UserError('Permission denied. Make sure you have access to this email.');
                    throw new UserError(`Failed to get email: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerSearchEmailsTool(server: FastMCP) {
        server.addTool({
            name: 'searchEmails',
            description: 'Searches emails using Gmail search syntax (e.g., "from:user@example.com subject:report", "is:unread has:attachment", "after:2024/01/01").',
            parameters: SearchEmailsParameters,
            execute: async (args, { log }) => {
                const gmail = await getGmailClient();
                log.info(`Searching emails with query: "${args.query}"`);

                try {
                    // Validate query
                    GmailHelpers.validateGmailQuery(args.query);

                    const response = await gmail.users.messages.list({
                        userId: 'me',
                        q: args.query,
                        maxResults: args.maxResults,
                        pageToken: args.pageToken,
                    });

                    const messages = response.data.messages || [];

                    if (messages.length === 0) {
                        return `No emails found matching query: "${args.query}"`;
                    }

                    // Fetch full message details
                    log.info(`Fetching details for ${messages.length} messages...`);
                    const fullMessages = await Promise.all(
                        messages.map(msg =>
                            gmail.users.messages.get({
                                userId: 'me',
                                id: msg.id!,
                                format: 'metadata',
                                metadataHeaders: ['From', 'To', 'Subject', 'Date'],
                            })
                        )
                    );

                    let result = `Found ${messages.length} email${messages.length !== 1 ? 's' : ''} matching "${args.query}":\n\n`;

                    fullMessages.forEach((msgResponse, index) => {
                        const formatted = GmailHelpers.formatEmail(msgResponse.data, false);
                        result += `${index + 1}. **${formatted.subject}**\n`;
                        result += `   From: ${formatted.from}\n`;
                        result += `   Date: ${formatted.date}\n`;
                        result += `   ${formatted.isUnread ? '🔵 UNREAD' : ''}${formatted.isStarred ? ' ⭐ STARRED' : ''}\n`;
                        result += `   Preview: ${formatted.snippet}\n`;
                        result += `   Message ID: ${formatted.id}\n\n`;
                    });

                    if (response.data.nextPageToken) {
                        result += `\n**More results available.** Use pageToken="${response.data.nextPageToken}" to get the next page.`;
                    }

                    return result;
                } catch (error: any) {
                    log.error(`Error searching emails: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to search emails: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerArchiveEmailTool(server: FastMCP) {
        server.addTool({
            name: 'archiveEmail',
            description: 'Archives one or more emails (removes them from Inbox). They remain searchable and accessible. Uses efficient batch API for up to 1000 emails per call.',
            parameters: ArchiveEmailParameters,
            execute: async (args, { log }) => {
                const gmail = await getGmailClient();
                log.info(`Archiving ${args.messageIds.length} email(s) using batch API`);

                try {
                    // Use batch modify for efficiency (max 1000 messages per batch)
                    if (args.messageIds.length > 1000) {
                        throw new UserError('Cannot archive more than 1000 emails at once. Please split into smaller batches.');
                    }

                    // Archive by removing INBOX label using batch API
                    await GmailHelpers.batchModifyMessages(
                        gmail,
                        args.messageIds,
                        undefined, // no labels to add
                        ['INBOX']  // remove INBOX label
                    );

                    return `Successfully archived ${args.messageIds.length} email${args.messageIds.length !== 1 ? 's' : ''} in a single batch operation.`;
                } catch (error: any) {
                    log.error(`Error archiving emails: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to archive emails: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerModifyEmailLabelsTool(server: FastMCP) {
        server.addTool({
            name: 'modifyEmailLabels',
            description: 'Adds or removes labels from one or more emails. Use for organizing emails with custom labels. Uses efficient batch API for up to 1000 emails per call.',
            parameters: ModifyEmailLabelsParameters,
            execute: async (args, { log }) => {
                const gmail = await getGmailClient();
                log.info(`Modifying labels for ${args.messageIds.length} email(s) using batch API. Add: ${args.addLabelIds?.join(',') || 'none'}, Remove: ${args.removeLabelIds?.join(',') || 'none'}`);

                try {
                    // Use batch modify for efficiency (max 1000 messages per batch)
                    if (args.messageIds.length > 1000) {
                        throw new UserError('Cannot modify labels for more than 1000 emails at once. Please split into smaller batches.');
                    }

                    await GmailHelpers.batchModifyMessages(
                        gmail,
                        args.messageIds,
                        args.addLabelIds,
                        args.removeLabelIds
                    );

                    let result = `Successfully modified labels for ${args.messageIds.length} email${args.messageIds.length !== 1 ? 's' : ''} in a single batch operation.`;

                    if (args.addLabelIds && args.addLabelIds.length > 0) {
                        result += `\nAdded: ${args.addLabelIds.join(', ')}`;
                    }
                    if (args.removeLabelIds && args.removeLabelIds.length > 0) {
                        result += `\nRemoved: ${args.removeLabelIds.join(', ')}`;
                    }

                    return result;
                } catch (error: any) {
                    log.error(`Error modifying labels: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to modify labels: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerMarkEmailTool(server: FastMCP) {
        server.addTool({
            name: 'markEmail',
            description: 'Marks one or more emails as read/unread, starred/unstarred, or important/not important. Uses efficient batch API for up to 1000 emails per call.',
            parameters: MarkEmailParameters,
            execute: async (args, { log }) => {
                const gmail = await getGmailClient();
                log.info(`Marking ${args.messageIds.length} email(s) as ${args.markAs} using batch API`);

                try {
                    // Use batch modify for efficiency (max 1000 messages per batch)
                    if (args.messageIds.length > 1000) {
                        throw new UserError('Cannot mark more than 1000 emails at once. Please split into smaller batches.');
                    }

                    const labelChanges = GmailHelpers.getLabelsForMarkAs(args.markAs);

                    await GmailHelpers.batchModifyMessages(
                        gmail,
                        args.messageIds,
                        labelChanges.add.length > 0 ? labelChanges.add : undefined,
                        labelChanges.remove.length > 0 ? labelChanges.remove : undefined
                    );

                    return `Successfully marked ${args.messageIds.length} email${args.messageIds.length !== 1 ? 's' : ''} as ${args.markAs} in a single batch operation.`;
                } catch (error: any) {
                    log.error(`Error marking emails: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to mark emails: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerListLabelsTool(server: FastMCP) {
        server.addTool({
            name: 'listLabels',
            description: 'Lists all Gmail labels (folders) available for organizing emails.',
            parameters: z.object({}),
            execute: async (args, { log }) => {
                const gmail = await getGmailClient();
                log.info('Listing Gmail labels');

                try {
                    const response = await gmail.users.labels.list({
                        userId: 'me',
                    });

                    const labels = response.data.labels || [];

                    if (labels.length === 0) {
                        return 'No labels found.';
                    }

                    // Separate system labels from user labels
                    const systemLabels = labels.filter(l => l.type === 'system');
                    const userLabels = labels.filter(l => l.type === 'user');

                    let result = `Found ${labels.length} label${labels.length !== 1 ? 's' : ''}:\n\n`;

                    if (systemLabels.length > 0) {
                        result += `**System Labels (${systemLabels.length}):**\n`;
                        systemLabels.forEach(label => {
                            result += `  - ${label.name} (ID: ${label.id})\n`;
                        });
                        result += '\n';
                    }

                    if (userLabels.length > 0) {
                        result += `**User Labels (${userLabels.length}):**\n`;
                        userLabels.forEach(label => {
                            result += `  - ${label.name} (ID: ${label.id})\n`;
                        });
                    }

                    return result;
                } catch (error: any) {
                    log.error(`Error listing labels: ${error.message || error}`);
                    throw new UserError(`Failed to list labels: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerCreateLabelTool(server: FastMCP) {
        server.addTool({
            name: 'createLabel',
            description: 'Creates a new custom label (folder) for organizing emails.',
            parameters: CreateLabelParameters,
            execute: async (args, { log }) => {
                const gmail = await getGmailClient();
                log.info(`Creating label "${args.name}"`);

                try {
                    const response = await gmail.users.labels.create({
                        userId: 'me',
                        requestBody: {
                            name: args.name,
                            labelListVisibility: args.labelListVisibility,
                            messageListVisibility: args.messageListVisibility,
                        },
                    });

                    const label = response.data;
                    return `Successfully created label "${label.name}" (ID: ${label.id})`;
                } catch (error: any) {
                    log.error(`Error creating label: ${error.message || error}`);
                    if (error.code === 409) throw new UserError(`A label named "${args.name}" already exists.`);
                    throw new UserError(`Failed to create label: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerDeleteLabelTool(server: FastMCP) {
        server.addTool({
            name: 'deleteLabel',
            description: 'Deletes a custom label. Emails with this label will not be deleted, only the label itself.',
            parameters: DeleteLabelParameters,
            execute: async (args, { log }) => {
                const gmail = await getGmailClient();
                log.info(`Deleting label ${args.labelId}`);

                try {
                    // Get label details first
                    const labelInfo = await gmail.users.labels.get({
                        userId: 'me',
                        id: args.labelId,
                    });

                    const labelName = labelInfo.data.name;
                    const labelType = labelInfo.data.type;

                    if (labelType === 'system') {
                        throw new UserError(`Cannot delete system label "${labelName}". Only user-created labels can be deleted.`);
                    }

                    await gmail.users.labels.delete({
                        userId: 'me',
                        id: args.labelId,
                    });

                    return `Successfully deleted label "${labelName}" (ID: ${args.labelId})`;
                } catch (error: any) {
                    log.error(`Error deleting label: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    if (error.code === 404) throw new UserError(`Label not found (ID: ${args.labelId}).`);
                    throw new UserError(`Failed to delete label: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }
}

// src/tools/CommentTools.ts
import { FastMCP, UserError } from 'fastmcp';
import { z } from 'zod';
import { google } from 'googleapis';
import { getDocsClient, getDriveClient, getAuthClient } from '../clients/googleClients.js';
import { DocumentIdParameter } from '../types.js';

/**
 * Comment Tools class - handles all comment operations
 * Includes: list, get, add, reply, resolve, delete comments
 */
export class CommentTools {
    /**
     * Register all comment tools with the MCP server
     */
    static registerTools(server: FastMCP) {
        this.registerListCommentsTool(server);
        this.registerGetCommentTool(server);
        this.registerAddCommentTool(server);
        this.registerReplyToCommentTool(server);
        this.registerResolveCommentTool(server);
        this.registerDeleteCommentTool(server);
    }

    private static registerListCommentsTool(server: FastMCP) {
        server.addTool({
            name: 'listComments',
            description: 'Lists all comments in a Google Document.',
            parameters: DocumentIdParameter,
            execute: async (args, { log }) => {
                log.info(`Listing comments for document ${args.documentId}`);
                const docsClient = await getDocsClient();
                const driveClient = await getDriveClient();
                const authClient = getAuthClient();

                try {
                    // First get the document to have context
                    const doc = await docsClient.documents.get({ documentId: args.documentId });

                    // Use Drive API v3 with proper fields to get quoted content
                    const drive = google.drive({ version: 'v3', auth: authClient! });
                    const response = await drive.comments.list({
                        fileId: args.documentId,
                        fields: 'comments(id,content,quotedFileContent,author,createdTime,resolved)',
                        pageSize: 100
                    });

                    const comments = response.data.comments || [];

                    if (comments.length === 0) {
                        return 'No comments found in this document.';
                    }

                    // Format comments for display
                    const formattedComments = comments.map((comment: any, index: number) => {
                        const replies = comment.replies?.length || 0;
                        const status = comment.resolved ? ' [RESOLVED]' : '';
                        const author = comment.author?.displayName || 'Unknown';
                        const date = comment.createdTime ? new Date(comment.createdTime).toLocaleDateString() : 'Unknown date';

                        // Get the actual quoted text content
                        const quotedText = comment.quotedFileContent?.value || 'No quoted text';
                        const anchor = quotedText !== 'No quoted text' ? ` (anchored to: "${quotedText.substring(0, 100)}${quotedText.length > 100 ? '...' : ''}")` : '';

                        let result = `\n${index + 1}. **${author}** (${date})${status}${anchor}\n   ${comment.content}`;

                        if (replies > 0) {
                            result += `\n   └─ ${replies} ${replies === 1 ? 'reply' : 'replies'}`;
                        }

                        result += `\n   Comment ID: ${comment.id}`;

                        return result;
                    }).join('\n');

                    return `Found ${comments.length} comment${comments.length === 1 ? '' : 's'}:\n${formattedComments}`;

                } catch (error: any) {
                    log.error(`Error listing comments: ${error.message || error}`);
                    throw new UserError(`Failed to list comments: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerGetCommentTool(server: FastMCP) {
        server.addTool({
            name: 'getComment',
            description: 'Gets a specific comment with its full thread of replies.',
            parameters: DocumentIdParameter.extend({
                commentId: z.string().describe('The ID of the comment to retrieve')
            }),
            execute: async (args, { log }) => {
                log.info(`Getting comment ${args.commentId} from document ${args.documentId}`);
                const authClient = getAuthClient();

                try {
                    const drive = google.drive({ version: 'v3', auth: authClient! });
                    const response = await drive.comments.get({
                        fileId: args.documentId,
                        commentId: args.commentId,
                        fields: 'id,content,quotedFileContent,author,createdTime,resolved,replies(id,content,author,createdTime)'
                    });

                    const comment = response.data;
                    const author = comment.author?.displayName || 'Unknown';
                    const date = comment.createdTime ? new Date(comment.createdTime).toLocaleDateString() : 'Unknown date';
                    const status = comment.resolved ? ' [RESOLVED]' : '';
                    const quotedText = comment.quotedFileContent?.value || 'No quoted text';
                    const anchor = quotedText !== 'No quoted text' ? `\nAnchored to: "${quotedText}"` : '';

                    let result = `**${author}** (${date})${status}${anchor}\n${comment.content}`;

                    // Add replies if any
                    if (comment.replies && comment.replies.length > 0) {
                        result += '\n\n**Replies:**';
                        comment.replies.forEach((reply: any, index: number) => {
                            const replyAuthor = reply.author?.displayName || 'Unknown';
                            const replyDate = reply.createdTime ? new Date(reply.createdTime).toLocaleDateString() : 'Unknown date';
                            result += `\n${index + 1}. **${replyAuthor}** (${replyDate})\n   ${reply.content}`;
                        });
                    }

                    return result;

                } catch (error: any) {
                    log.error(`Error getting comment: ${error.message || error}`);
                    throw new UserError(`Failed to get comment: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerAddCommentTool(server: FastMCP) {
        server.addTool({
            name: 'addComment',
            description: 'Adds a comment anchored to a specific text range in the document.',
            parameters: DocumentIdParameter.extend({
                startIndex: z.number().int().min(1).describe('The starting index of the text range (inclusive, starts from 1).'),
                endIndex: z.number().int().min(1).describe('The ending index of the text range (exclusive).'),
                commentText: z.string().min(1).describe('The content of the comment.'),
            }).refine(data => data.endIndex > data.startIndex, {
                message: 'endIndex must be greater than startIndex',
                path: ['endIndex'],
            }),
            execute: async (args, { log }) => {
                log.info(`Adding comment to range ${args.startIndex}-${args.endIndex} in doc ${args.documentId}`);

                try {
                    // First, get the text content that will be quoted
                    const docsClient = await getDocsClient();
                    const doc = await docsClient.documents.get({ documentId: args.documentId });

                    // Extract the quoted text from the document
                    let quotedText = '';
                    const content = doc.data.body?.content || [];

                    for (const element of content) {
                        if (element.paragraph) {
                            const elements = element.paragraph.elements || [];
                            for (const textElement of elements) {
                                if (textElement.textRun) {
                                    const elementStart = textElement.startIndex || 0;
                                    const elementEnd = textElement.endIndex || 0;

                                    // Check if this element overlaps with our range
                                    if (elementEnd > args.startIndex && elementStart < args.endIndex) {
                                        const text = textElement.textRun.content || '';
                                        const startOffset = Math.max(0, args.startIndex - elementStart);
                                        const endOffset = Math.min(text.length, args.endIndex - elementStart);
                                        quotedText += text.substring(startOffset, endOffset);
                                    }
                                }
                            }
                        }
                    }

                    // Use Drive API v3 for comments
                    const authClient = getAuthClient();
                    const drive = google.drive({ version: 'v3', auth: authClient! });

                    const response = await drive.comments.create({
                        fileId: args.documentId,
                        requestBody: {
                            content: args.commentText,
                            quotedFileContent: {
                                value: quotedText,
                                mimeType: 'text/html'
                            },
                            anchor: JSON.stringify({
                                r: args.documentId,
                                a: [{
                                    txt: {
                                        o: args.startIndex - 1,  // Drive API uses 0-based indexing
                                        l: args.endIndex - args.startIndex,
                                        ml: args.endIndex - args.startIndex
                                    }
                                }]
                            })
                        }
                    });

                    return `Comment added successfully. Comment ID: ${response.data.id}`;

                } catch (error: any) {
                    log.error(`Error adding comment: ${error.message || error}`);
                    throw new UserError(`Failed to add comment: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerReplyToCommentTool(server: FastMCP) {
        server.addTool({
            name: 'replyToComment',
            description: 'Adds a reply to an existing comment.',
            parameters: DocumentIdParameter.extend({
                commentId: z.string().describe('The ID of the comment to reply to'),
                replyText: z.string().min(1).describe('The content of the reply')
            }),
            execute: async (args, { log }) => {
                log.info(`Adding reply to comment ${args.commentId} in doc ${args.documentId}`);
                const authClient = getAuthClient();

                try {
                    const drive = google.drive({ version: 'v3', auth: authClient! });

                    const response = await drive.replies.create({
                        fileId: args.documentId,
                        commentId: args.commentId,
                        fields: 'id,content,author,createdTime',
                        requestBody: {
                            content: args.replyText
                        }
                    });

                    return `Reply added successfully. Reply ID: ${response.data.id}`;

                } catch (error: any) {
                    log.error(`Error adding reply: ${error.message || error}`);
                    throw new UserError(`Failed to add reply: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerResolveCommentTool(server: FastMCP) {
        server.addTool({
            name: 'resolveComment',
            description: 'Marks a comment as resolved.',
            parameters: DocumentIdParameter.extend({
                commentId: z.string().describe('The ID of the comment to resolve')
            }),
            execute: async (args, { log }) => {
                log.info(`Resolving comment ${args.commentId} in doc ${args.documentId}`);
                const authClient = getAuthClient();

                try {
                    const drive = google.drive({ version: 'v3', auth: authClient! });

                    await drive.comments.update({
                        fileId: args.documentId,
                        commentId: args.commentId,
                        requestBody: {
                            resolved: true
                        }
                    });

                    return `Comment ${args.commentId} has been resolved.`;

                } catch (error: any) {
                    log.error(`Error resolving comment: ${error.message || error}`);
                    throw new UserError(`Failed to resolve comment: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerDeleteCommentTool(server: FastMCP) {
        server.addTool({
            name: 'deleteComment',
            description: 'Deletes a comment from the document.',
            parameters: DocumentIdParameter.extend({
                commentId: z.string().describe('The ID of the comment to delete')
            }),
            execute: async (args, { log }) => {
                log.info(`Deleting comment ${args.commentId} from doc ${args.documentId}`);
                const authClient = getAuthClient();

                try {
                    const drive = google.drive({ version: 'v3', auth: authClient! });

                    await drive.comments.delete({
                        fileId: args.documentId,
                        commentId: args.commentId
                    });

                    return `Comment ${args.commentId} has been deleted.`;

                } catch (error: any) {
                    log.error(`Error deleting comment: ${error.message || error}`);
                    throw new UserError(`Failed to delete comment: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }
}
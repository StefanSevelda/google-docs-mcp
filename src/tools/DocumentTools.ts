// src/tools/DocumentTools.ts
import { FastMCP, UserError } from 'fastmcp';
import { z } from 'zod';
import { docs_v1 } from 'googleapis';
import { getDocsClient } from '../clients/googleClients.js';
import { DocumentIdParameter, NotImplementedError } from '../types.js';
import * as GDocsHelpers from '../googleDocsApiHelpers.js';

/**
 * Helper functions for markdown conversion
 */
function convertDocsJsonToMarkdown(docData: any): string {
    let markdown = '';

    if (!docData.body?.content) {
        return 'Document appears to be empty.';
    }

    docData.body.content.forEach((element: any) => {
        if (element.paragraph) {
            markdown += convertParagraphToMarkdown(element.paragraph);
        } else if (element.table) {
            markdown += convertTableToMarkdown(element.table);
        } else if (element.sectionBreak) {
            markdown += '\n---\n\n';
        }
    });

    return markdown.trim();
}

function convertParagraphToMarkdown(paragraph: any): string {
    let text = '';
    let isHeading = false;
    let headingLevel = 0;
    let isList = false;

    if (paragraph.paragraphStyle?.namedStyleType) {
        const styleType = paragraph.paragraphStyle.namedStyleType;
        if (styleType.startsWith('HEADING_')) {
            isHeading = true;
            headingLevel = parseInt(styleType.replace('HEADING_', ''));
        } else if (styleType === 'TITLE') {
            isHeading = true;
            headingLevel = 1;
        } else if (styleType === 'SUBTITLE') {
            isHeading = true;
            headingLevel = 2;
        }
    }

    if (paragraph.bullet) {
        isList = true;
    }

    if (paragraph.elements) {
        paragraph.elements.forEach((element: any) => {
            if (element.textRun) {
                text += convertTextRunToMarkdown(element.textRun);
            }
        });
    }

    if (isHeading && text.trim()) {
        const hashes = '#'.repeat(Math.min(headingLevel, 6));
        return `${hashes} ${text.trim()}\n\n`;
    } else if (isList && text.trim()) {
        return `- ${text.trim()}\n`;
    } else if (text.trim()) {
        return `${text.trim()}\n\n`;
    }

    return '\n';
}

function convertTextRunToMarkdown(textRun: any): string {
    let text = textRun.content || '';

    if (textRun.textStyle) {
        const style = textRun.textStyle;

        if (style.bold && style.italic) {
            text = `***${text}***`;
        } else if (style.bold) {
            text = `**${text}**`;
        } else if (style.italic) {
            text = `*${text}*`;
        }

        if (style.underline && !style.link) {
            text = `<u>${text}</u>`;
        }

        if (style.strikethrough) {
            text = `~~${text}~~`;
        }

        if (style.link?.url) {
            text = `[${text}](${style.link.url})`;
        }
    }

    return text;
}

function convertTableToMarkdown(table: any): string {
    if (!table.tableRows || table.tableRows.length === 0) {
        return '';
    }

    let markdown = '\n';
    let isFirstRow = true;

    table.tableRows.forEach((row: any) => {
        if (!row.tableCells) return;

        let rowText = '|';
        row.tableCells.forEach((cell: any) => {
            let cellText = '';
            if (cell.content) {
                cell.content.forEach((element: any) => {
                    if (element.paragraph?.elements) {
                        element.paragraph.elements.forEach((pe: any) => {
                            if (pe.textRun?.content) {
                                cellText += pe.textRun.content.replace(/\n/g, ' ').trim();
                            }
                        });
                    }
                });
            }
            rowText += ` ${cellText} |`;
        });

        markdown += rowText + '\n';

        if (isFirstRow) {
            let separator = '|';
            for (let i = 0; i < row.tableCells.length; i++) {
                separator += ' --- |';
            }
            markdown += separator + '\n';
            isFirstRow = false;
        }
    });

    return markdown + '\n';
}

/**
 * Document Tools class - handles basic document operations
 */
export class DocumentTools {
    /**
     * Register all document tools with the MCP server
     */
    static registerTools(server: FastMCP) {
        this.registerReadTool(server);
        this.registerAppendTool(server);
        this.registerInsertTextTool(server);
        this.registerDeleteRangeTool(server);
    }

    private static registerReadTool(server: FastMCP) {
        server.addTool({
            name: 'readGoogleDoc',
            description: 'Reads the content of a specific Google Document, optionally returning structured data.',
            parameters: DocumentIdParameter.extend({
                format: z.enum(['text', 'json', 'markdown']).optional().default('text')
                    .describe("Output format: 'text' (plain text), 'json' (raw API structure, complex), 'markdown' (experimental conversion)."),
                maxLength: z.number().optional().describe('Maximum character limit for text output. If not specified, returns full document content. Use this to limit very large documents.')
            }),
            execute: async (args, { log }) => {
                const docs = await getDocsClient();
                log.info(`Reading Google Doc: ${args.documentId}, Format: ${args.format}`);

                try {
                    const fields = args.format === 'json' || args.format === 'markdown'
                        ? '*'
                        : 'body(content(paragraph(elements(textRun(content)))))';

                    const res = await docs.documents.get({
                        documentId: args.documentId,
                        fields: fields,
                    });
                    log.info(`Fetched doc: ${args.documentId}`);

                    if (args.format === 'json') {
                        const jsonContent = JSON.stringify(res.data, null, 2);
                        if (args.maxLength && jsonContent.length > args.maxLength) {
                            return jsonContent.substring(0, args.maxLength) + `\n... [JSON truncated: ${jsonContent.length} total chars]`;
                        }
                        return jsonContent;
                    }

                    if (args.format === 'markdown') {
                        const markdownContent = convertDocsJsonToMarkdown(res.data);
                        const totalLength = markdownContent.length;
                        log.info(`Generated markdown: ${totalLength} characters`);

                        if (args.maxLength && totalLength > args.maxLength) {
                            const truncatedContent = markdownContent.substring(0, args.maxLength);
                            return `${truncatedContent}\n\n... [Markdown truncated to ${args.maxLength} chars of ${totalLength} total. Use maxLength parameter to adjust limit or remove it to get full content.]`;
                        }

                        return markdownContent;
                    }

                    // Default: Text format
                    let textContent = '';
                    let elementCount = 0;

                    res.data.body?.content?.forEach(element => {
                        elementCount++;

                        if (element.paragraph?.elements) {
                            element.paragraph.elements.forEach(pe => {
                                if (pe.textRun?.content) {
                                    textContent += pe.textRun.content;
                                }
                            });
                        }

                        if (element.table?.tableRows) {
                            element.table.tableRows.forEach(row => {
                                row.tableCells?.forEach(cell => {
                                    cell.content?.forEach(cellElement => {
                                        cellElement.paragraph?.elements?.forEach(pe => {
                                            if (pe.textRun?.content) {
                                                textContent += pe.textRun.content;
                                            }
                                        });
                                    });
                                });
                            });
                        }
                    });

                    if (!textContent.trim()) return "Document found, but appears empty.";

                    const totalLength = textContent.length;
                    log.info(`Document contains ${totalLength} characters across ${elementCount} elements`);

                    if (args.maxLength && totalLength > args.maxLength) {
                        const truncatedContent = textContent.substring(0, args.maxLength);
                        log.info(`Truncating content from ${totalLength} to ${args.maxLength} characters`);
                        return `Content (truncated to ${args.maxLength} chars of ${totalLength} total):\n---\n${truncatedContent}\n\n... [Document continues for ${totalLength - args.maxLength} more characters. Use maxLength parameter to adjust limit or remove it to get full content.]`;
                    }

                    return `Content (${totalLength} characters):\n---\n${textContent}`;

                } catch (error: any) {
                    log.error(`Error reading doc ${args.documentId}: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    if (error instanceof NotImplementedError) throw error;
                    if (error.code === 404) throw new UserError(`Doc not found (ID: ${args.documentId}).`);
                    if (error.code === 403) throw new UserError(`Permission denied for doc (ID: ${args.documentId}).`);
                    throw new UserError(`Failed to read doc: ${error.message || 'Unknown error'}`);
                }
            },
        });
    }

    private static registerAppendTool(server: FastMCP) {
        server.addTool({
            name: 'appendToGoogleDoc',
            description: 'Appends text to the very end of a specific Google Document.',
            parameters: DocumentIdParameter.extend({
                textToAppend: z.string().min(1).describe('The text to add to the end.'),
                addNewlineIfNeeded: z.boolean().optional().default(true).describe("Automatically add a newline before the appended text if the doc doesn't end with one."),
            }),
            execute: async (args, { log }) => {
                const docs = await getDocsClient();
                log.info(`Appending to Google Doc: ${args.documentId}`);

                try {
                    const docInfo = await docs.documents.get({
                        documentId: args.documentId,
                        fields: 'body(content(endIndex)),documentStyle(pageSize)'
                    });

                    let endIndex = 1;
                    if (docInfo.data.body?.content) {
                        const lastElement = docInfo.data.body.content[docInfo.data.body.content.length - 1];
                        if (lastElement?.endIndex) {
                            endIndex = lastElement.endIndex - 1;
                        }
                    }

                    const textToInsert = (args.addNewlineIfNeeded && endIndex > 1 ? '\n' : '') + args.textToAppend;

                    if (!textToInsert) return "Nothing to append.";

                    const request: docs_v1.Schema$Request = {
                        insertText: {
                            location: { index: endIndex },
                            text: textToInsert
                        }
                    };
                    await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [request]);

                    log.info(`Successfully appended to doc: ${args.documentId}`);
                    return `Successfully appended text to document ${args.documentId}.`;
                } catch (error: any) {
                    log.error(`Error appending to doc ${args.documentId}: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    if (error instanceof NotImplementedError) throw error;
                    throw new UserError(`Failed to append to doc: ${error.message || 'Unknown error'}`);
                }
            },
        });
    }

    private static registerInsertTextTool(server: FastMCP) {
        server.addTool({
            name: 'insertText',
            description: 'Inserts text at a specific index within the document body.',
            parameters: DocumentIdParameter.extend({
                textToInsert: z.string().min(1).describe('The text to insert.'),
                index: z.number().int().min(1).describe('The index (1-based) where the text should be inserted.'),
            }),
            execute: async (args, { log }) => {
                const docs = await getDocsClient();
                log.info(`Inserting text in doc ${args.documentId} at index ${args.index}`);
                try {
                    await GDocsHelpers.insertText(docs, args.documentId, args.textToInsert, args.index);
                    return `Successfully inserted text at index ${args.index}.`;
                } catch (error: any) {
                    log.error(`Error inserting text in doc ${args.documentId}: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to insert text: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerDeleteRangeTool(server: FastMCP) {
        server.addTool({
            name: 'deleteRange',
            description: 'Deletes content within a specified range (start index inclusive, end index exclusive).',
            parameters: DocumentIdParameter.extend({
                startIndex: z.number().int().min(1).describe('The starting index of the text range (inclusive, starts from 1).'),
                endIndex: z.number().int().min(1).describe('The ending index of the text range (exclusive).')
            }).refine(data => data.endIndex > data.startIndex, {
                message: "endIndex must be greater than startIndex",
                path: ["endIndex"],
            }),
            execute: async (args, { log }) => {
                const docs = await getDocsClient();
                log.info(`Deleting range ${args.startIndex}-${args.endIndex} in doc ${args.documentId}`);

                if (args.endIndex <= args.startIndex) {
                    throw new UserError("End index must be greater than start index for deletion.");
                }

                try {
                    const request: docs_v1.Schema$Request = {
                        deleteContentRange: {
                            range: { startIndex: args.startIndex, endIndex: args.endIndex }
                        }
                    };
                    await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [request]);
                    return `Successfully deleted content in range ${args.startIndex}-${args.endIndex}.`;
                } catch (error: any) {
                    log.error(`Error deleting range in doc ${args.documentId}: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to delete range: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }
}
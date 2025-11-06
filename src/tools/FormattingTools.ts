// src/tools/FormattingTools.ts
import { FastMCP, UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../clients/googleClients.js';
import {
    ApplyTextStyleToolParameters,
    ApplyTextStyleToolArgs,
    ApplyParagraphStyleToolParameters,
    ApplyParagraphStyleToolArgs,
    TextStyleArgs,
    NotImplementedError
} from '../types.js';
import * as GDocsHelpers from '../googleDocsApiHelpers.js';

/**
 * Formatting Tools class - handles text and paragraph styling
 */
export class FormattingTools {
    /**
     * Register all formatting tools with the MCP server
     */
    static registerTools(server: FastMCP) {
        this.registerApplyTextStyleTool(server);
        this.registerApplyParagraphStyleTool(server);
        this.registerFormatMatchingTextTool(server);
    }

    private static registerApplyTextStyleTool(server: FastMCP) {
        server.addTool({
            name: 'applyTextStyle',
            description: 'Applies character-level formatting (bold, color, font, etc.) to a specific range or found text.',
            parameters: ApplyTextStyleToolParameters,
            execute: async (args: ApplyTextStyleToolArgs, { log }) => {
                const docs = await getDocsClient();
                let { startIndex, endIndex } = args.target as any;

                log.info(`Applying text style in doc ${args.documentId}. Target: ${JSON.stringify(args.target)}, Style: ${JSON.stringify(args.style)}`);

                try {
                    // Determine target range
                    if ('textToFind' in args.target) {
                        const range = await GDocsHelpers.findTextRange(docs, args.documentId, args.target.textToFind, args.target.matchInstance);
                        if (!range) {
                            throw new UserError(`Could not find instance ${args.target.matchInstance} of text "${args.target.textToFind}".`);
                        }
                        startIndex = range.startIndex;
                        endIndex = range.endIndex;
                        log.info(`Found text "${args.target.textToFind}" (instance ${args.target.matchInstance}) at range ${startIndex}-${endIndex}`);
                    }

                    if (startIndex === undefined || endIndex === undefined) {
                        throw new UserError("Target range could not be determined.");
                    }
                    if (endIndex <= startIndex) {
                        throw new UserError("End index must be greater than start index for styling.");
                    }

                    // Build the request
                    const requestInfo = GDocsHelpers.buildUpdateTextStyleRequest(startIndex, endIndex, args.style);
                    if (!requestInfo) {
                        return "No valid text styling options were provided.";
                    }

                    await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [requestInfo.request]);
                    return `Successfully applied text style (${requestInfo.fields.join(', ')}) to range ${startIndex}-${endIndex}.`;

                } catch (error: any) {
                    log.error(`Error applying text style in doc ${args.documentId}: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    if (error instanceof NotImplementedError) throw error;
                    throw new UserError(`Failed to apply text style: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerApplyParagraphStyleTool(server: FastMCP) {
        server.addTool({
            name: 'applyParagraphStyle',
            description: 'Applies paragraph-level formatting (alignment, spacing, named styles like Heading 1) to the paragraph(s) containing specific text, an index, or a range.',
            parameters: ApplyParagraphStyleToolParameters,
            execute: async (args: ApplyParagraphStyleToolArgs, { log }) => {
                const docs = await getDocsClient();
                let startIndex: number | undefined;
                let endIndex: number | undefined;

                log.info(`Applying paragraph style to document ${args.documentId}`);
                log.info(`Style options: ${JSON.stringify(args.style)}`);
                log.info(`Target specification: ${JSON.stringify(args.target)}`);

                try {
                    // STEP 1: Determine the target paragraph's range
                    if ('textToFind' in args.target) {
                        log.info(`Finding text "${args.target.textToFind}" (instance ${args.target.matchInstance || 1})`);
                        const textRange = await GDocsHelpers.findTextRange(
                            docs,
                            args.documentId,
                            args.target.textToFind,
                            args.target.matchInstance || 1
                        );

                        if (!textRange) {
                            throw new UserError(`Could not find "${args.target.textToFind}" in the document.`);
                        }

                        log.info(`Found text at range ${textRange.startIndex}-${textRange.endIndex}, now locating containing paragraph`);

                        const paragraphRange = await GDocsHelpers.getParagraphRange(
                            docs,
                            args.documentId,
                            textRange.startIndex
                        );

                        if (!paragraphRange) {
                            throw new UserError(`Found the text but could not determine the paragraph boundaries.`);
                        }

                        startIndex = paragraphRange.startIndex;
                        endIndex = paragraphRange.endIndex;
                        log.info(`Text is contained within paragraph at range ${startIndex}-${endIndex}`);

                    } else if ('indexWithinParagraph' in args.target) {
                        log.info(`Finding paragraph containing index ${args.target.indexWithinParagraph}`);
                        const paragraphRange = await GDocsHelpers.getParagraphRange(
                            docs,
                            args.documentId,
                            args.target.indexWithinParagraph
                        );

                        if (!paragraphRange) {
                            throw new UserError(`Could not find paragraph containing index ${args.target.indexWithinParagraph}.`);
                        }

                        startIndex = paragraphRange.startIndex;
                        endIndex = paragraphRange.endIndex;
                        log.info(`Located paragraph at range ${startIndex}-${endIndex}`);

                    } else if ('startIndex' in args.target && 'endIndex' in args.target) {
                        startIndex = args.target.startIndex;
                        endIndex = args.target.endIndex;
                        log.info(`Using provided paragraph range ${startIndex}-${endIndex}`);
                    }

                    if (startIndex === undefined || endIndex === undefined) {
                        throw new UserError("Could not determine target paragraph range from the provided information.");
                    }

                    if (endIndex <= startIndex) {
                        throw new UserError(`Invalid paragraph range: end index (${endIndex}) must be greater than start index (${startIndex}).`);
                    }

                    // STEP 2: Build and apply the paragraph style request
                    log.info(`Building paragraph style request for range ${startIndex}-${endIndex}`);
                    const requestInfo = GDocsHelpers.buildUpdateParagraphStyleRequest(startIndex, endIndex, args.style);

                    if (!requestInfo) {
                        return "No valid paragraph styling options were provided.";
                    }

                    log.info(`Applying styles: ${requestInfo.fields.join(', ')}`);
                    await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [requestInfo.request]);

                    return `Successfully applied paragraph styles (${requestInfo.fields.join(', ')}) to the paragraph.`;

                } catch (error: any) {
                    log.error(`Error applying paragraph style in doc ${args.documentId}:`);
                    log.error(error.stack || error.message || error);

                    if (error instanceof UserError) throw error;
                    if (error instanceof NotImplementedError) throw error;

                    throw new UserError(`Failed to apply paragraph style: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerFormatMatchingTextTool(server: FastMCP) {
        server.addTool({
            name: 'formatMatchingText',
            description: 'Finds specific text within a Google Document and applies character formatting (bold, italics, color, etc.) to the specified instance.',
            parameters: z.object({
                documentId: z.string().describe('The ID of the Google Document.'),
                textToFind: z.string().min(1).describe('The exact text string to find and format.'),
                matchInstance: z.number().int().min(1).optional().default(1).describe('Which instance of the text to format (1st, 2nd, etc.). Defaults to 1.'),
                bold: z.boolean().optional().describe('Apply bold formatting.'),
                italic: z.boolean().optional().describe('Apply italic formatting.'),
                underline: z.boolean().optional().describe('Apply underline formatting.'),
                strikethrough: z.boolean().optional().describe('Apply strikethrough formatting.'),
                fontSize: z.number().min(1).optional().describe('Set font size (in points, e.g., 12).'),
                fontFamily: z.string().optional().describe('Set font family (e.g., "Arial", "Times New Roman").'),
                foregroundColor: z.string()
                    .refine((color) => /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color), {
                        message: "Invalid hex color format (e.g., #FF0000 or #F00)"
                    })
                    .optional()
                    .describe('Set text color using hex format (e.g., "#FF0000").'),
                backgroundColor: z.string()
                    .refine((color) => /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color), {
                        message: "Invalid hex color format (e.g., #00FF00 or #0F0)"
                    })
                    .optional()
                    .describe('Set text background color using hex format (e.g., "#FFFF00").'),
                linkUrl: z.string().url().optional().describe('Make the text a hyperlink pointing to this URL.')
            })
                .refine(data => Object.keys(data).some(key => !['documentId', 'textToFind', 'matchInstance'].includes(key) && data[key as keyof typeof data] !== undefined), {
                    message: "At least one formatting option (bold, italic, fontSize, etc.) must be provided."
                }),
            execute: async (args, { log }) => {
                const docs = await getDocsClient();
                log.info(`Using formatMatchingText (legacy) for doc ${args.documentId}, target: "${args.textToFind}" (instance ${args.matchInstance})`);

                try {
                    // Extract the style parameters
                    const styleParams: TextStyleArgs = {};
                    if (args.bold !== undefined) styleParams.bold = args.bold;
                    if (args.italic !== undefined) styleParams.italic = args.italic;
                    if (args.underline !== undefined) styleParams.underline = args.underline;
                    if (args.strikethrough !== undefined) styleParams.strikethrough = args.strikethrough;
                    if (args.fontSize !== undefined) styleParams.fontSize = args.fontSize;
                    if (args.fontFamily !== undefined) styleParams.fontFamily = args.fontFamily;
                    if (args.foregroundColor !== undefined) styleParams.foregroundColor = args.foregroundColor;
                    if (args.backgroundColor !== undefined) styleParams.backgroundColor = args.backgroundColor;
                    if (args.linkUrl !== undefined) styleParams.linkUrl = args.linkUrl;

                    // Find the text range
                    const range = await GDocsHelpers.findTextRange(docs, args.documentId, args.textToFind, args.matchInstance);
                    if (!range) {
                        throw new UserError(`Could not find instance ${args.matchInstance} of text "${args.textToFind}".`);
                    }

                    // Build and execute the request
                    const requestInfo = GDocsHelpers.buildUpdateTextStyleRequest(range.startIndex, range.endIndex, styleParams);
                    if (!requestInfo) {
                        return "No valid text styling options were provided.";
                    }

                    await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [requestInfo.request]);
                    return `Successfully applied formatting to instance ${args.matchInstance} of "${args.textToFind}".`;
                } catch (error: any) {
                    log.error(`Error in formatMatchingText for doc ${args.documentId}: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to format text: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }
}

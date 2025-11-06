// src/tools/StructureTools.ts
import { FastMCP, UserError } from 'fastmcp';
import { z } from 'zod';
import { docs_v1 } from 'googleapis';
import { getDocsClient, getDriveClient } from '../clients/googleClients.js';
import { DocumentIdParameter, NotImplementedError, OptionalRangeParameters } from '../types.js';
import * as GDocsHelpers from '../googleDocsApiHelpers.js';

/**
 * Structure Tools class - handles document structure operations
 * (tables, page breaks, images, experimental list formatting)
 */
export class StructureTools {
    /**
     * Register all structure tools with the MCP server
     */
    static registerTools(server: FastMCP) {
        this.registerInsertTableTool(server);
        this.registerInsertPageBreakTool(server);
        this.registerInsertImageFromUrlTool(server);
        this.registerInsertLocalImageTool(server);
        this.registerFixListFormattingTool(server);
        this.registerFindElementTool(server);
    }

    private static registerInsertTableTool(server: FastMCP) {
        server.addTool({
            name: 'insertTable',
            description: 'Inserts a new table with the specified dimensions at a given index.',
            parameters: DocumentIdParameter.extend({
                rows: z.number().int().min(1).describe('Number of rows for the new table.'),
                columns: z.number().int().min(1).describe('Number of columns for the new table.'),
                index: z.number().int().min(1).describe('The index (1-based) where the table should be inserted.'),
            }),
            execute: async (args, { log }) => {
                const docs = await getDocsClient();
                log.info(`Inserting ${args.rows}x${args.columns} table in doc ${args.documentId} at index ${args.index}`);
                try {
                    await GDocsHelpers.createTable(docs, args.documentId, args.rows, args.columns, args.index);
                    return `Successfully inserted a ${args.rows}x${args.columns} table at index ${args.index}.`;
                } catch (error: any) {
                    log.error(`Error inserting table in doc ${args.documentId}: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to insert table: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerInsertPageBreakTool(server: FastMCP) {
        server.addTool({
            name: 'insertPageBreak',
            description: 'Inserts a page break at the specified index.',
            parameters: DocumentIdParameter.extend({
                index: z.number().int().min(1).describe('The index (1-based) where the page break should be inserted.'),
            }),
            execute: async (args, { log }) => {
                const docs = await getDocsClient();
                log.info(`Inserting page break in doc ${args.documentId} at index ${args.index}`);
                try {
                    const request: docs_v1.Schema$Request = {
                        insertPageBreak: {
                            location: { index: args.index }
                        }
                    };
                    await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [request]);
                    return `Successfully inserted page break at index ${args.index}.`;
                } catch (error: any) {
                    log.error(`Error inserting page break in doc ${args.documentId}: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to insert page break: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerInsertImageFromUrlTool(server: FastMCP) {
        server.addTool({
            name: 'insertImageFromUrl',
            description: 'Inserts an inline image into a Google Document from a publicly accessible URL.',
            parameters: DocumentIdParameter.extend({
                imageUrl: z.string().url().describe('Publicly accessible URL to the image (must be http:// or https://).'),
                index: z.number().int().min(1).describe('The index (1-based) where the image should be inserted.'),
                width: z.number().min(1).optional().describe('Optional: Width of the image in points.'),
                height: z.number().min(1).optional().describe('Optional: Height of the image in points.'),
            }),
            execute: async (args, { log }) => {
                const docs = await getDocsClient();
                log.info(`Inserting image from URL ${args.imageUrl} at index ${args.index} in doc ${args.documentId}`);

                try {
                    await GDocsHelpers.insertInlineImage(
                        docs,
                        args.documentId,
                        args.imageUrl,
                        args.index,
                        args.width,
                        args.height
                    );

                    let sizeInfo = '';
                    if (args.width && args.height) {
                        sizeInfo = ` with size ${args.width}x${args.height}pt`;
                    }

                    return `Successfully inserted image from URL at index ${args.index}${sizeInfo}.`;
                } catch (error: any) {
                    log.error(`Error inserting image in doc ${args.documentId}: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to insert image: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerInsertLocalImageTool(server: FastMCP) {
        server.addTool({
            name: 'insertLocalImage',
            description: 'Uploads a local image file to Google Drive and inserts it into a Google Document. The image will be uploaded to the same folder as the document (or optionally to a specified folder).',
            parameters: DocumentIdParameter.extend({
                localImagePath: z.string().describe('Absolute path to the local image file (supports .jpg, .jpeg, .png, .gif, .bmp, .webp, .svg).'),
                index: z.number().int().min(1).describe('The index (1-based) where the image should be inserted in the document.'),
                width: z.number().min(1).optional().describe('Optional: Width of the image in points.'),
                height: z.number().min(1).optional().describe('Optional: Height of the image in points.'),
                uploadToSameFolder: z.boolean().optional().default(true).describe('If true, uploads the image to the same folder as the document. If false, uploads to Drive root.'),
            }),
            execute: async (args, { log }) => {
                const docs = await getDocsClient();
                const drive = await getDriveClient();
                log.info(`Uploading local image ${args.localImagePath} and inserting at index ${args.index} in doc ${args.documentId}`);

                try {
                    let parentFolderId: string | undefined;
                    if (args.uploadToSameFolder) {
                        try {
                            const docInfo = await drive.files.get({
                                fileId: args.documentId,
                                fields: 'parents'
                            });
                            if (docInfo.data.parents && docInfo.data.parents.length > 0) {
                                parentFolderId = docInfo.data.parents[0];
                                log.info(`Will upload image to document's parent folder: ${parentFolderId}`);
                            }
                        } catch (folderError) {
                            log.warn(`Could not determine document's parent folder, using Drive root: ${folderError}`);
                        }
                    }

                    log.info(`Uploading image to Drive...`);
                    const imageUrl = await GDocsHelpers.uploadImageToDrive(
                        drive,
                        args.localImagePath,
                        parentFolderId
                    );
                    log.info(`Image uploaded successfully, public URL: ${imageUrl}`);

                    await GDocsHelpers.insertInlineImage(
                        docs,
                        args.documentId,
                        imageUrl,
                        args.index,
                        args.width,
                        args.height
                    );

                    let sizeInfo = '';
                    if (args.width && args.height) {
                        sizeInfo = ` with size ${args.width}x${args.height}pt`;
                    }

                    return `Successfully uploaded image to Drive and inserted it at index ${args.index}${sizeInfo}.\nImage URL: ${imageUrl}`;
                } catch (error: any) {
                    log.error(`Error uploading/inserting local image in doc ${args.documentId}: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to upload/insert local image: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerFixListFormattingTool(server: FastMCP) {
        server.addTool({
            name: 'fixListFormatting',
            description: 'EXPERIMENTAL: Attempts to detect paragraphs that look like lists (e.g., starting with -, *, 1.) and convert them to proper Google Docs bulleted or numbered lists. Best used on specific sections.',
            parameters: DocumentIdParameter.extend({
                range: OptionalRangeParameters.optional().describe("Optional: Limit the fixing process to a specific range.")
            }),
            execute: async (args, { log }) => {
                const docs = await getDocsClient();
                log.warn(`Executing EXPERIMENTAL fixListFormatting for doc ${args.documentId}. Range: ${JSON.stringify(args.range)}`);
                try {
                    await GDocsHelpers.detectAndFormatLists(docs, args.documentId, args.range?.startIndex, args.range?.endIndex);
                    return `Attempted to fix list formatting. Please review the document for accuracy.`;
                } catch (error: any) {
                    log.error(`Error fixing list formatting in doc ${args.documentId}: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    if (error instanceof NotImplementedError) throw error;
                    throw new UserError(`Failed to fix list formatting: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerFindElementTool(server: FastMCP) {
        server.addTool({
            name: 'findElement',
            description: 'Finds elements (paragraphs, tables, etc.) based on various criteria. (Not Implemented)',
            parameters: DocumentIdParameter.extend({
                textQuery: z.string().optional(),
                elementType: z.enum(['paragraph', 'table', 'list', 'image']).optional(),
            }),
            execute: async (args, { log }) => {
                log.warn("findElement tool called but is not implemented.");
                throw new NotImplementedError("Finding elements by complex criteria is not yet implemented.");
            }
        });
    }
}
// src/tools/TableTools.ts
import { FastMCP, UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../clients/googleClients.js';
import { DocumentIdParameter, TableCellStyleParameters } from '../types.js';
import * as GDocsHelpers from '../googleDocsApiHelpers.js';

/**
 * Table Tools class - handles all table operations
 * Includes: list, get, getCell, updateCell, applyStyle, insert/delete rows/columns
 */
export class TableTools {
    /**
     * Register all table tools with the MCP server
     */
    static registerTools(server: FastMCP) {
        this.registerListTablesTool(server);
        this.registerGetTableTool(server);
        this.registerGetTableCellTool(server);
        this.registerUpdateTableCellTool(server);
        this.registerApplyTableCellStyleTool(server);
        this.registerInsertTableRowTool(server);
        this.registerDeleteTableRowTool(server);
        this.registerInsertTableColumnTool(server);
        this.registerDeleteTableColumnTool(server);
    }

    private static registerListTablesTool(server: FastMCP) {
        server.addTool({
            name: 'listTables',
            description: 'Lists all tables in a Google Document with their locations and dimensions.',
            parameters: DocumentIdParameter,
            execute: async (args, { log }) => {
                const docs = await getDocsClient();
                log.info(`Listing tables in document ${args.documentId}`);

                try {
                    const tables = await GDocsHelpers.findTables(docs, args.documentId);

                    if (tables.length === 0) {
                        return 'No tables found in this document.';
                    }

                    let result = `Found ${tables.length} table${tables.length !== 1 ? 's' : ''} in document:\n\n`;

                    tables.forEach((table, index) => {
                        result += `${index + 1}. **Table at index ${table.startIndex}**\n`;
                        result += `   Dimensions: ${table.rows} rows × ${table.columns} columns\n`;
                        result += `   Range: ${table.startIndex} - ${table.endIndex}\n\n`;
                    });

                    result += '\n**Tip:** Use the `tableIndex` (starting index) to read, modify, or style specific tables.';

                    return result;
                } catch (error: any) {
                    log.error(`Error listing tables: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to list tables: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerGetTableTool(server: FastMCP) {
        server.addTool({
            name: 'getTable',
            description: 'Gets the complete structure and content of a specific table, including all cell data.',
            parameters: DocumentIdParameter.extend({
                tableIndex: z.number().int().min(1).describe('The starting index of the table element in the document (use listTables to find this).'),
            }),
            execute: async (args, { log }) => {
                const docs = await getDocsClient();
                log.info(`Getting table structure at index ${args.tableIndex} in document ${args.documentId}`);

                try {
                    const table = await GDocsHelpers.getTableStructure(docs, args.documentId, args.tableIndex);

                    if (!table) {
                        throw new UserError(`No table found at index ${args.tableIndex}. Use listTables to find available tables.`);
                    }

                    let result = `**Table at index ${table.startIndex}**\n`;
                    result += `Dimensions: ${table.rows} rows × ${table.columns} columns\n`;
                    result += `Range: ${table.startIndex} - ${table.endIndex}\n\n`;

                    // Display table as markdown
                    result += '**Table Content:**\n\n';

                    // Header row
                    result += '| ';
                    for (let col = 0; col < table.columns; col++) {
                        result += `Col ${col} | `;
                    }
                    result += '\n';

                    // Separator
                    result += '|';
                    for (let col = 0; col < table.columns; col++) {
                        result += ' --- |';
                    }
                    result += '\n';

                    // Data rows
                    table.cells.forEach((row, rowIndex) => {
                        result += '| ';
                        row.forEach(cell => {
                            const cellContent = cell.content || '';
                            const displayContent = cellContent.length > 50
                                ? cellContent.substring(0, 47) + '...'
                                : cellContent;
                            result += `${displayContent.replace(/\|/g, '\\|')} | `;
                        });
                        result += `\n`;
                    });

                    result += '\n**Note:** Cell indices are 0-based (row 0 is first row, column 0 is first column).';

                    return result;
                } catch (error: any) {
                    log.error(`Error getting table: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to get table: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerGetTableCellTool(server: FastMCP) {
        server.addTool({
            name: 'getTableCell',
            description: 'Gets the content and indices of a specific table cell.',
            parameters: DocumentIdParameter.extend({
                tableIndex: z.number().int().min(1).describe('The starting index of the table element.'),
                rowIndex: z.number().int().min(0).describe('Row index (0-based).'),
                columnIndex: z.number().int().min(0).describe('Column index (0-based).'),
            }),
            execute: async (args, { log }) => {
                const docs = await getDocsClient();
                log.info(`Getting cell (${args.rowIndex}, ${args.columnIndex}) from table at ${args.tableIndex}`);

                try {
                    const table = await GDocsHelpers.getTableStructure(docs, args.documentId, args.tableIndex);

                    if (!table) {
                        throw new UserError(`No table found at index ${args.tableIndex}.`);
                    }

                    if (args.rowIndex >= table.rows) {
                        throw new UserError(`Row index ${args.rowIndex} out of bounds. Table has ${table.rows} rows.`);
                    }

                    if (args.columnIndex >= table.columns) {
                        throw new UserError(`Column index ${args.columnIndex} out of bounds. Table has ${table.columns} columns.`);
                    }

                    const cell = table.cells[args.rowIndex][args.columnIndex];

                    let result = `**Cell at row ${args.rowIndex}, column ${args.columnIndex}:**\n\n`;
                    result += `Content: ${cell.content || '(empty)'}\n`;
                    result += `Start index: ${cell.startIndex}\n`;
                    result += `End index: ${cell.endIndex}\n`;

                    return result;
                } catch (error: any) {
                    log.error(`Error getting table cell: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to get table cell: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerUpdateTableCellTool(server: FastMCP) {
        server.addTool({
            name: 'updateTableCell',
            description: 'Updates the text content of a specific table cell. Replaces all existing content in the cell.',
            parameters: DocumentIdParameter.extend({
                tableIndex: z.number().int().min(1).describe('The starting index of the table element.'),
                rowIndex: z.number().int().min(0).describe('Row index (0-based).'),
                columnIndex: z.number().int().min(0).describe('Column index (0-based).'),
                newContent: z.string().describe('The new text content for the cell.'),
            }),
            execute: async (args, { log }) => {
                const docs = await getDocsClient();
                log.info(`Updating cell (${args.rowIndex}, ${args.columnIndex}) in table at ${args.tableIndex}`);

                try {
                    await GDocsHelpers.updateTableCellContent(
                        docs,
                        args.documentId,
                        args.tableIndex,
                        args.rowIndex,
                        args.columnIndex,
                        args.newContent
                    );

                    return `Successfully updated cell at row ${args.rowIndex}, column ${args.columnIndex}.`;
                } catch (error: any) {
                    log.error(`Error updating table cell: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to update table cell: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerApplyTableCellStyleTool(server: FastMCP) {
        server.addTool({
            name: 'applyTableCellStyle',
            description: 'Applies styling (background color, padding, borders) to a specific table cell.',
            parameters: DocumentIdParameter.extend({
                tableIndex: z.number().int().min(1).describe('The starting index of the table element.'),
                rowIndex: z.number().int().min(0).describe('Row index (0-based).'),
                columnIndex: z.number().int().min(0).describe('Column index (0-based).'),
                style: TableCellStyleParameters.refine(
                    styleArgs => Object.values(styleArgs).some(v => v !== undefined),
                    { message: 'At least one style option must be provided.' }
                ).describe('The cell styling to apply.'),
            }),
            execute: async (args, { log }) => {
                const docs = await getDocsClient();
                log.info(`Applying style to cell (${args.rowIndex}, ${args.columnIndex}) in table at ${args.tableIndex}`);

                try {
                    await GDocsHelpers.applyTableCellStyle(
                        docs,
                        args.documentId,
                        args.tableIndex,
                        args.rowIndex,
                        args.columnIndex,
                        args.style
                    );

                    return `Successfully applied styling to cell at row ${args.rowIndex}, column ${args.columnIndex}.`;
                } catch (error: any) {
                    log.error(`Error applying table cell style: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to apply table cell style: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerInsertTableRowTool(server: FastMCP) {
        server.addTool({
            name: 'insertTableRow',
            description: 'Inserts a new row in a table above or below the specified reference row.',
            parameters: DocumentIdParameter.extend({
                tableIndex: z.number().int().min(1).describe('The starting index of the table element.'),
                referenceRowIndex: z.number().int().min(0).describe('The reference row index (0-based) to insert relative to.'),
                insertBelow: z.boolean().optional().default(true).describe('If true, inserts row below reference row. If false, inserts above.'),
            }),
            execute: async (args, { log }) => {
                const docs = await getDocsClient();
                log.info(`Inserting row ${args.insertBelow ? 'below' : 'above'} row ${args.referenceRowIndex} in table at ${args.tableIndex}`);

                try {
                    await GDocsHelpers.insertTableRow(
                        docs,
                        args.documentId,
                        args.tableIndex,
                        args.insertBelow,
                        args.referenceRowIndex
                    );

                    const position = args.insertBelow ? 'below' : 'above';
                    return `Successfully inserted new row ${position} row ${args.referenceRowIndex}.`;
                } catch (error: any) {
                    log.error(`Error inserting table row: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to insert table row: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerDeleteTableRowTool(server: FastMCP) {
        server.addTool({
            name: 'deleteTableRow',
            description: 'Deletes a row from a table.',
            parameters: DocumentIdParameter.extend({
                tableIndex: z.number().int().min(1).describe('The starting index of the table element.'),
                rowIndex: z.number().int().min(0).describe('The row index to delete (0-based).'),
            }),
            execute: async (args, { log }) => {
                const docs = await getDocsClient();
                log.info(`Deleting row ${args.rowIndex} from table at ${args.tableIndex}`);

                try {
                    await GDocsHelpers.deleteTableRow(
                        docs,
                        args.documentId,
                        args.tableIndex,
                        args.rowIndex
                    );

                    return `Successfully deleted row ${args.rowIndex} from table.`;
                } catch (error: any) {
                    log.error(`Error deleting table row: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to delete table row: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerInsertTableColumnTool(server: FastMCP) {
        server.addTool({
            name: 'insertTableColumn',
            description: 'Inserts a new column in a table to the left or right of the specified reference column.',
            parameters: DocumentIdParameter.extend({
                tableIndex: z.number().int().min(1).describe('The starting index of the table element.'),
                referenceColumnIndex: z.number().int().min(0).describe('The reference column index (0-based) to insert relative to.'),
                insertRight: z.boolean().optional().default(true).describe('If true, inserts column to the right of reference column. If false, inserts to the left.'),
            }),
            execute: async (args, { log }) => {
                const docs = await getDocsClient();
                log.info(`Inserting column ${args.insertRight ? 'right' : 'left'} of column ${args.referenceColumnIndex} in table at ${args.tableIndex}`);

                try {
                    await GDocsHelpers.insertTableColumn(
                        docs,
                        args.documentId,
                        args.tableIndex,
                        args.insertRight,
                        args.referenceColumnIndex
                    );

                    const position = args.insertRight ? 'to the right of' : 'to the left of';
                    return `Successfully inserted new column ${position} column ${args.referenceColumnIndex}.`;
                } catch (error: any) {
                    log.error(`Error inserting table column: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to insert table column: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerDeleteTableColumnTool(server: FastMCP) {
        server.addTool({
            name: 'deleteTableColumn',
            description: 'Deletes a column from a table.',
            parameters: DocumentIdParameter.extend({
                tableIndex: z.number().int().min(1).describe('The starting index of the table element.'),
                columnIndex: z.number().int().min(0).describe('The column index to delete (0-based).'),
            }),
            execute: async (args, { log }) => {
                const docs = await getDocsClient();
                log.info(`Deleting column ${args.columnIndex} from table at ${args.tableIndex}`);

                try {
                    await GDocsHelpers.deleteTableColumn(
                        docs,
                        args.documentId,
                        args.tableIndex,
                        args.columnIndex
                    );

                    return `Successfully deleted column ${args.columnIndex} from table.`;
                } catch (error: any) {
                    log.error(`Error deleting table column: ${error.message || error}`);
                    if (error instanceof UserError) throw error;
                    throw new UserError(`Failed to delete table column: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }
}
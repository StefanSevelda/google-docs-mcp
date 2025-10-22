// src/googleDocsApiHelpers.ts
import { google, docs_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { UserError } from 'fastmcp';
import { TextStyleArgs, ParagraphStyleArgs, TableCellStyleArgs, hexToRgbColor, NotImplementedError } from './types.js';

type Docs = docs_v1.Docs; // Alias for convenience

// --- Constants ---
const MAX_BATCH_UPDATE_REQUESTS = 50; // Google API limits batch size

// --- Core Helper to Execute Batch Updates ---
export async function executeBatchUpdate(docs: Docs, documentId: string, requests: docs_v1.Schema$Request[]): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
if (!requests || requests.length === 0) {
// console.warn("executeBatchUpdate called with no requests.");
return {}; // Nothing to do
}

    // TODO: Consider splitting large request arrays into multiple batches if needed
    if (requests.length > MAX_BATCH_UPDATE_REQUESTS) {
         console.warn(`Attempting batch update with ${requests.length} requests, exceeding typical limits. May fail.`);
    }

    try {
        const response = await docs.documents.batchUpdate({
            documentId: documentId,
            requestBody: { requests },
        });
        return response.data;
    } catch (error: any) {
        console.error(`Google API batchUpdate Error for doc ${documentId}:`, error.response?.data || error.message);
        // Translate common API errors to UserErrors
        if (error.code === 400 && error.message.includes('Invalid requests')) {
             // Try to extract more specific info if available
             const details = error.response?.data?.error?.details;
             let detailMsg = '';
             if (details && Array.isArray(details)) {
                 detailMsg = details.map(d => d.description || JSON.stringify(d)).join('; ');
             }
            throw new UserError(`Invalid request sent to Google Docs API. Details: ${detailMsg || error.message}`);
        }
        if (error.code === 404) throw new UserError(`Document not found (ID: ${documentId}). Check the ID.`);
        if (error.code === 403) throw new UserError(`Permission denied for document (ID: ${documentId}). Ensure the authenticated user has edit access.`);
        // Generic internal error for others
        throw new Error(`Google API Error (${error.code}): ${error.message}`);
    }

}

// --- Text Finding Helper ---
// This improved version is more robust in handling various text structure scenarios
export async function findTextRange(docs: Docs, documentId: string, textToFind: string, instance: number = 1): Promise<{ startIndex: number; endIndex: number } | null> {
try {
    // Request more detailed information about the document structure
    const res = await docs.documents.get({
        documentId,
        // Request more fields to handle various container types (not just paragraphs)
        fields: 'body(content(paragraph(elements(startIndex,endIndex,textRun(content))),table,sectionBreak,tableOfContents,startIndex,endIndex))',
    });

    if (!res.data.body?.content) {
        console.warn(`No content found in document ${documentId}`);
        return null;
    }

    // More robust text collection and index tracking
    let fullText = '';
    const segments: { text: string, start: number, end: number }[] = [];
    
    // Process all content elements, including structural ones
    const collectTextFromContent = (content: any[]) => {
        content.forEach(element => {
            // Handle paragraph elements
            if (element.paragraph?.elements) {
                element.paragraph.elements.forEach((pe: any) => {
                    if (pe.textRun?.content && pe.startIndex !== undefined && pe.endIndex !== undefined) {
                        const content = pe.textRun.content;
                        fullText += content;
                        segments.push({ 
                            text: content, 
                            start: pe.startIndex, 
                            end: pe.endIndex 
                        });
                    }
                });
            }
            
            // Handle table elements - this is simplified and might need expansion
            if (element.table && element.table.tableRows) {
                element.table.tableRows.forEach((row: any) => {
                    if (row.tableCells) {
                        row.tableCells.forEach((cell: any) => {
                            if (cell.content) {
                                collectTextFromContent(cell.content);
                            }
                        });
                    }
                });
            }
            
            // Add handling for other structural elements as needed
        });
    };
    
    collectTextFromContent(res.data.body.content);
    
    // Sort segments by starting position to ensure correct ordering
    segments.sort((a, b) => a.start - b.start);
    
    console.log(`Document ${documentId} contains ${segments.length} text segments and ${fullText.length} characters in total.`);
    
    // Find the specified instance of the text
    let startIndex = -1;
    let endIndex = -1;
    let foundCount = 0;
    let searchStartIndex = 0;

    while (foundCount < instance) {
        const currentIndex = fullText.indexOf(textToFind, searchStartIndex);
        if (currentIndex === -1) {
            console.log(`Search text "${textToFind}" not found for instance ${foundCount + 1} (requested: ${instance})`);
            break;
        }

        foundCount++;
        console.log(`Found instance ${foundCount} of "${textToFind}" at position ${currentIndex} in full text`);
        
        if (foundCount === instance) {
            const targetStartInFullText = currentIndex;
            const targetEndInFullText = currentIndex + textToFind.length;
            let currentPosInFullText = 0;
            
            console.log(`Target text range in full text: ${targetStartInFullText}-${targetEndInFullText}`);

            for (const seg of segments) {
                const segStartInFullText = currentPosInFullText;
                const segTextLength = seg.text.length;
                const segEndInFullText = segStartInFullText + segTextLength;

                // Map from reconstructed text position to actual document indices
                if (startIndex === -1 && targetStartInFullText >= segStartInFullText && targetStartInFullText < segEndInFullText) {
                    startIndex = seg.start + (targetStartInFullText - segStartInFullText);
                    console.log(`Mapped start to segment ${seg.start}-${seg.end}, position ${startIndex}`);
                }
                
                if (targetEndInFullText > segStartInFullText && targetEndInFullText <= segEndInFullText) {
                    endIndex = seg.start + (targetEndInFullText - segStartInFullText);
                    console.log(`Mapped end to segment ${seg.start}-${seg.end}, position ${endIndex}`);
                    break;
                }
                
                currentPosInFullText = segEndInFullText;
            }

            if (startIndex === -1 || endIndex === -1) {
                console.warn(`Failed to map text "${textToFind}" instance ${instance} to actual document indices`);
                // Reset and try next occurrence
                startIndex = -1; 
                endIndex = -1;
                searchStartIndex = currentIndex + 1;
                foundCount--;
                continue;
            }
            
            console.log(`Successfully mapped "${textToFind}" to document range ${startIndex}-${endIndex}`);
            return { startIndex, endIndex };
        }
        
        // Prepare for next search iteration
        searchStartIndex = currentIndex + 1;
    }

    console.warn(`Could not find instance ${instance} of text "${textToFind}" in document ${documentId}`);
    return null; // Instance not found or mapping failed for all attempts
} catch (error: any) {
    console.error(`Error finding text "${textToFind}" in doc ${documentId}: ${error.message || 'Unknown error'}`);
    if (error.code === 404) throw new UserError(`Document not found while searching text (ID: ${documentId}).`);
    if (error.code === 403) throw new UserError(`Permission denied while searching text in doc ${documentId}.`);
    throw new Error(`Failed to retrieve doc for text searching: ${error.message || 'Unknown error'}`);
}
}

// --- Paragraph Boundary Helper ---
// Enhanced version to handle document structural elements more robustly
export async function getParagraphRange(docs: Docs, documentId: string, indexWithin: number): Promise<{ startIndex: number; endIndex: number } | null> {
try {
    console.log(`Finding paragraph containing index ${indexWithin} in document ${documentId}`);
    
    // Request more detailed document structure to handle nested elements
    const res = await docs.documents.get({
        documentId,
        // Request more comprehensive structure information
        fields: 'body(content(startIndex,endIndex,paragraph,table,sectionBreak,tableOfContents))',
    });

    if (!res.data.body?.content) {
        console.warn(`No content found in document ${documentId}`);
        return null;
    }

    // Find paragraph containing the index
    // We'll look at all structural elements recursively
    const findParagraphInContent = (content: any[]): { startIndex: number; endIndex: number } | null => {
        for (const element of content) {
            // Check if we have element boundaries defined
            if (element.startIndex !== undefined && element.endIndex !== undefined) {
                // Check if index is within this element's range first
                if (indexWithin >= element.startIndex && indexWithin < element.endIndex) {
                    // If it's a paragraph, we've found our target
                    if (element.paragraph) {
                        console.log(`Found paragraph containing index ${indexWithin}, range: ${element.startIndex}-${element.endIndex}`);
                        return { 
                            startIndex: element.startIndex, 
                            endIndex: element.endIndex 
                        };
                    }
                    
                    // If it's a table, we need to check cells recursively
                    if (element.table && element.table.tableRows) {
                        console.log(`Index ${indexWithin} is within a table, searching cells...`);
                        for (const row of element.table.tableRows) {
                            if (row.tableCells) {
                                for (const cell of row.tableCells) {
                                    if (cell.content) {
                                        const result = findParagraphInContent(cell.content);
                                        if (result) return result;
                                    }
                                }
                            }
                        }
                    }
                    
                    // For other structural elements, we didn't find a paragraph
                    // but we know the index is within this element
                    console.warn(`Index ${indexWithin} is within element (${element.startIndex}-${element.endIndex}) but not in a paragraph`);
                }
            }
        }
        
        return null;
    };

    const paragraphRange = findParagraphInContent(res.data.body.content);
    
    if (!paragraphRange) {
        console.warn(`Could not find paragraph containing index ${indexWithin}`);
    } else {
        console.log(`Returning paragraph range: ${paragraphRange.startIndex}-${paragraphRange.endIndex}`);
    }
    
    return paragraphRange;

} catch (error: any) {
    console.error(`Error getting paragraph range for index ${indexWithin} in doc ${documentId}: ${error.message || 'Unknown error'}`);
    if (error.code === 404) throw new UserError(`Document not found while finding paragraph (ID: ${documentId}).`);
    if (error.code === 403) throw new UserError(`Permission denied while accessing doc ${documentId}.`);
    throw new Error(`Failed to find paragraph: ${error.message || 'Unknown error'}`);
}
}

// --- Style Request Builders ---

export function buildUpdateTextStyleRequest(
startIndex: number,
endIndex: number,
style: TextStyleArgs
): { request: docs_v1.Schema$Request, fields: string[] } | null {
    const textStyle: docs_v1.Schema$TextStyle = {};
const fieldsToUpdate: string[] = [];

    if (style.bold !== undefined) { textStyle.bold = style.bold; fieldsToUpdate.push('bold'); }
    if (style.italic !== undefined) { textStyle.italic = style.italic; fieldsToUpdate.push('italic'); }
    if (style.underline !== undefined) { textStyle.underline = style.underline; fieldsToUpdate.push('underline'); }
    if (style.strikethrough !== undefined) { textStyle.strikethrough = style.strikethrough; fieldsToUpdate.push('strikethrough'); }
    if (style.fontSize !== undefined) { textStyle.fontSize = { magnitude: style.fontSize, unit: 'PT' }; fieldsToUpdate.push('fontSize'); }
    if (style.fontFamily !== undefined) { textStyle.weightedFontFamily = { fontFamily: style.fontFamily }; fieldsToUpdate.push('weightedFontFamily'); }
    if (style.foregroundColor !== undefined) {
        const rgbColor = hexToRgbColor(style.foregroundColor);
        if (!rgbColor) throw new UserError(`Invalid foreground hex color format: ${style.foregroundColor}`);
        textStyle.foregroundColor = { color: { rgbColor: rgbColor } }; fieldsToUpdate.push('foregroundColor');
    }
     if (style.backgroundColor !== undefined) {
        const rgbColor = hexToRgbColor(style.backgroundColor);
        if (!rgbColor) throw new UserError(`Invalid background hex color format: ${style.backgroundColor}`);
        textStyle.backgroundColor = { color: { rgbColor: rgbColor } }; fieldsToUpdate.push('backgroundColor');
    }
    if (style.linkUrl !== undefined) {
        textStyle.link = { url: style.linkUrl }; fieldsToUpdate.push('link');
    }
    // TODO: Handle clearing formatting

    if (fieldsToUpdate.length === 0) return null; // No styles to apply

    const request: docs_v1.Schema$Request = {
        updateTextStyle: {
            range: { startIndex, endIndex },
            textStyle: textStyle,
            fields: fieldsToUpdate.join(','),
        }
    };
    return { request, fields: fieldsToUpdate };

}

export function buildUpdateParagraphStyleRequest(
startIndex: number,
endIndex: number,
style: ParagraphStyleArgs
): { request: docs_v1.Schema$Request, fields: string[] } | null {
    // Create style object and track which fields to update
    const paragraphStyle: docs_v1.Schema$ParagraphStyle = {};
    const fieldsToUpdate: string[] = [];

    console.log(`Building paragraph style request for range ${startIndex}-${endIndex} with options:`, style);

    // Process alignment option (LEFT, CENTER, RIGHT, JUSTIFIED)
    if (style.alignment !== undefined) { 
        paragraphStyle.alignment = style.alignment; 
        fieldsToUpdate.push('alignment'); 
        console.log(`Setting alignment to ${style.alignment}`);
    }
    
    // Process indentation options
    if (style.indentStart !== undefined) { 
        paragraphStyle.indentStart = { magnitude: style.indentStart, unit: 'PT' }; 
        fieldsToUpdate.push('indentStart'); 
        console.log(`Setting left indent to ${style.indentStart}pt`);
    }
    
    if (style.indentEnd !== undefined) { 
        paragraphStyle.indentEnd = { magnitude: style.indentEnd, unit: 'PT' }; 
        fieldsToUpdate.push('indentEnd'); 
        console.log(`Setting right indent to ${style.indentEnd}pt`);
    }
    
    // Process spacing options
    if (style.spaceAbove !== undefined) { 
        paragraphStyle.spaceAbove = { magnitude: style.spaceAbove, unit: 'PT' }; 
        fieldsToUpdate.push('spaceAbove'); 
        console.log(`Setting space above to ${style.spaceAbove}pt`);
    }
    
    if (style.spaceBelow !== undefined) { 
        paragraphStyle.spaceBelow = { magnitude: style.spaceBelow, unit: 'PT' }; 
        fieldsToUpdate.push('spaceBelow'); 
        console.log(`Setting space below to ${style.spaceBelow}pt`);
    }
    
    // Process named style types (headings, etc.)
    if (style.namedStyleType !== undefined) { 
        paragraphStyle.namedStyleType = style.namedStyleType; 
        fieldsToUpdate.push('namedStyleType'); 
        console.log(`Setting named style to ${style.namedStyleType}`);
    }
    
    // Process page break control
    if (style.keepWithNext !== undefined) { 
        paragraphStyle.keepWithNext = style.keepWithNext; 
        fieldsToUpdate.push('keepWithNext'); 
        console.log(`Setting keepWithNext to ${style.keepWithNext}`);
    }

    // Verify we have styles to apply
    if (fieldsToUpdate.length === 0) {
        console.warn("No paragraph styling options were provided");
        return null; // No styles to apply
    }

    // Build the request object
    const request: docs_v1.Schema$Request = {
        updateParagraphStyle: {
            range: { startIndex, endIndex },
            paragraphStyle: paragraphStyle,
            fields: fieldsToUpdate.join(','),
        }
    };
    
    console.log(`Created paragraph style request with fields: ${fieldsToUpdate.join(', ')}`);
    return { request, fields: fieldsToUpdate };
}

// --- Specific Feature Helpers ---

export async function createTable(docs: Docs, documentId: string, rows: number, columns: number, index: number): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
    if (rows < 1 || columns < 1) {
        throw new UserError("Table must have at least 1 row and 1 column.");
    }
    const request: docs_v1.Schema$Request = {
insertTable: {
location: { index },
rows: rows,
columns: columns,
}
};
return executeBatchUpdate(docs, documentId, [request]);
}

export async function insertText(docs: Docs, documentId: string, text: string, index: number): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
    if (!text) return {}; // Nothing to insert
    const request: docs_v1.Schema$Request = {
insertText: {
location: { index },
text: text,
}
};
return executeBatchUpdate(docs, documentId, [request]);
}

// === TABLE HELPER FUNCTIONS ===

/**
 * Finds all tables in a document and returns their metadata
 */
export async function findTables(docs: Docs, documentId: string): Promise<Array<{
  startIndex: number;
  endIndex: number;
  rows: number;
  columns: number;
}>> {
  try {
    const res = await docs.documents.get({
      documentId,
      fields: 'body(content(startIndex,endIndex,table(rows,columns,tableRows)))',
    });

    if (!res.data.body?.content) {
      return [];
    }

    const tables: Array<{
      startIndex: number;
      endIndex: number;
      rows: number;
      columns: number;
    }> = [];

    res.data.body.content.forEach(element => {
      if (element.table && element.startIndex !== undefined && element.endIndex !== undefined) {
        const tableRows = element.table.tableRows || [];
        const rows = tableRows.length;
        const columns = tableRows[0]?.tableCells?.length || 0;

        tables.push({
          startIndex: element.startIndex!,
          endIndex: element.endIndex!,
          rows,
          columns,
        });
      }
    });

    return tables;
  } catch (error: any) {
    console.error(`Error finding tables in doc ${documentId}: ${error.message || error}`);
    throw error;
  }
}

/**
 * Gets detailed table structure including cell content
 */
export async function getTableStructure(docs: Docs, documentId: string, tableStartIndex: number): Promise<{
  startIndex: number;
  endIndex: number;
  rows: number;
  columns: number;
  cells: Array<Array<{
    content: string;
    startIndex: number;
    endIndex: number;
  }>>;
} | null> {
  try {
    const res = await docs.documents.get({
      documentId,
      fields: 'body(content(startIndex,endIndex,table(tableRows(startIndex,endIndex,tableCells(startIndex,endIndex,content(paragraph(elements(textRun(content)))))))))',
    });

    if (!res.data.body?.content) {
      return null;
    }

    // Find the table at the specified index
    for (const element of res.data.body.content) {
      if (element.table && element.startIndex === tableStartIndex) {
        const tableRows = element.table.tableRows || [];
        const rows = tableRows.length;
        const columns = tableRows[0]?.tableCells?.length || 0;

        const cells: Array<Array<{
          content: string;
          startIndex: number;
          endIndex: number;
        }>> = [];

        tableRows.forEach(row => {
          const rowCells: Array<{
            content: string;
            startIndex: number;
            endIndex: number;
          }> = [];

          (row.tableCells || []).forEach(cell => {
            let cellText = '';
            (cell.content || []).forEach(content => {
              if (content.paragraph?.elements) {
                content.paragraph.elements.forEach(elem => {
                  if (elem.textRun?.content) {
                    cellText += elem.textRun.content;
                  }
                });
              }
            });

            rowCells.push({
              content: cellText.trim(),
              startIndex: cell.startIndex || 0,
              endIndex: cell.endIndex || 0,
            });
          });

          cells.push(rowCells);
        });

        return {
          startIndex: element.startIndex!,
          endIndex: element.endIndex!,
          rows,
          columns,
          cells,
        };
      }
    }

    return null;
  } catch (error: any) {
    console.error(`Error getting table structure at index ${tableStartIndex}: ${error.message || error}`);
    throw error;
  }
}

/**
 * Finds the content range of a specific table cell
 */
export async function getTableCellRange(
  docs: Docs,
  documentId: string,
  tableStartIndex: number,
  rowIndex: number,
  columnIndex: number
): Promise<{ startIndex: number; endIndex: number } | null> {
  try {
    const res = await docs.documents.get({
      documentId,
      fields: 'body(content(startIndex,table(tableRows(tableCells(startIndex,endIndex)))))',
    });

    if (!res.data.body?.content) {
      return null;
    }

    // Find the table at the specified index
    for (const element of res.data.body.content) {
      if (element.table && element.startIndex === tableStartIndex) {
        const tableRows = element.table.tableRows || [];

        if (rowIndex >= tableRows.length) {
          throw new UserError(`Row index ${rowIndex} out of bounds. Table has ${tableRows.length} rows.`);
        }

        const row = tableRows[rowIndex];
        const cells = row.tableCells || [];

        if (columnIndex >= cells.length) {
          throw new UserError(`Column index ${columnIndex} out of bounds. Row has ${cells.length} columns.`);
        }

        const cell = cells[columnIndex];
        if (cell.startIndex !== undefined && cell.endIndex !== undefined) {
          // Return the content range (excluding the start/end structural markers)
          return {
            startIndex: cell.startIndex!,
            endIndex: cell.endIndex! - 1, // Exclude the end marker
          };
        }
      }
    }

    return null;
  } catch (error: any) {
    console.error(`Error getting cell range for table at ${tableStartIndex}, cell (${rowIndex}, ${columnIndex}): ${error.message || error}`);
    throw error;
  }
}

/**
 * Updates the content of a specific table cell
 */
export async function updateTableCellContent(
  docs: Docs,
  documentId: string,
  tableStartIndex: number,
  rowIndex: number,
  columnIndex: number,
  newContent: string
): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
  const cellRange = await getTableCellRange(docs, documentId, tableStartIndex, rowIndex, columnIndex);

  if (!cellRange) {
    throw new UserError(`Could not find cell at row ${rowIndex}, column ${columnIndex} in table at index ${tableStartIndex}.`);
  }

  const requests: docs_v1.Schema$Request[] = [];

  // Delete existing content (but preserve the cell structure)
  // We need to delete content between startIndex+1 and endIndex
  const contentStart = cellRange.startIndex + 1;
  const contentEnd = cellRange.endIndex;

  if (contentEnd > contentStart) {
    requests.push({
      deleteContentRange: {
        range: {
          startIndex: contentStart,
          endIndex: contentEnd,
        },
      },
    });
  }

  // Insert new content
  if (newContent) {
    requests.push({
      insertText: {
        location: { index: contentStart },
        text: newContent,
      },
    });
  }

  return executeBatchUpdate(docs, documentId, requests);
}

/**
 * Applies styling to a table cell
 */
export async function applyTableCellStyle(
  docs: Docs,
  documentId: string,
  tableStartIndex: number,
  rowIndex: number,
  columnIndex: number,
  style: any
): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
  const tableCellStyle: docs_v1.Schema$TableCellStyle = {};
  const fieldsToUpdate: string[] = [];

  // Background color
  if (style.backgroundColor) {
    const rgbColor = hexToRgbColor(style.backgroundColor);
    if (!rgbColor) throw new UserError(`Invalid background hex color format: ${style.backgroundColor}`);
    tableCellStyle.backgroundColor = { color: { rgbColor } };
    fieldsToUpdate.push('backgroundColor');
  }

  // Padding
  if (style.paddingTop !== undefined) {
    tableCellStyle.paddingTop = { magnitude: style.paddingTop, unit: 'PT' };
    fieldsToUpdate.push('paddingTop');
  }
  if (style.paddingBottom !== undefined) {
    tableCellStyle.paddingBottom = { magnitude: style.paddingBottom, unit: 'PT' };
    fieldsToUpdate.push('paddingBottom');
  }
  if (style.paddingLeft !== undefined) {
    tableCellStyle.paddingLeft = { magnitude: style.paddingLeft, unit: 'PT' };
    fieldsToUpdate.push('paddingLeft');
  }
  if (style.paddingRight !== undefined) {
    tableCellStyle.paddingRight = { magnitude: style.paddingRight, unit: 'PT' };
    fieldsToUpdate.push('paddingRight');
  }

  // Borders
  const buildBorder = (borderSpec: any) => {
    const rgbColor = hexToRgbColor(borderSpec.color);
    if (!rgbColor) throw new UserError(`Invalid border hex color format: ${borderSpec.color}`);

    return {
      color: { color: { rgbColor } },
      width: { magnitude: borderSpec.width, unit: 'PT' },
      dashStyle: borderSpec.dashStyle || 'SOLID',
    };
  };

  if (style.borderTop) {
    tableCellStyle.borderTop = buildBorder(style.borderTop);
    fieldsToUpdate.push('borderTop');
  }
  if (style.borderBottom) {
    tableCellStyle.borderBottom = buildBorder(style.borderBottom);
    fieldsToUpdate.push('borderBottom');
  }
  if (style.borderLeft) {
    tableCellStyle.borderLeft = buildBorder(style.borderLeft);
    fieldsToUpdate.push('borderLeft');
  }
  if (style.borderRight) {
    tableCellStyle.borderRight = buildBorder(style.borderRight);
    fieldsToUpdate.push('borderRight');
  }

  if (fieldsToUpdate.length === 0) {
    throw new UserError('No valid table cell styling options were provided.');
  }

  const request: docs_v1.Schema$Request = {
    updateTableCellStyle: {
      tableRange: {
        tableCellLocation: {
          tableStartLocation: { index: tableStartIndex },
          rowIndex,
          columnIndex,
        },
        rowSpan: 1,
        columnSpan: 1,
      },
      tableCellStyle,
      fields: fieldsToUpdate.join(','),
    },
  };

  return executeBatchUpdate(docs, documentId, [request]);
}

/**
 * Inserts a new row in a table at the specified position
 */
export async function insertTableRow(
  docs: Docs,
  documentId: string,
  tableStartIndex: number,
  insertBelow: boolean,
  referenceRowIndex: number
): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
  const request: docs_v1.Schema$Request = {
    insertTableRow: {
      tableCellLocation: {
        tableStartLocation: { index: tableStartIndex },
        rowIndex: referenceRowIndex,
        columnIndex: 0,
      },
      insertBelow,
    },
  };

  return executeBatchUpdate(docs, documentId, [request]);
}

/**
 * Deletes a row from a table
 */
export async function deleteTableRow(
  docs: Docs,
  documentId: string,
  tableStartIndex: number,
  rowIndex: number
): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
  const request: docs_v1.Schema$Request = {
    deleteTableRow: {
      tableCellLocation: {
        tableStartLocation: { index: tableStartIndex },
        rowIndex,
        columnIndex: 0,
      },
    },
  };

  return executeBatchUpdate(docs, documentId, [request]);
}

/**
 * Inserts a new column in a table at the specified position
 */
export async function insertTableColumn(
  docs: Docs,
  documentId: string,
  tableStartIndex: number,
  insertRight: boolean,
  referenceColumnIndex: number
): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
  const request: docs_v1.Schema$Request = {
    insertTableColumn: {
      tableCellLocation: {
        tableStartLocation: { index: tableStartIndex },
        rowIndex: 0,
        columnIndex: referenceColumnIndex,
      },
      insertRight,
    },
  };

  return executeBatchUpdate(docs, documentId, [request]);
}

/**
 * Deletes a column from a table
 */
export async function deleteTableColumn(
  docs: Docs,
  documentId: string,
  tableStartIndex: number,
  columnIndex: number
): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
  const request: docs_v1.Schema$Request = {
    deleteTableColumn: {
      tableCellLocation: {
        tableStartLocation: { index: tableStartIndex },
        rowIndex: 0,
        columnIndex,
      },
    },
  };

  return executeBatchUpdate(docs, documentId, [request]);
}

// --- Complex / Stubbed Helpers ---

export async function findParagraphsMatchingStyle(
docs: Docs,
documentId: string,
styleCriteria: any // Define a proper type for criteria (e.g., { fontFamily: 'Arial', bold: true })
): Promise<{ startIndex: number; endIndex: number }[]> {
// TODO: Implement logic
// 1. Get document content with paragraph elements and their styles.
// 2. Iterate through paragraphs.
// 3. For each paragraph, check if its computed style matches the criteria.
// 4. Return ranges of matching paragraphs.
console.warn("findParagraphsMatchingStyle is not implemented.");
throw new NotImplementedError("Finding paragraphs by style criteria is not yet implemented.");
// return [];
}

export async function detectAndFormatLists(
docs: Docs,
documentId: string,
startIndex?: number,
endIndex?: number
): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
// TODO: Implement complex logic
// 1. Get document content (paragraphs, text runs) in the specified range (or whole doc).
// 2. Iterate through paragraphs.
// 3. Identify sequences of paragraphs starting with list-like markers (e.g., "-", "*", "1.", "a)").
// 4. Determine nesting levels based on indentation or marker patterns.
// 5. Generate CreateParagraphBulletsRequests for the identified sequences.
// 6. Potentially delete the original marker text.
// 7. Execute the batch update.
console.warn("detectAndFormatLists is not implemented.");
throw new NotImplementedError("Automatic list detection and formatting is not yet implemented.");
// return {};
}

export async function addCommentHelper(docs: Docs, documentId: string, text: string, startIndex: number, endIndex: number): Promise<void> {
// NOTE: Adding comments typically requires the Google Drive API v3 and different scopes!
// 'https://www.googleapis.com/auth/drive' or more specific comment scopes.
// This helper is a placeholder assuming Drive API client (`drive`) is available and authorized.
/*
const drive = google.drive({version: 'v3', auth: authClient}); // Assuming authClient is available
await drive.comments.create({
fileId: documentId,
requestBody: {
content: text,
anchor: JSON.stringify({ // Anchor format might need verification
'type': 'workbook#textAnchor', // Or appropriate type for Docs
'refs': [{
'docRevisionId': 'head', // Or specific revision
'range': {
'start': startIndex,
'end': endIndex,
}
}]
})
},
fields: 'id'
});
*/
console.warn("addCommentHelper requires Google Drive API and is not implemented.");
throw new NotImplementedError("Adding comments requires Drive API setup and is not yet implemented.");
}

// --- Image Insertion Helpers ---

/**
 * Inserts an inline image into a document from a publicly accessible URL
 * @param docs - Google Docs API client
 * @param documentId - The document ID
 * @param imageUrl - Publicly accessible URL to the image
 * @param index - Position in the document where image should be inserted (1-based)
 * @param width - Optional width in points
 * @param height - Optional height in points
 * @returns Promise with batch update response
 */
export async function insertInlineImage(
    docs: Docs,
    documentId: string,
    imageUrl: string,
    index: number,
    width?: number,
    height?: number
): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
    // Validate URL format and protocol (SECURITY: Prevent SSRF attacks)
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(imageUrl);
    } catch (e) {
        throw new UserError(`Invalid image URL format: ${imageUrl}`);
    }

    // Only allow HTTP and HTTPS protocols to prevent SSRF attacks
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new UserError(`Only HTTP and HTTPS URLs are allowed for image insertion. Protocol "${parsedUrl.protocol}" is not supported.`);
    }

    // Block private/internal IP ranges to prevent SSRF
    const hostname = parsedUrl.hostname;
    const privateRanges = [
        /^localhost$/i,
        /^127\.\d+\.\d+\.\d+$/,  // 127.0.0.0/8
        /^10\.\d+\.\d+\.\d+$/,    // 10.0.0.0/8
        /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,  // 172.16.0.0/12
        /^192\.168\.\d+\.\d+$/,   // 192.168.0.0/16
        /^169\.254\.\d+\.\d+$/,   // 169.254.0.0/16 (link-local)
        /^0\.0\.0\.0$/,
        /^\[::1\]$/,              // IPv6 localhost
        /^\[fe80:/i,              // IPv6 link-local
        /^\[fc00:/i,              // IPv6 private
    ];

    for (const pattern of privateRanges) {
        if (pattern.test(hostname)) {
            throw new UserError(`Access to private/internal IP addresses is not allowed for security reasons. Hostname: ${hostname}`);
        }
    }

    // Build the insertInlineImage request
    const request: docs_v1.Schema$Request = {
        insertInlineImage: {
            location: { index },
            uri: imageUrl,
            ...(width && height && {
                objectSize: {
                    height: { magnitude: height, unit: 'PT' },
                    width: { magnitude: width, unit: 'PT' }
                }
            })
        }
    };

    return executeBatchUpdate(docs, documentId, [request]);
}

/**
 * Uploads a local image file to Google Drive and returns its public URL
 * @param drive - Google Drive API client
 * @param localFilePath - Path to the local image file
 * @param parentFolderId - Optional parent folder ID (defaults to root)
 * @returns Promise with the public webContentLink URL
 */
export async function uploadImageToDrive(
    drive: any, // drive_v3.Drive type
    localFilePath: string,
    parentFolderId?: string
): Promise<string> {
    const fs = await import('fs');
    const path = await import('path');

    // SECURITY: Prevent path traversal attacks
    // Resolve the path to get the absolute path and normalize it
    const resolvedPath = path.resolve(localFilePath);

    // Verify the path doesn't contain path traversal patterns
    if (localFilePath.includes('..') || localFilePath.includes('~')) {
        throw new UserError(`Path traversal detected. Path must not contain '..' or '~' components.`);
    }

    // Verify file exists at the resolved path
    if (!fs.existsSync(resolvedPath)) {
        throw new UserError(`Image file not found: ${localFilePath}`);
    }

    // Verify it's a file, not a directory or special file
    const stats = fs.statSync(resolvedPath);
    if (!stats.isFile()) {
        throw new UserError(`Path must point to a regular file, not a directory or special file.`);
    }

    // Get file name and mime type (use resolved path for actual file operations)
    const fileName = path.basename(resolvedPath);
    const mimeTypeMap: { [key: string]: string } = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml'
    };

    const ext = path.extname(resolvedPath).toLowerCase();
    const mimeType = mimeTypeMap[ext];

    // Only allow supported image formats
    if (!mimeType) {
        throw new UserError(`Unsupported file type: ${ext}. Supported formats: .jpg, .jpeg, .png, .gif, .bmp, .webp, .svg`);
    }

    // Upload file to Drive
    const fileMetadata: any = {
        name: fileName,
        mimeType: mimeType
    };

    if (parentFolderId) {
        fileMetadata.parents = [parentFolderId];
    }

    const media = {
        mimeType: mimeType,
        body: fs.createReadStream(resolvedPath)  // Use resolved path
    };

    const uploadResponse = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id,webViewLink,webContentLink'
    });

    const fileId = uploadResponse.data.id;
    if (!fileId) {
        throw new Error('Failed to upload image to Drive - no file ID returned');
    }

    // Make the file publicly readable
    await drive.permissions.create({
        fileId: fileId,
        requestBody: {
            role: 'reader',
            type: 'anyone'
        }
    });

    // Get the webContentLink
    const fileInfo = await drive.files.get({
        fileId: fileId,
        fields: 'webContentLink'
    });

    const webContentLink = fileInfo.data.webContentLink;
    if (!webContentLink) {
        throw new Error('Failed to get public URL for uploaded image');
    }

    return webContentLink;
}
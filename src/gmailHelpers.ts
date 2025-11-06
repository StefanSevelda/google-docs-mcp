// src/gmailHelpers.ts
import { gmail_v1 } from 'googleapis';
import { UserError } from 'fastmcp';

/**
 * Decodes base64url encoded string (used by Gmail API for message bodies)
 */
export function decodeBase64Url(data: string | undefined): string {
  if (!data) return '';

  // Replace URL-safe characters
  let base64 = data.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding if needed
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }

  try {
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch (error) {
    console.error('Failed to decode base64url:', error);
    return '';
  }
}

/**
 * Extracts the text/plain body from a Gmail message
 */
export function extractPlainTextBody(message: gmail_v1.Schema$Message): string {
  if (!message.payload) return '';

  // If the body is directly in the payload
  if (message.payload.body?.data) {
    return decodeBase64Url(message.payload.body.data);
  }

  // If the message has parts (multipart)
  if (message.payload.parts) {
    return extractTextFromParts(message.payload.parts);
  }

  return '';
}

/**
 * Recursively extracts text from message parts
 */
function extractTextFromParts(parts: gmail_v1.Schema$MessagePart[]): string {
  for (const part of parts) {
    // Look for text/plain parts
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }

    // Recursively check nested parts
    if (part.parts) {
      const text = extractTextFromParts(part.parts);
      if (text) return text;
    }
  }

  // If no text/plain found, try text/html
  for (const part of parts) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      const html = decodeBase64Url(part.body.data);
      // Basic HTML stripping (for better results, consider using a library)
      return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    }
  }

  return '';
}

/**
 * Gets a header value from a Gmail message
 */
export function getHeader(message: gmail_v1.Schema$Message, headerName: string): string | null {
  if (!message.payload?.headers) return null;

  const header = message.payload.headers.find(
    h => h.name?.toLowerCase() === headerName.toLowerCase()
  );

  return header?.value || null;
}

/**
 * Formats a Gmail message for display
 */
export interface FormattedEmail {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  labels: string[];
  body?: string;
  isUnread: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
}

export function formatEmail(message: gmail_v1.Schema$Message, includeBody: boolean = false): FormattedEmail {
  const from = getHeader(message, 'From') || 'Unknown';
  const to = getHeader(message, 'To') || 'Unknown';
  const subject = getHeader(message, 'Subject') || '(No Subject)';
  const date = getHeader(message, 'Date') || 'Unknown';

  const formatted: FormattedEmail = {
    id: message.id || '',
    threadId: message.threadId || '',
    from,
    to,
    subject,
    date,
    snippet: message.snippet || '',
    labels: message.labelIds || [],
    isUnread: message.labelIds?.includes('UNREAD') || false,
    isStarred: message.labelIds?.includes('STARRED') || false,
    hasAttachments: hasAttachments(message),
  };

  if (includeBody) {
    formatted.body = extractPlainTextBody(message);
  }

  return formatted;
}

/**
 * Checks if a message has attachments
 */
export function hasAttachments(message: gmail_v1.Schema$Message): boolean {
  if (!message.payload?.parts) return false;

  return message.payload.parts.some(part =>
    part.filename && part.filename.length > 0 && part.body?.attachmentId
  );
}

/**
 * Generates a summary of an email (first N characters of body)
 */
export function generateEmailSummary(body: string, maxLength: number = 200): string {
  if (!body) return '(Empty message)';

  const cleaned = body.replace(/\s+/g, ' ').trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return cleaned.substring(0, maxLength) + '...';
}

/**
 * Batches array items into chunks of specified size
 */
export function batchArray<T>(array: T[], batchSize: number): T[][] {
  const batches: T[][] = [];

  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }

  return batches;
}

/**
 * Validates Gmail query string (basic validation)
 * This helps prevent query injection
 */
export function validateGmailQuery(query: string): void {
  // Gmail queries are generally safe, but we can add basic checks
  // The Gmail API will handle invalid queries with proper error messages

  if (query.length > 1000) {
    throw new UserError('Query string is too long (max 1000 characters)');
  }
}

/**
 * Maps user-friendly markAs values to Gmail label operations
 */
export function getLabelsForMarkAs(markAs: string): { add: string[], remove: string[] } {
  switch (markAs) {
    case 'read':
      return { add: [], remove: ['UNREAD'] };
    case 'unread':
      return { add: ['UNREAD'], remove: [] };
    case 'starred':
      return { add: ['STARRED'], remove: [] };
    case 'unstarred':
      return { add: [], remove: ['STARRED'] };
    case 'important':
      return { add: ['IMPORTANT'], remove: [] };
    case 'not_important':
      return { add: [], remove: ['IMPORTANT'] };
    default:
      throw new UserError(`Unknown markAs value: ${markAs}`);
  }
}

/**
 * Batch modify messages using Gmail API's batchModify endpoint
 * This is much more efficient than individual modify calls
 * Max 1000 messages per batch
 */
export async function batchModifyMessages(
  gmail: gmail_v1.Gmail,
  messageIds: string[],
  addLabelIds?: string[],
  removeLabelIds?: string[]
): Promise<void> {
  if (messageIds.length === 0) {
    return;
  }

  if (messageIds.length > 1000) {
    throw new UserError('Cannot batch modify more than 1000 messages at once');
  }

  await gmail.users.messages.batchModify({
    userId: 'me',
    requestBody: {
      ids: messageIds,
      addLabelIds: addLabelIds || [],
      removeLabelIds: removeLabelIds || [],
    },
  });
}
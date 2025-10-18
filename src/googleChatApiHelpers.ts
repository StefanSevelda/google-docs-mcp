// src/googleChatApiHelpers.ts
import { chat_v1 } from 'googleapis';
import { UserError } from 'fastmcp';

type Chat = chat_v1.Chat; // Alias for convenience

/**
 * Formats a Google Chat Space object for display
 * @param space - The space object from Google Chat API
 * @returns Formatted string with space details
 */
export function formatSpaceDetails(space: chat_v1.Schema$Space): string {
  const name = space.displayName || space.name || 'Unnamed Space';
  const type = space.spaceType || 'UNKNOWN';
  const threaded = space.spaceThreadingState === 'THREADED_MESSAGES';

  let result = `**${name}**\n`;
  result += `  Resource Name: ${space.name}\n`;
  result += `  Type: ${type}`;

  if (type === 'SPACE') {
    result += threaded ? ' (Threaded)' : ' (Flat)';
  }

  result += '\n';

  if (space.createTime) {
    const createDate = new Date(space.createTime);
    result += `  Created: ${createDate.toLocaleDateString()}\n`;
  }

  if (space.singleUserBotDm !== undefined) {
    result += `  Bot DM: ${space.singleUserBotDm}\n`;
  }

  if (space.externalUserAllowed !== undefined) {
    result += `  External Users Allowed: ${space.externalUserAllowed}\n`;
  }

  return result;
}

/**
 * Formats a Google Chat Message object for display
 * @param message - The message object from Google Chat API
 * @returns Formatted string with message details
 */
export function formatMessageDetails(message: chat_v1.Schema$Message): string {
  const senderName = message.sender?.displayName || 'Unknown Sender';
  const senderType = message.sender?.type || '';
  const createTime = message.createTime ? new Date(message.createTime).toLocaleString() : 'Unknown time';

  let result = `**From: ${senderName}**`;

  if (senderType === 'BOT') {
    result += ' [BOT]';
  }

  result += ` (${createTime})\n`;
  result += `  Resource Name: ${message.name}\n`;

  // Extract text content
  if (message.text) {
    const textPreview = message.text.length > 200
      ? message.text.substring(0, 200) + '...'
      : message.text;
    result += `  Text: ${textPreview}\n`;
  }

  // Show if message has attachments
  if (message.attachment && message.attachment.length > 0) {
    result += `  Attachments: ${message.attachment.length}\n`;
  }

  // Show if message has cards
  if (message.cards && message.cards.length > 0) {
    result += `  Cards: ${message.cards.length}\n`;
  }

  // Show thread info if present
  if (message.thread?.name) {
    result += `  Thread: ${message.thread.name}\n`;
  }

  return result;
}

/**
 * Lists spaces the authenticated user has access to
 * @param chat - Google Chat API client
 * @param pageSize - Maximum number of spaces to return
 * @param pageToken - Token for pagination
 * @param filter - Optional filter string
 * @returns Promise with list of spaces and pagination info
 */
export async function listSpaces(
  chat: Chat,
  pageSize: number = 50,
  pageToken?: string,
  filter?: string
): Promise<{ spaces: chat_v1.Schema$Space[]; nextPageToken?: string }> {
  try {
    const response = await chat.spaces.list({
      pageSize,
      pageToken,
      filter,
    });

    return {
      spaces: response.data.spaces || [],
      nextPageToken: response.data.nextPageToken || undefined,
    };
  } catch (error: any) {
    console.error('Error listing spaces:', JSON.stringify(error, null, 2));
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Error response:', error.response?.data);

    // Build detailed error message
    let detailedMessage = `Failed to list spaces.\n`;
    detailedMessage += `Error code: ${error.code || 'Unknown'}\n`;
    detailedMessage += `Error message: ${error.message || 'Unknown error'}\n`;

    // Add API error details if available
    if (error.response?.data) {
      const data = error.response.data;
      if (data.error) {
        detailedMessage += `API Error: ${data.error.message || JSON.stringify(data.error)}\n`;
        if (data.error.status) {
          detailedMessage += `Status: ${data.error.status}\n`;
        }
        if (data.error.details) {
          detailedMessage += `Details: ${JSON.stringify(data.error.details, null, 2)}\n`;
        }
      }
    }

    if (error.code === 403) {
      detailedMessage += '\nLikely cause: Permission denied. Ensure:\n';
      detailedMessage += '1. The authenticated user has access to Google Chat\n';
      detailedMessage += '2. Required scopes are granted (chat.spaces.readonly)\n';
      detailedMessage += '3. You have re-authorized after adding Google Chat scopes\n';
      throw new UserError(detailedMessage);
    }

    if (error.code === 404) {
      detailedMessage += '\nLikely cause: No spaces found or API endpoint not found.\n';
      detailedMessage += 'This could mean:\n';
      detailedMessage += '1. The user has no Google Chat spaces\n';
      detailedMessage += '2. The API scopes are not correctly authorized\n';
      detailedMessage += '3. The Google Chat API is not enabled for this project\n';
      throw new UserError(detailedMessage);
    }

    throw new UserError(detailedMessage);
  }
}

/**
 * Gets details about a specific space
 * @param chat - Google Chat API client
 * @param spaceName - Resource name of the space (e.g., "spaces/SPACE_ID")
 * @returns Promise with space details
 */
export async function getSpace(
  chat: Chat,
  spaceName: string
): Promise<chat_v1.Schema$Space> {
  try {
    const response = await chat.spaces.get({
      name: spaceName,
    });

    if (!response.data) {
      throw new UserError(`Space not found: ${spaceName}`);
    }

    return response.data;
  } catch (error: any) {
    console.error(`Error getting space ${spaceName}:`, error.message);

    if (error.code === 403) {
      throw new UserError(`Permission denied for space ${spaceName}. Ensure you have access to this space.`);
    }

    if (error.code === 404) {
      throw new UserError(`Space not found: ${spaceName}. Check the space name format.`);
    }

    throw new Error(`Failed to get space: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Lists messages in a specific space
 * @param chat - Google Chat API client
 * @param spaceName - Resource name of the space
 * @param pageSize - Maximum number of messages to return
 * @param pageToken - Token for pagination
 * @param orderBy - Ordering string (e.g., "createTime desc")
 * @param filter - Optional filter string
 * @returns Promise with list of messages and pagination info
 */
export async function listMessages(
  chat: Chat,
  spaceName: string,
  pageSize: number = 25,
  pageToken?: string,
  orderBy?: string,
  filter?: string
): Promise<{ messages: chat_v1.Schema$Message[]; nextPageToken?: string }> {
  try {
    const response = await chat.spaces.messages.list({
      parent: spaceName,
      pageSize,
      pageToken,
      orderBy,
      filter,
    });

    return {
      messages: response.data.messages || [],
      nextPageToken: response.data.nextPageToken || undefined,
    };
  } catch (error: any) {
    console.error(`Error listing messages in ${spaceName}:`, error.message);

    if (error.code === 403) {
      throw new UserError(`Permission denied for space ${spaceName}. Ensure you have access to read messages.`);
    }

    if (error.code === 404) {
      throw new UserError(`Space not found: ${spaceName}. Check the space name format.`);
    }

    throw new Error(`Failed to list messages: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Gets details about a specific message
 * @param chat - Google Chat API client
 * @param messageName - Resource name of the message (e.g., "spaces/SPACE_ID/messages/MESSAGE_ID")
 * @returns Promise with message details
 */
export async function getMessage(
  chat: Chat,
  messageName: string
): Promise<chat_v1.Schema$Message> {
  try {
    const response = await chat.spaces.messages.get({
      name: messageName,
    });

    if (!response.data) {
      throw new UserError(`Message not found: ${messageName}`);
    }

    return response.data;
  } catch (error: any) {
    console.error(`Error getting message ${messageName}:`, error.message);

    if (error.code === 403) {
      throw new UserError(`Permission denied for message ${messageName}. Ensure you have access.`);
    }

    if (error.code === 404) {
      throw new UserError(`Message not found: ${messageName}. Check the message name format.`);
    }

    throw new Error(`Failed to get message: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Extracts the full text content from a message, handling formatting
 * @param message - The message object
 * @returns Plain text representation of the message
 */
export function extractMessageText(message: chat_v1.Schema$Message): string {
  if (!message.text) {
    return '[No text content]';
  }

  return message.text;
}

/**
 * Validates a space name format
 * @param spaceName - The space name to validate
 * @returns true if valid, false otherwise
 */
export function validateSpaceName(spaceName: string): boolean {
  // Space names should be in format: spaces/SPACE_ID
  return /^spaces\/[a-zA-Z0-9_-]+$/.test(spaceName);
}

/**
 * Validates a message name format
 * @param messageName - The message name to validate
 * @returns true if valid, false otherwise
 */
export function validateMessageName(messageName: string): boolean {
  // Message names should be in format: spaces/SPACE_ID/messages/MESSAGE_ID
  return /^spaces\/[a-zA-Z0-9_-]+\/messages\/[a-zA-Z0-9_.-]+$/.test(messageName);
}
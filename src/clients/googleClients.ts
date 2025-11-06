// src/clients/googleClients.ts
// Manages Google API client initialization

import { google, docs_v1, drive_v3, chat_v1, calendar_v3, gmail_v1 } from 'googleapis';
import { authorize } from '../auth.js';
import { OAuth2Client } from 'google-auth-library';
import { UserError } from 'fastmcp';

let authClient: OAuth2Client | null = null;
let googleDocs: docs_v1.Docs | null = null;
let googleDrive: drive_v3.Drive | null = null;
let googleChat: chat_v1.Chat | null = null;
let googleCalendar: calendar_v3.Calendar | null = null;
let googleGmail: gmail_v1.Gmail | null = null;

/**
 * Initialize Google API clients with OAuth2 authorization
 */
export async function initializeGoogleClient() {
  if (googleDocs && googleDrive && googleChat && googleCalendar && googleGmail) {
    return { authClient, googleDocs, googleDrive, googleChat, googleCalendar, googleGmail };
  }

  if (!authClient) {
    try {
      console.error("Attempting to authorize Google API client...");
      const client = await authorize();
      authClient = client;
      googleDocs = google.docs({ version: 'v1', auth: authClient });
      googleDrive = google.drive({ version: 'v3', auth: authClient });
      googleChat = google.chat({ version: 'v1', auth: authClient });
      googleCalendar = google.calendar({ version: 'v3', auth: authClient });
      googleGmail = google.gmail({ version: 'v1', auth: authClient });
      console.error("Google API client authorized successfully.");
    } catch (error) {
      console.error("FATAL: Failed to initialize Google API client:", error);
      authClient = null;
      googleDocs = null;
      googleDrive = null;
      googleChat = null;
      googleCalendar = null;
      googleGmail = null;
      throw new Error("Google client initialization failed. Cannot start server tools.");
    }
  }

  // Ensure all clients are initialized
  if (authClient && !googleDocs) googleDocs = google.docs({ version: 'v1', auth: authClient });
  if (authClient && !googleDrive) googleDrive = google.drive({ version: 'v3', auth: authClient });
  if (authClient && !googleChat) googleChat = google.chat({ version: 'v1', auth: authClient });
  if (authClient && !googleCalendar) googleCalendar = google.calendar({ version: 'v3', auth: authClient });
  if (authClient && !googleGmail) googleGmail = google.gmail({ version: 'v1', auth: authClient });

  if (!googleDocs || !googleDrive || !googleChat || !googleCalendar || !googleGmail) {
    throw new Error("Google Docs, Drive, Chat, Calendar, and Gmail clients could not be initialized.");
  }

  return { authClient, googleDocs, googleDrive, googleChat, googleCalendar, googleGmail };
}

/**
 * Get the Google Docs client
 */
export async function getDocsClient() {
  const { googleDocs: docs } = await initializeGoogleClient();
  if (!docs) {
    throw new UserError("Google Docs client is not initialized. Authentication might have failed during startup or lost connection.");
  }
  return docs;
}

/**
 * Get the Google Drive client
 */
export async function getDriveClient() {
  const { googleDrive: drive } = await initializeGoogleClient();
  if (!drive) {
    throw new UserError("Google Drive client is not initialized. Authentication might have failed during startup or lost connection.");
  }
  return drive;
}

/**
 * Get the Google Chat client
 */
export async function getChatClient() {
  const { googleChat: chat } = await initializeGoogleClient();
  if (!chat) {
    throw new UserError("Google Chat client is not initialized. Authentication might have failed during startup or lost connection.");
  }
  return chat;
}

/**
 * Get the Google Calendar client
 */
export async function getCalendarClient() {
  const { googleCalendar: calendar } = await initializeGoogleClient();
  if (!calendar) {
    throw new UserError("Google Calendar client is not initialized. Authentication might have failed during startup or lost connection.");
  }
  return calendar;
}

/**
 * Get the Google Gmail client
 */
export async function getGmailClient() {
  const { googleGmail: gmail } = await initializeGoogleClient();
  if (!gmail) {
    throw new UserError("Google Gmail client is not initialized. Authentication might have failed during startup or lost connection.");
  }
  return gmail;
}

/**
 * Get the OAuth2 auth client (for direct API access in some tools)
 */
export function getAuthClient() {
  return authClient;
}
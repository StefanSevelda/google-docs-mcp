// src/utils/clientManager.ts
// Manages Google API client initialization and access

import { google, docs_v1, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { UserError } from 'fastmcp';
import { authorize } from '../auth.js';

/**
 * Container for initialized Google API clients
 */
interface GoogleClients {
    authClient: OAuth2Client;
    googleDocs: docs_v1.Docs;
    googleDrive: drive_v3.Drive;
}

/**
 * Singleton class to manage Google API client initialization
 * Replaces global mutable state with encapsulated state management
 */
class ClientManager {
    private clients: GoogleClients | null = null;
    private initializationPromise: Promise<GoogleClients> | null = null;

    /**
     * Initialize Google API clients if not already initialized
     * Uses promise caching to prevent multiple simultaneous initializations
     */
    async initialize(): Promise<GoogleClients> {
        // Return existing clients if already initialized
        if (this.clients) {
            return this.clients;
        }

        // If initialization is in progress, wait for it
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        // Start new initialization
        this.initializationPromise = this.performInitialization();

        try {
            this.clients = await this.initializationPromise;
            return this.clients;
        } finally {
            this.initializationPromise = null;
        }
    }

    /**
     * Performs the actual initialization of Google API clients
     */
    private async performInitialization(): Promise<GoogleClients> {
        try {
            console.error("Attempting to authorize Google API client...");
            const authClient = await authorize();

            const googleDocs = google.docs({ version: 'v1', auth: authClient });
            const googleDrive = google.drive({ version: 'v3', auth: authClient });

            console.error("Google API client authorized successfully.");

            return { authClient, googleDocs, googleDrive };
        } catch (error) {
            console.error("FATAL: Failed to initialize Google API client:", error);
            throw new Error("Google client initialization failed. Cannot start server tools.");
        }
    }

    /**
     * Get the Docs API client, initializing if necessary
     */
    async getDocsClient(): Promise<docs_v1.Docs> {
        const { googleDocs } = await this.initialize();
        if (!googleDocs) {
            throw new UserError("Google Docs client is not initialized. Authentication might have failed during startup or lost connection.");
        }
        return googleDocs;
    }

    /**
     * Get the Drive API client, initializing if necessary
     */
    async getDriveClient(): Promise<drive_v3.Drive> {
        const { googleDrive } = await this.initialize();
        if (!googleDrive) {
            throw new UserError("Google Drive client is not initialized. Authentication might have failed during startup or lost connection.");
        }
        return googleDrive;
    }

    /**
     * Get the auth client, initializing if necessary
     */
    async getAuthClient(): Promise<OAuth2Client> {
        const { authClient } = await this.initialize();
        if (!authClient) {
            throw new UserError("OAuth2 client is not initialized. Authentication might have failed during startup.");
        }
        return authClient;
    }

    /**
     * Reset the client manager (useful for testing or re-authentication)
     */
    reset(): void {
        this.clients = null;
        this.initializationPromise = null;
    }
}

// Export singleton instance
export const clientManager = new ClientManager();

// Export convenience functions
export const getDocsClient = () => clientManager.getDocsClient();
export const getDriveClient = () => clientManager.getDriveClient();
export const getAuthClient = () => clientManager.getAuthClient();
export const initializeGoogleClient = () => clientManager.initialize();

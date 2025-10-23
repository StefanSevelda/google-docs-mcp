// src/utils/errorHandling.ts
// Centralized error handling utilities to reduce code duplication

import { UserError } from 'fastmcp';
import { NotImplementedError } from '../types.js';

/**
 * Standard error handler for tool execution
 * Provides consistent error handling across all MCP tools
 *
 * @param error - The error object caught during execution
 * @param context - Context information (documentId, operation name, etc.)
 * @param log - Optional logger function
 * @throws UserError with appropriate message for the client
 */
export function handleToolError(
    error: any,
    context: { operation: string; documentId?: string; details?: string },
    log?: (message: string) => void
): never {
    const { operation, documentId, details } = context;
    const docInfo = documentId ? ` (Doc ID: ${documentId})` : '';
    const extraInfo = details ? ` - ${details}` : '';

    // Log the error if logger provided
    if (log) {
        log(`Error in ${operation}${docInfo}: ${error.message || error}${extraInfo}`);
    }

    // Re-throw UserError and NotImplementedError as-is
    if (error instanceof UserError) throw error;
    if (error instanceof NotImplementedError) throw error;

    // Handle common Google API errors
    if (error.code) {
        switch (error.code) {
            case 404:
                throw new UserError(
                    `Resource not found${docInfo}. Please verify the ID is correct.`
                );
            case 403:
                throw new UserError(
                    `Permission denied${docInfo}. Ensure you have the necessary access rights.`
                );
            case 400:
                const apiDetails = extractGoogleApiErrorDetails(error);
                throw new UserError(
                    `Invalid request${docInfo}. ${apiDetails || error.message || 'Please check your parameters.'}`
                );
            case 429:
                throw new UserError(
                    `Rate limit exceeded${docInfo}. Please try again later.`
                );
            case 500:
            case 502:
            case 503:
                throw new UserError(
                    `Google API service error${docInfo}. The service may be temporarily unavailable. Please try again later.`
                );
        }
    }

    // Generic fallback error
    throw new UserError(
        `Failed to ${operation}${docInfo}: ${error.message || 'Unknown error'}`
    );
}

/**
 * Extracts detailed error information from Google API responses
 * @param error - The Google API error object
 * @returns Formatted error details or null if not available
 */
function extractGoogleApiErrorDetails(error: any): string | null {
    try {
        const details = error.response?.data?.error?.details;
        if (details && Array.isArray(details)) {
            return details
                .map(d => d.description || d.message || JSON.stringify(d))
                .join('; ');
        }
        return error.response?.data?.error?.message || null;
    } catch {
        return null;
    }
}

/**
 * Wraps an async function with standard error handling
 * Reduces boilerplate in tool execute functions
 *
 * @param operation - Name of the operation for error messages
 * @param fn - The async function to wrap
 * @returns Wrapped function with error handling
 */
export function withErrorHandling<TArgs extends { documentId?: string }, TResult>(
    operation: string,
    fn: (args: TArgs, log: any) => Promise<TResult>
) {
    return async (args: TArgs, context: { log: any }): Promise<TResult> => {
        try {
            return await fn(args, context.log);
        } catch (error: any) {
            handleToolError(
                error,
                {
                    operation,
                    documentId: args.documentId,
                },
                context.log.error
            );
        }
    };
}

/**
 * Validates that required range indices are valid
 * @param startIndex - The start index
 * @param endIndex - The end index
 * @param operation - The operation name for error messages
 * @throws UserError if indices are invalid
 */
export function validateRange(startIndex: number, endIndex: number, operation: string): void {
    if (endIndex <= startIndex) {
        throw new UserError(
            `Invalid range for ${operation}: end index (${endIndex}) must be greater than start index (${startIndex}).`
        );
    }
    if (startIndex < 1) {
        throw new UserError(
            `Invalid range for ${operation}: start index must be at least 1 (Google Docs uses 1-based indexing).`
        );
    }
}

/**
 * Safely escapes user input for use in Google Drive API query strings
 * Prevents query injection attacks
 * @param input - The user input to escape
 * @returns Escaped string safe for Drive API queries
 */
export function escapeDriveQuery(input: string): string {
    // Escape backslashes first, then single quotes
    return input.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

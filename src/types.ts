// src/types.ts
import { z } from 'zod';
import { docs_v1 } from 'googleapis';

// --- Helper function for hex color validation ---
export const hexColorRegex = /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
export const validateHexColor = (color: string) => hexColorRegex.test(color);

// --- Helper function for Hex to RGB conversion ---
export function hexToRgbColor(hex: string): docs_v1.Schema$RgbColor | null {
if (!hex) return null;
let hexClean = hex.startsWith('#') ? hex.slice(1) : hex;

if (hexClean.length === 3) {
hexClean = hexClean[0] + hexClean[0] + hexClean[1] + hexClean[1] + hexClean[2] + hexClean[2];
}
if (hexClean.length !== 6) return null;
const bigint = parseInt(hexClean, 16);
if (isNaN(bigint)) return null;

const r = ((bigint >> 16) & 255) / 255;
const g = ((bigint >> 8) & 255) / 255;
const b = (bigint & 255) / 255;

return { red: r, green: g, blue: b };
}

// --- Zod Schema Fragments for Reusability ---

export const DocumentIdParameter = z.object({
documentId: z.string().describe('The ID of the Google Document (from the URL).'),
});

export const RangeParameters = z.object({
startIndex: z.number().int().min(1).describe('The starting index of the text range (inclusive, starts from 1).'),
endIndex: z.number().int().min(1).describe('The ending index of the text range (exclusive).'),
}).refine(data => data.endIndex > data.startIndex, {
message: "endIndex must be greater than startIndex",
path: ["endIndex"],
});

export const OptionalRangeParameters = z.object({
startIndex: z.number().int().min(1).optional().describe('Optional: The starting index of the text range (inclusive, starts from 1). If omitted, might apply to a found element or whole paragraph.'),
endIndex: z.number().int().min(1).optional().describe('Optional: The ending index of the text range (exclusive). If omitted, might apply to a found element or whole paragraph.'),
}).refine(data => !data.startIndex || !data.endIndex || data.endIndex > data.startIndex, {
message: "If both startIndex and endIndex are provided, endIndex must be greater than startIndex",
path: ["endIndex"],
});

export const TextFindParameter = z.object({
textToFind: z.string().min(1).describe('The exact text string to locate.'),
matchInstance: z.number().int().min(1).optional().default(1).describe('Which instance of the text to target (1st, 2nd, etc.). Defaults to 1.'),
});

// --- Style Parameter Schemas ---

export const TextStyleParameters = z.object({
bold: z.boolean().optional().describe('Apply bold formatting.'),
italic: z.boolean().optional().describe('Apply italic formatting.'),
underline: z.boolean().optional().describe('Apply underline formatting.'),
strikethrough: z.boolean().optional().describe('Apply strikethrough formatting.'),
fontSize: z.number().min(1).optional().describe('Set font size (in points, e.g., 12).'),
fontFamily: z.string().optional().describe('Set font family (e.g., "Arial", "Times New Roman").'),
foregroundColor: z.string()
.refine(validateHexColor, { message: "Invalid hex color format (e.g., #FF0000 or #F00)" })
.optional()
.describe('Set text color using hex format (e.g., "#FF0000").'),
backgroundColor: z.string()
.refine(validateHexColor, { message: "Invalid hex color format (e.g., #00FF00 or #0F0)" })
.optional()
.describe('Set text background color using hex format (e.g., "#FFFF00").'),
linkUrl: z.string().url().optional().describe('Make the text a hyperlink pointing to this URL.'),
// clearDirectFormatting: z.boolean().optional().describe('If true, attempts to clear all direct text formatting within the range before applying new styles.') // Harder to implement perfectly
}).describe("Parameters for character-level text formatting.");

// Subset of TextStyle used for passing to helpers
export type TextStyleArgs = z.infer<typeof TextStyleParameters>;

export const ParagraphStyleParameters = z.object({
alignment: z.enum(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED']).optional().describe('Paragraph alignment.'),
indentStart: z.number().min(0).optional().describe('Left indentation in points.'),
indentEnd: z.number().min(0).optional().describe('Right indentation in points.'),
spaceAbove: z.number().min(0).optional().describe('Space before the paragraph in points.'),
spaceBelow: z.number().min(0).optional().describe('Space after the paragraph in points.'),
namedStyleType: z.enum([
'NORMAL_TEXT', 'TITLE', 'SUBTITLE',
'HEADING_1', 'HEADING_2', 'HEADING_3', 'HEADING_4', 'HEADING_5', 'HEADING_6'
]).optional().describe('Apply a built-in named paragraph style (e.g., HEADING_1).'),
keepWithNext: z.boolean().optional().describe('Keep this paragraph together with the next one on the same page.'),
// Borders are more complex, might need separate objects/tools
// clearDirectFormatting: z.boolean().optional().describe('If true, attempts to clear all direct paragraph formatting within the range before applying new styles.') // Harder to implement perfectly
}).describe("Parameters for paragraph-level formatting.");

// Subset of ParagraphStyle used for passing to helpers
export type ParagraphStyleArgs = z.infer<typeof ParagraphStyleParameters>;

// --- Combination Schemas for Tools ---

export const ApplyTextStyleToolParameters = DocumentIdParameter.extend({
// Target EITHER by range OR by finding text
target: z.union([
RangeParameters,
TextFindParameter
]).describe("Specify the target range either by start/end indices or by finding specific text."),
style: TextStyleParameters.refine(
styleArgs => Object.values(styleArgs).some(v => v !== undefined),
{ message: "At least one text style option must be provided." }
).describe("The text styling to apply.")
});
export type ApplyTextStyleToolArgs = z.infer<typeof ApplyTextStyleToolParameters>;

export const ApplyParagraphStyleToolParameters = DocumentIdParameter.extend({
// Target EITHER by range OR by finding text (tool logic needs to find paragraph boundaries)
target: z.union([
RangeParameters, // User provides paragraph start/end (less likely)
TextFindParameter.extend({
applyToContainingParagraph: z.literal(true).default(true).describe("Must be true. Indicates the style applies to the whole paragraph containing the found text.")
}),
z.object({ // Target by specific index within the paragraph
indexWithinParagraph: z.number().int().min(1).describe("An index located anywhere within the target paragraph.")
})
]).describe("Specify the target paragraph either by start/end indices, by finding text within it, or by providing an index within it."),
style: ParagraphStyleParameters.refine(
styleArgs => Object.values(styleArgs).some(v => v !== undefined),
{ message: "At least one paragraph style option must be provided." }
).describe("The paragraph styling to apply.")
});
export type ApplyParagraphStyleToolArgs = z.infer<typeof ApplyParagraphStyleToolParameters>;

// --- Google Chat Parameter Schemas ---

export const SpaceNameParameter = z.object({
  spaceName: z.string().describe('The resource name of the Google Chat space (e.g., "spaces/SPACE_ID").'),
});

export const ListSpacesParameters = z.object({
  pageSize: z.number().int().min(1).max(100).optional().default(50).describe('Maximum number of spaces to return (1-100).'),
  pageToken: z.string().optional().describe('Token for pagination. Use the nextPageToken from a previous response to get the next page.'),
  filter: z.string().optional().describe('Optional filter string (e.g., "spaceType = SPACE" or "spaceType = DIRECT_MESSAGE").'),
});

export const ListMessagesParameters = z.object({
  spaceName: z.string().describe('The resource name of the space (e.g., "spaces/SPACE_ID").'),
  pageSize: z.number().int().min(1).max(100).optional().default(25).describe('Maximum number of messages to return (1-100).'),
  pageToken: z.string().optional().describe('Token for pagination. Use the nextPageToken from a previous response.'),
  orderBy: z.string().optional().describe('Ordering of messages. Example: "createTime desc" or "createTime asc".'),
  filter: z.string().optional().describe('Optional filter string for messages.'),
});

export const MessageNameParameter = z.object({
  messageName: z.string().describe('The resource name of the message (e.g., "spaces/SPACE_ID/messages/MESSAGE_ID").'),
});

// --- Table Parameter Schemas ---

export const TableLocationParameter = z.object({
  tableIndex: z.number().int().min(1).describe('The starting index of the table element in the document (1-based).'),
});

export const TableCellLocationParameter = z.object({
  tableIndex: z.number().int().min(1).describe('The starting index of the table element in the document (1-based).'),
  rowIndex: z.number().int().min(0).describe('Row index (0-based).'),
  columnIndex: z.number().int().min(0).describe('Column index (0-based).'),
});

export const TableCellStyleParameters = z.object({
  backgroundColor: z.string()
    .refine(validateHexColor, { message: "Invalid hex color format (e.g., #FF0000 or #F00)" })
    .optional()
    .describe('Set cell background color using hex format (e.g., "#FFFFFF").'),
  paddingTop: z.number().min(0).optional().describe('Top padding in points.'),
  paddingBottom: z.number().min(0).optional().describe('Bottom padding in points.'),
  paddingLeft: z.number().min(0).optional().describe('Left padding in points.'),
  paddingRight: z.number().min(0).optional().describe('Right padding in points.'),
  borderTop: z.object({
    width: z.number().min(0).describe('Border width in points.'),
    color: z.string().refine(validateHexColor, { message: "Invalid hex color format" }).describe('Border color (hex format).'),
    dashStyle: z.enum(['SOLID', 'DOTTED', 'DASHED']).optional().default('SOLID').describe('Border dash style.'),
  }).optional().describe('Top border properties.'),
  borderBottom: z.object({
    width: z.number().min(0).describe('Border width in points.'),
    color: z.string().refine(validateHexColor, { message: "Invalid hex color format" }).describe('Border color (hex format).'),
    dashStyle: z.enum(['SOLID', 'DOTTED', 'DASHED']).optional().default('SOLID').describe('Border dash style.'),
  }).optional().describe('Bottom border properties.'),
  borderLeft: z.object({
    width: z.number().min(0).describe('Border width in points.'),
    color: z.string().refine(validateHexColor, { message: "Invalid hex color format" }).describe('Border color (hex format).'),
    dashStyle: z.enum(['SOLID', 'DOTTED', 'DASHED']).optional().default('SOLID').describe('Border dash style.'),
  }).optional().describe('Left border properties.'),
  borderRight: z.object({
    width: z.number().min(0).describe('Border width in points.'),
    color: z.string().refine(validateHexColor, { message: "Invalid hex color format" }).describe('Border color (hex format).'),
    dashStyle: z.enum(['SOLID', 'DOTTED', 'DASHED']).optional().default('SOLID').describe('Border dash style.'),
  }).optional().describe('Right border properties.'),
}).describe("Parameters for table cell styling.");

export type TableCellStyleArgs = z.infer<typeof TableCellStyleParameters>;

// --- Google Calendar Parameter Schemas ---

export const CalendarIdParameter = z.object({
  calendarId: z.string().default('primary').describe('The calendar ID (e.g., "primary" for the user\'s primary calendar or the calendar email).'),
});

export const EventIdParameter = z.object({
  eventId: z.string().describe('The event ID.'),
});

export const ListCalendarsParameters = z.object({
  minAccessRole: z.enum(['freeBusyReader', 'reader', 'writer', 'owner']).optional().describe('The minimum access role for calendars to return.'),
  showHidden: z.boolean().optional().default(false).describe('Whether to show hidden calendars.'),
  maxResults: z.number().int().min(1).max(250).optional().default(100).describe('Maximum number of calendars to return (1-250).'),
  pageToken: z.string().optional().describe('Token for pagination.'),
});

export const CreateEventParameters = CalendarIdParameter.extend({
  summary: z.string().min(1).describe('Title of the event.'),
  description: z.string().optional().describe('Description of the event (supports plain text or markdown).'),
  location: z.string().optional().describe('Location of the event.'),
  startDateTime: z.string().optional().describe('Start date-time in RFC3339 format (e.g., "2024-01-15T09:00:00-07:00"). For all-day events, use startDate instead.'),
  endDateTime: z.string().optional().describe('End date-time in RFC3339 format (e.g., "2024-01-15T10:00:00-07:00"). For all-day events, use endDate instead.'),
  startDate: z.string().optional().describe('Start date for all-day event in YYYY-MM-DD format (e.g., "2024-01-15").'),
  endDate: z.string().optional().describe('End date for all-day event in YYYY-MM-DD format (e.g., "2024-01-16"). Exclusive, so for single-day use next day.'),
  timeZone: z.string().optional().describe('Time zone for the event (e.g., "America/Los_Angeles"). Defaults to calendar time zone.'),
  eventType: z.enum(['default', 'focusTime', 'outOfOffice', 'workingLocation']).optional().default('default').describe('Type of event: "default" for regular events, "focusTime" for focus time blocks, "outOfOffice" for out-of-office periods, "workingLocation" for working location events.'),
  attendees: z.array(z.object({
    email: z.string().email().describe('Email address of attendee.'),
    optional: z.boolean().optional().describe('Whether attendance is optional.'),
    responseStatus: z.enum(['needsAction', 'declined', 'tentative', 'accepted']).optional().describe('Response status.'),
  })).optional().describe('List of event attendees.'),
  recurrence: z.array(z.string()).optional().describe('RRULE, EXDATE, RDATE for recurring events (e.g., ["RRULE:FREQ=DAILY;COUNT=5"]).'),
  reminders: z.object({
    useDefault: z.boolean().optional().describe('Use default reminders for the calendar.'),
    overrides: z.array(z.object({
      method: z.enum(['email', 'popup']).describe('Reminder method.'),
      minutes: z.number().int().min(0).describe('Minutes before event to trigger reminder.'),
    })).optional().describe('Custom reminder overrides.'),
  }).optional().describe('Event reminders.'),
  conferenceData: z.object({
    createRequest: z.object({
      requestId: z.string().describe('Unique request ID for conference creation.'),
      conferenceSolutionKey: z.object({
        type: z.enum(['hangoutsMeet', 'eventHangout']).describe('Type of conference solution.'),
      }).describe('Conference solution key.'),
    }).optional().describe('Request to create a conference.'),
  }).optional().describe('Conference data for video meetings.'),
  visibility: z.enum(['default', 'public', 'private', 'confidential']).optional().describe('Visibility of the event.'),
  colorId: z.string().optional().describe('Color ID for the event (1-11).'),
});

export const UpdateEventParameters = CalendarIdParameter.extend({
  eventId: z.string().describe('The event ID to update.'),
  summary: z.string().optional().describe('New title of the event.'),
  description: z.string().optional().describe('New description of the event.'),
  location: z.string().optional().describe('New location of the event.'),
  startDateTime: z.string().optional().describe('New start date-time in RFC3339 format.'),
  endDateTime: z.string().optional().describe('New end date-time in RFC3339 format.'),
  startDate: z.string().optional().describe('New start date for all-day event in YYYY-MM-DD format.'),
  endDate: z.string().optional().describe('New end date for all-day event in YYYY-MM-DD format.'),
  timeZone: z.string().optional().describe('New time zone for the event.'),
  attendees: z.array(z.object({
    email: z.string().email().describe('Email address of attendee.'),
    optional: z.boolean().optional().describe('Whether attendance is optional.'),
  })).optional().describe('New list of event attendees (replaces existing).'),
  recurrence: z.array(z.string()).optional().describe('New recurrence rules (replaces existing).'),
  reminders: z.object({
    useDefault: z.boolean().optional().describe('Use default reminders.'),
    overrides: z.array(z.object({
      method: z.enum(['email', 'popup']).describe('Reminder method.'),
      minutes: z.number().int().min(0).describe('Minutes before event.'),
    })).optional(),
  }).optional().describe('New event reminders.'),
  visibility: z.enum(['default', 'public', 'private', 'confidential']).optional().describe('New visibility.'),
  colorId: z.string().optional().describe('New color ID (1-11).'),
  status: z.enum(['confirmed', 'tentative', 'cancelled']).optional().describe('Event status.'),
});

export const ListEventsParameters = CalendarIdParameter.extend({
  timeMin: z.string().optional().describe('Lower bound (inclusive) for event start time in RFC3339 format (e.g., "2024-01-01T00:00:00Z").'),
  timeMax: z.string().optional().describe('Upper bound (exclusive) for event start time in RFC3339 format.'),
  maxResults: z.number().int().min(1).max(2500).optional().default(250).describe('Maximum number of events to return (1-2500).'),
  pageToken: z.string().optional().describe('Token for pagination.'),
  orderBy: z.enum(['startTime', 'updated']).optional().describe('Order of events returned.'),
  singleEvents: z.boolean().optional().default(true).describe('Whether to expand recurring events into instances.'),
  showDeleted: z.boolean().optional().default(false).describe('Whether to include deleted events.'),
  q: z.string().optional().describe('Free text search query.'),
});

export const FreeBusyParameters = z.object({
  timeMin: z.string().describe('Start time for free/busy query in RFC3339 format (e.g., "2024-01-15T09:00:00Z").'),
  timeMax: z.string().describe('End time for free/busy query in RFC3339 format.'),
  calendarIds: z.array(z.string()).min(1).describe('List of calendar IDs to query (e.g., ["primary", "email@example.com"]).'),
  timeZone: z.string().optional().describe('Time zone for the query (e.g., "America/Los_Angeles").'),
});

export type CreateEventArgs = z.infer<typeof CreateEventParameters>;
export type UpdateEventArgs = z.infer<typeof UpdateEventParameters>;
export type ListEventsArgs = z.infer<typeof ListEventsParameters>;

// --- Error Class ---
// Use FastMCP's UserError for client-facing issues
// Define a custom error for internal issues if needed
export class NotImplementedError extends Error {
constructor(message = "This feature is not yet implemented.") {
super(message);
this.name = "NotImplementedError";
}
}
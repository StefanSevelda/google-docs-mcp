// src/tools/CalendarTools.ts
import { FastMCP, UserError } from 'fastmcp';
import { z } from 'zod';
import { calendar_v3 } from 'googleapis';
import { getCalendarClient } from '../clients/googleClients.js';
import {
    ListCalendarsParameters,
    ListEventsParameters,
    CalendarIdParameter,
    CreateEventParameters,
    UpdateEventParameters
} from '../types.js';

/**
 * Calendar Tools class - handles all Google Calendar operations
 * Includes: list calendars, list/get/create/update/delete events
 */
export class CalendarTools {
    /**
     * Register all Calendar tools with the MCP server
     */
    static registerTools(server: FastMCP) {
        this.registerListCalendarsTool(server);
        this.registerListCalendarEventsTool(server);
        this.registerGetCalendarEventTool(server);
        this.registerCreateCalendarEventTool(server);
        this.registerUpdateCalendarEventTool(server);
        this.registerDeleteCalendarEventTool(server);
    }

    private static registerListCalendarsTool(server: FastMCP) {
        server.addTool({
            name: 'listCalendars',
            description: 'Lists calendars accessible to the authenticated user.',
            parameters: ListCalendarsParameters,
            execute: async (args, { log }) => {
                const calendar = await getCalendarClient();
                log.info(`Listing calendars. Min access role: ${args.minAccessRole || 'none'}`);

                try {
                    const response = await calendar.calendarList.list({
                        minAccessRole: args.minAccessRole,
                        showHidden: args.showHidden,
                        maxResults: args.maxResults,
                        pageToken: args.pageToken,
                    });

                    const calendars = response.data.items || [];

                    if (calendars.length === 0) {
                        return 'No calendars found or accessible.';
                    }

                    let result = `Found ${calendars.length} calendar${calendars.length !== 1 ? 's' : ''}:\n\n`;

                    calendars.forEach((cal, index) => {
                        result += `${index + 1}. **${cal.summary}**\n`;
                        result += `   ID: ${cal.id}\n`;
                        result += `   Access Role: ${cal.accessRole}\n`;
                        result += `   Time Zone: ${cal.timeZone || 'Unknown'}\n`;
                        if (cal.description) {
                            result += `   Description: ${cal.description}\n`;
                        }
                        if (cal.primary) {
                            result += `   **Primary Calendar**\n`;
                        }
                        result += '\n';
                    });

                    if (response.data.nextPageToken) {
                        result += `\n**More results available.** Use pageToken="${response.data.nextPageToken}" to get the next page.`;
                    }

                    return result;
                } catch (error: any) {
                    log.error(`Error listing calendars: ${error.message || error}`);
                    if (error.code === 403) throw new UserError('Permission denied. Make sure you have granted Google Calendar access.');
                    throw new UserError(`Failed to list calendars: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerListCalendarEventsTool(server: FastMCP) {
        server.addTool({
            name: 'listCalendarEvents',
            description: 'Lists events from a specific calendar within a time range.',
            parameters: ListEventsParameters,
            execute: async (args, { log }) => {
                const calendar = await getCalendarClient();
                log.info(`Listing events from calendar: ${args.calendarId}`);

                try {
                    const response = await calendar.events.list({
                        calendarId: args.calendarId,
                        timeMin: args.timeMin,
                        timeMax: args.timeMax,
                        maxResults: args.maxResults,
                        pageToken: args.pageToken,
                        orderBy: args.orderBy,
                        singleEvents: args.singleEvents,
                        showDeleted: args.showDeleted,
                        q: args.q,
                    });

                    const events = response.data.items || [];

                    if (events.length === 0) {
                        return `No events found in calendar ${args.calendarId} for the specified time range.`;
                    }

                    let result = `Found ${events.length} event${events.length !== 1 ? 's' : ''}:\n\n`;

                    events.forEach((event, index) => {
                        result += `${index + 1}. **${event.summary || '(No title)'}**\n`;
                        result += `   Event ID: ${event.id}\n`;

                        if (event.start?.dateTime) {
                            const startTime = new Date(event.start.dateTime).toLocaleString();
                            const endTime = event.end?.dateTime ? new Date(event.end.dateTime).toLocaleString() : 'Unknown';
                            result += `   Time: ${startTime} - ${endTime}\n`;
                        } else if (event.start?.date) {
                            result += `   Date: ${event.start.date}${event.end?.date ? ` to ${event.end.date}` : ''} (All-day)\n`;
                        }

                        if (event.location) {
                            result += `   Location: ${event.location}\n`;
                        }

                        if (event.description) {
                            const desc = event.description.length > 100 ? event.description.substring(0, 100) + '...' : event.description;
                            result += `   Description: ${desc}\n`;
                        }

                        if (event.attendees && event.attendees.length > 0) {
                            result += `   Attendees: ${event.attendees.length}\n`;
                        }

                        if (event.hangoutLink) {
                            result += `   Meeting Link: ${event.hangoutLink}\n`;
                        }

                        if (event.htmlLink) {
                            result += `   View in Calendar: ${event.htmlLink}\n`;
                        }

                        result += '\n';
                    });

                    if (response.data.nextPageToken) {
                        result += `\n**More events available.** Use pageToken="${response.data.nextPageToken}" to get the next page.`;
                    }

                    return result;
                } catch (error: any) {
                    log.error(`Error listing events: ${error.message || error}`);
                    if (error.code === 404) throw new UserError(`Calendar not found: ${args.calendarId}`);
                    if (error.code === 403) throw new UserError('Permission denied. Make sure you have access to this calendar.');
                    throw new UserError(`Failed to list events: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerGetCalendarEventTool(server: FastMCP) {
        server.addTool({
            name: 'getCalendarEvent',
            description: 'Gets detailed information about a specific calendar event.',
            parameters: CalendarIdParameter.extend({
                eventId: z.string().describe('The event ID.'),
            }),
            execute: async (args, { log }) => {
                const calendar = await getCalendarClient();
                log.info(`Getting event ${args.eventId} from calendar ${args.calendarId}`);

                try {
                    const response = await calendar.events.get({
                        calendarId: args.calendarId,
                        eventId: args.eventId,
                    });

                    const event = response.data;

                    let result = `**Event Details:**\n\n`;
                    result += `**Title:** ${event.summary || '(No title)'}\n`;
                    result += `**Event ID:** ${event.id}\n`;
                    result += `**Status:** ${event.status}\n`;

                    if (event.start?.dateTime) {
                        const startTime = new Date(event.start.dateTime).toLocaleString();
                        const endTime = event.end?.dateTime ? new Date(event.end.dateTime).toLocaleString() : 'Unknown';
                        result += `**Time:** ${startTime} - ${endTime}\n`;
                        result += `**Time Zone:** ${event.start.timeZone || 'Default'}\n`;
                    } else if (event.start?.date) {
                        result += `**Date:** ${event.start.date}${event.end?.date ? ` to ${event.end.date}` : ''} (All-day event)\n`;
                    }

                    if (event.location) {
                        result += `**Location:** ${event.location}\n`;
                    }

                    if (event.description) {
                        result += `**Description:**\n${event.description}\n\n`;
                    }

                    if (event.attendees && event.attendees.length > 0) {
                        result += `**Attendees:**\n`;
                        event.attendees.forEach(attendee => {
                            const status = attendee.responseStatus || 'needsAction';
                            const optional = attendee.optional ? ' (optional)' : '';
                            result += `  - ${attendee.email}${optional}: ${status}\n`;
                        });
                        result += '\n';
                    }

                    if (event.recurrence && event.recurrence.length > 0) {
                        result += `**Recurrence:**\n`;
                        event.recurrence.forEach(rule => {
                            result += `  ${rule}\n`;
                        });
                        result += '\n';
                    }

                    if (event.hangoutLink) {
                        result += `**Meeting Link:** ${event.hangoutLink}\n`;
                    }

                    if (event.conferenceData?.entryPoints) {
                        result += `**Conference Info:**\n`;
                        event.conferenceData.entryPoints.forEach(entry => {
                            result += `  ${entry.entryPointType}: ${entry.uri || entry.label}\n`;
                        });
                        result += '\n';
                    }

                    if (event.htmlLink) {
                        result += `**View in Calendar:** ${event.htmlLink}\n`;
                    }

                    if (event.creator) {
                        result += `**Created by:** ${event.creator.email}\n`;
                    }

                    if (event.created) {
                        result += `**Created:** ${new Date(event.created).toLocaleString()}\n`;
                    }

                    if (event.updated) {
                        result += `**Last Updated:** ${new Date(event.updated).toLocaleString()}\n`;
                    }

                    return result;
                } catch (error: any) {
                    log.error(`Error getting event: ${error.message || error}`);
                    if (error.code === 404) throw new UserError(`Event not found: ${args.eventId}`);
                    if (error.code === 403) throw new UserError('Permission denied. Make sure you have access to this calendar.');
                    throw new UserError(`Failed to get event: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerCreateCalendarEventTool(server: FastMCP) {
        server.addTool({
            name: 'createCalendarEvent',
            description: 'Creates a new event in a Google Calendar. Supports regular events, focus time, out of office, and working location events.',
            parameters: CreateEventParameters,
            execute: async (args, { log }) => {
                const calendar = await getCalendarClient();
                log.info(`Creating ${args.eventType} event "${args.summary}" in calendar ${args.calendarId}`);

                try {
                    // Validate that we have either dateTime or date for start/end
                    if (!args.startDateTime && !args.startDate) {
                        throw new UserError('Must provide either startDateTime (for timed events) or startDate (for all-day events).');
                    }

                    if (!args.endDateTime && !args.endDate) {
                        throw new UserError('Must provide either endDateTime (for timed events) or endDate (for all-day events).');
                    }

                    const eventResource: calendar_v3.Schema$Event = {
                        summary: args.summary,
                        description: args.description,
                        location: args.location,
                        start: args.startDateTime
                            ? { dateTime: args.startDateTime, timeZone: args.timeZone }
                            : { date: args.startDate },
                        end: args.endDateTime
                            ? { dateTime: args.endDateTime, timeZone: args.timeZone }
                            : { date: args.endDate },
                        attendees: args.attendees,
                        recurrence: args.recurrence,
                        reminders: args.reminders,
                        conferenceData: args.conferenceData,
                        visibility: args.visibility,
                        colorId: args.colorId,
                    };

                    // Apply event type-specific properties
                    switch (args.eventType) {
                        case 'focusTime':
                            // Focus time: block out time for deep work
                            eventResource.eventType = 'focusTime';
                            // Set transparency to opaque (shows as busy)
                            eventResource.transparency = 'opaque';
                            // Default to private if not specified
                            if (!args.visibility) {
                                eventResource.visibility = 'private';
                            }
                            // Disable reminders by default for focus time
                            if (!args.reminders) {
                                eventResource.reminders = { useDefault: false, overrides: [] };
                            }
                            log.info('Creating focus time event with busy status');
                            break;

                        case 'outOfOffice':
                            // Out of office: mark user as unavailable
                            eventResource.eventType = 'outOfOffice';
                            // Set transparency to opaque (shows as busy)
                            eventResource.transparency = 'opaque';
                            // Out of office events MUST NOT have a description - remove it if provided
                            delete eventResource.description;
                            log.info('Creating out-of-office event');
                            break;

                        case 'workingLocation':
                            // Working location: indicate where user is working from
                            eventResource.eventType = 'workingLocation';
                            // Location is required for working location events
                            if (!args.location) {
                                throw new UserError('Location is required for working location events');
                            }
                            // Set transparency to transparent (shows as available)
                            eventResource.transparency = 'transparent';
                            log.info(`Creating working location event at ${args.location}`);
                            break;

                        case 'default':
                        default:
                            // Regular event - no special properties
                            log.info('Creating regular calendar event');
                            break;
                    }

                    const response = await calendar.events.insert({
                        calendarId: args.calendarId,
                        requestBody: eventResource,
                        conferenceDataVersion: args.conferenceData ? 1 : undefined,
                    });

                    const event = response.data;
                    let result = `Successfully created ${args.eventType === 'default' ? '' : args.eventType + ' '}event "${event.summary}"\n`;
                    result += `Event ID: ${event.id}\n`;
                    result += `Event Type: ${args.eventType}\n`;

                    if (event.start?.dateTime) {
                        result += `Start: ${new Date(event.start.dateTime).toLocaleString()}\n`;
                        result += `End: ${event.end?.dateTime ? new Date(event.end.dateTime).toLocaleString() : 'Unknown'}\n`;
                    } else if (event.start?.date) {
                        result += `Date: ${event.start.date}${event.end?.date ? ` to ${event.end.date}` : ''} (All-day)\n`;
                    }

                    if (event.location) {
                        result += `Location: ${event.location}\n`;
                    }

                    if (event.transparency) {
                        result += `Status: ${event.transparency === 'opaque' ? 'Busy' : 'Available'}\n`;
                    }

                    if (event.htmlLink) {
                        result += `View in Calendar: ${event.htmlLink}\n`;
                    }

                    if (event.hangoutLink) {
                        result += `Meeting Link: ${event.hangoutLink}\n`;
                    }

                    return result;
                } catch (error: any) {
                    log.error(`Error creating event: ${error.message || error}`);
                    if (error.code === 404) throw new UserError(`Calendar not found: ${args.calendarId}`);
                    if (error.code === 403) throw new UserError('Permission denied. Make sure you have write access to this calendar.');
                    throw new UserError(`Failed to create event: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerUpdateCalendarEventTool(server: FastMCP) {
        server.addTool({
            name: 'updateCalendarEvent',
            description: 'Updates an existing calendar event.',
            parameters: UpdateEventParameters,
            execute: async (args, { log }) => {
                const calendar = await getCalendarClient();
                log.info(`Updating event ${args.eventId} in calendar ${args.calendarId}`);

                try {
                    // First get the existing event
                    const existingEvent = await calendar.events.get({
                        calendarId: args.calendarId,
                        eventId: args.eventId,
                    });

                    // Build the update object with only provided fields
                    const eventUpdate: calendar_v3.Schema$Event = {
                        ...existingEvent.data,
                    };

                    if (args.summary !== undefined) eventUpdate.summary = args.summary;
                    if (args.description !== undefined) eventUpdate.description = args.description;
                    if (args.location !== undefined) eventUpdate.location = args.location;
                    if (args.visibility !== undefined) eventUpdate.visibility = args.visibility;
                    if (args.colorId !== undefined) eventUpdate.colorId = args.colorId;
                    if (args.status !== undefined) eventUpdate.status = args.status;

                    // Update start/end times if provided
                    if (args.startDateTime) {
                        eventUpdate.start = { dateTime: args.startDateTime, timeZone: args.timeZone };
                    } else if (args.startDate) {
                        eventUpdate.start = { date: args.startDate };
                    }

                    if (args.endDateTime) {
                        eventUpdate.end = { dateTime: args.endDateTime, timeZone: args.timeZone };
                    } else if (args.endDate) {
                        eventUpdate.end = { date: args.endDate };
                    }

                    if (args.attendees !== undefined) eventUpdate.attendees = args.attendees;
                    if (args.recurrence !== undefined) eventUpdate.recurrence = args.recurrence;
                    if (args.reminders !== undefined) eventUpdate.reminders = args.reminders;

                    const response = await calendar.events.update({
                        calendarId: args.calendarId,
                        eventId: args.eventId,
                        requestBody: eventUpdate,
                    });

                    const event = response.data;
                    let result = `Successfully updated event "${event.summary}"\n`;
                    result += `Event ID: ${event.id}\n`;

                    if (event.htmlLink) {
                        result += `View in Calendar: ${event.htmlLink}\n`;
                    }

                    return result;
                } catch (error: any) {
                    log.error(`Error updating event: ${error.message || error}`);
                    if (error.code === 404) throw new UserError(`Event or calendar not found: ${args.eventId}`);
                    if (error.code === 403) throw new UserError('Permission denied. Make sure you have write access to this calendar.');
                    throw new UserError(`Failed to update event: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }

    private static registerDeleteCalendarEventTool(server: FastMCP) {
        server.addTool({
            name: 'deleteCalendarEvent',
            description: 'Deletes an event from a Google Calendar.',
            parameters: CalendarIdParameter.extend({
                eventId: z.string().describe('The event ID to delete.'),
            }),
            execute: async (args, { log }) => {
                const calendar = await getCalendarClient();
                log.info(`Deleting event ${args.eventId} from calendar ${args.calendarId}`);

                try {
                    // Get event details before deleting
                    const event = await calendar.events.get({
                        calendarId: args.calendarId,
                        eventId: args.eventId,
                    });

                    const eventTitle = event.data.summary || '(No title)';

                    await calendar.events.delete({
                        calendarId: args.calendarId,
                        eventId: args.eventId,
                    });

                    return `Successfully deleted event "${eventTitle}" (ID: ${args.eventId})`;
                } catch (error: any) {
                    log.error(`Error deleting event: ${error.message || error}`);
                    if (error.code === 404) throw new UserError(`Event not found: ${args.eventId}`);
                    if (error.code === 403) throw new UserError('Permission denied. Make sure you have write access to this calendar.');
                    if (error.code === 410) throw new UserError('Event has already been deleted.');
                    throw new UserError(`Failed to delete event: ${error.message || 'Unknown error'}`);
                }
            }
        });
    }
}

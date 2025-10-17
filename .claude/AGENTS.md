# Claude Code Agents

This document lists all custom agents configured for this project.

## Active Agents

### 1. senior-engineer

**File:** `.claude/agents/senior-engineer.md`

**Description:** Senior Software Engineer specialized in code quality, refactoring, and software architecture review.

**Model:** sonnet

**Color:** purple

**When to Use:**
- After implementing a new function, class, module, or feature
- After fixing bugs or making significant changes to existing code
- When you want expert review for code smells and readability improvements
- Proactively after completing logical chunks of code

**Capabilities:**
- Identifies code smells and anti-patterns
- Assesses code readability and clarity
- Proposes specific refactoring solutions
- Provides prioritized recommendations with examples
- Evaluates code against SOLID principles and best practices

**Output Format:**
- Summary with quality assessment (1-5 scale)
- Detailed findings with severity levels (CRITICAL, HIGH, MEDIUM, LOW)
- Refactoring roadmap with prioritized tasks

**Created:** 2025-10-17
**Renamed from:** code-refactoring-reviewer (2025-10-17)

---

### 2. security-auditor

**File:** `.claude/agents/security-auditor.md`

**Description:** Elite security engineer specializing in identifying backdoors, vulnerabilities, and malicious code patterns.

**Model:** sonnet

**Color:** red

**When to Use:**
- Reviewing new code changes for security vulnerabilities
- Auditing authentication and authorization flows
- Examining API integrations and external data handling
- Checking input validation and sanitization
- Investigating suspicious code patterns
- After implementing file upload, database queries, or URL handling features

**Capabilities:**
- Identifies injection flaws, XSS, CSRF, and other OWASP Top 10 vulnerabilities
- Detects backdoors and malicious code patterns
- Analyzes authentication and session management
- Reviews cryptographic implementations
- Provides severity classification (CRITICAL, HIGH, MEDIUM, LOW, INFO)
- Offers specific remediation guidance with code examples

**Output Format:**
- Security audit report with summary
- Findings organized by severity level
- Attack scenarios and exploitation details
- Specific remediation recommendations
- Security best practices

**Created:** 2025-10-17

---

### 3. google-sheets-api-expert

**File:** `.claude/agents/google-sheets-api-expert.md`

**Description:** Elite TypeScript engineer specializing in Google Sheets API integration and Workspace APIs.

**Model:** sonnet

**Color:** orange

**When to Use:**
- Adding Google Sheets functionality to the MCP server
- Implementing batch operations or data transformations for Sheets
- Debugging Sheets API authentication or quota issues
- Optimizing API calls for performance
- Creating type-safe Sheets API wrappers

**Capabilities:**
- Expert in Sheets API v4 methods and batch operations
- TypeScript excellence with Zod schemas and proper typing
- OAuth2 and service account authentication patterns
- Performance optimization and rate limit handling
- MCP tool design for Sheets integration

**Output Format:**
- Type-safe TypeScript code
- Comprehensive error handling
- Performance optimization suggestions
- Security best practices

**Created:** 2025-10-17

---

### 4. architecture-documenter

**File:** `.claude/agents/architecture-documenter.md`

**Description:** Elite Software Architect specializing in C4 diagrams, sequence diagrams, and Architecture Decision Records (ADRs).

**Model:** sonnet

**Color:** pink

**When to Use:**
- Creating or updating architectural documentation
- After significant architectural changes or new feature implementations
- When system design discussions occur
- Documenting architectural decisions (ADRs)
- Creating C4 diagrams (Context, Container, Component, Code)
- Drawing sequence diagrams for interaction flows

**Capabilities:**
- Creates C4 diagrams at appropriate abstraction levels using Mermaid/PlantUML
- Draws detailed sequence diagrams showing interactions and flows
- Writes comprehensive ADRs following standard template
- Analyzes codebases to extract architectural patterns
- Maintains consistency with existing documentation

**Output Format:**
- C4 diagrams in Mermaid or PlantUML format
- Sequence diagrams with clear participant labels
- ADRs in markdown with standard structure
- Clear explanations of architectural decisions

**Created:** 2025-10-17

---

### 5. google-docs-api-engineer

**File:** `.claude/agents/google-docs-api-engineer.md`

**Description:** Elite TypeScript engineer specializing in Google Docs API, Drive API, and this MCP server's codebase.

**Model:** sonnet

**Color:** cyan

**When to Use:**
- Adding new tools to the Google Docs MCP server
- Debugging Google Docs/Drive API issues
- Refactoring existing Google Docs integration code
- Implementing document structure manipulation features
- Enhancing type safety in types.ts
- Working with batch updates, text finding, or formatting

**Capabilities:**
- Deep knowledge of Google Docs API v1 and Drive API v3
- Expert in this codebase's architecture (FastMCP, auth.ts, googleDocsApiHelpers.ts)
- Understands security requirements (query injection, SSRF, path traversal prevention)
- Implements batch update patterns and text finding with multi-segment support
- Maintains consistency with established patterns

**Output Format:**
- Production-ready TypeScript code
- Proper imports and type annotations
- Security validations
- Actionable error messages
- Architecture explanations

**Created:** 2025-10-17

---

### 6. google-chat-api-engineer

**File:** `.claude/agents/google-chat-api-engineer.md`

**Description:** Elite TypeScript engineer specializing in Google Chat API development and bot implementations.

**Model:** sonnet

**Color:** yellow

**When to Use:**
- Implementing Google Chat bots or applications
- Handling webhooks and event subscriptions
- Creating interactive cards and dialogs
- Managing chat spaces and memberships
- Implementing slash commands and @mention handling
- Debugging Google Chat API issues

**Capabilities:**
- Expert in Google Chat REST API v1
- Builds webhook handlers with proper validation
- Implements interactive cards (Card v2) and UI components
- Handles authentication flows (service accounts, OAuth2)
- TypeScript excellence with proper error handling
- Security-focused development (webhook verification, input validation)

**Output Format:**
- Type-safe TypeScript code
- Webhook handler implementations
- Card builder utilities
- Security best practices
- Clear documentation

**Created:** 2025-10-17

---

## Agent Management

### Creating New Agents

To create a new agent, use the `/agent` command in Claude Code:
```
/agent
```

Agents are stored in `.claude/agents/` directory as markdown files with frontmatter configuration.

### Agent Configuration Format

```markdown
---
name: agent-name
description: When and how to use this agent
model: sonnet|opus|haiku
color: purple|blue|green|red|yellow|orange|cyan|pink
---

Agent prompt and instructions here...
```

### Listing Agents

To list all available agents:
```
/agents
```

---

## Project-Specific Agent Guidelines

For this Google Docs MCP project:

1. **Code Review**: Use `senior-engineer` after implementing new MCP tools or helper functions
2. **Security Audits**: Use `security-auditor` after implementing authentication, file operations, URL handling, or query construction features
3. **Google Docs Features**: Use `google-docs-api-engineer` for all Google Docs/Drive API integration work
4. **Google Sheets Features**: Use `google-sheets-api-expert` if expanding to Sheets functionality
5. **Google Chat Features**: Use `google-chat-api-engineer` if adding Chat bot capabilities
6. **Architecture Documentation**: Use `architecture-documenter` after significant architectural changes or for system design discussions

---

*Last Updated: 2025-10-17*

---
title: Enabling Next.js MCP Server for Coding Agents
nav_title: Next.js MCP Server
description: Learn how to use Next.js MCP support to allow coding agents access to your application state
---

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io) is an open standard that allows AI agents and coding assistants to interact with your applications through a standardized interface.

Next.js 16+ includes MCP support that enables coding agents to access your application's internals in real-time. To use this functionality, install the [`next-devtools-mcp`](https://www.npmjs.com/package/next-devtools-mcp) package.

## Getting started

**Requirements:** Next.js 16 or above

Add `next-devtools-mcp` to the `.mcp.json` file at the root of your project:

```json filename=".mcp.json"
{
  "mcpServers": {
    "next-devtools": {
      "command": "npx",
      "args": ["-y", "next-devtools-mcp@latest"]
    }
  }
}
```

That's it! When you start your development server, `next-devtools-mcp` will automatically discover and connect to your running Next.js instance.

For more configuration options, see the [next-devtools-mcp repository](https://github.com/vercel/next-devtools-mcp).

## Capabilities

`next-devtools-mcp` provides coding agents with a growing set of capabilities:

### Application Runtime Access

- **Error Detection**: Retrieve current build errors, runtime errors, and type errors from your dev server
- **Live State Queries**: Access real-time application state and runtime information
- **Page Metadata**: Query page routes, components, and rendering details
- **Server Actions**: Inspect Server Actions and component hierarchies
- **Development Logs**: Access development server logs and console output

### Development Tools

- **Next.js Knowledge Base**: Query comprehensive Next.js documentation and best practices
- **Migration and Upgrade Tools**: Automated helpers for upgrading to Next.js 16 with codemods
- **Cache Components Guide**: Setup and configuration assistance for Cache Components
- **Browser Testing**: [Playwright MCP](https://github.com/microsoft/playwright-mcp) integration for verifying pages in the browser

> **Note:** The Next.js team is actively expanding these capabilities. New tools and features are added regularly to improve the agent development experience.

## Development workflow

1. Start your Next.js development server:

```bash filename="Terminal"
npm run dev
```

2. Your Coding Agent will automatically connect to the running Next.js instance via `next-devtools-mcp`

3. Open your application in the browser to view pages

4. Query your agent for insights and diagnostics (see examples below)

### Available tools

Through `next-devtools-mcp`, agents can use the following tools:

- **`get_errors`**: Retrieve current build errors, runtime errors, and type errors from your dev server
- **`get_logs`**: Get the path to the development log file containing browser console logs and server output
- **`get_page_metadata`**: Get metadata about specific pages including routes, components, and rendering information
- **`get_project_metadata`**: Retrieve project structure, configuration, and dev server URL
- **`get_routes`**: Get all routes that will become entry points by scanning the filesystem. Returns routes grouped by router type (appRouter, pagesRouter). Dynamic segments appear as `[param]` or `[...slug]` patterns
- **`get_server_action_by_id`**: Look up Server Actions by their ID to find the source file and function name

## Using with agents

MCP-compatible Coding Agents can automatically discover and connect to your Next.js development server, providing them with rich context about your project.

### Benefits for agent-assisted development

Agents can:

- **Make context-aware suggestions**: Recommend the right place to add new features based on your existing structure
- **Query live application state**: Check current configuration, routes, and middleware during development
- **Understand your app router pages layout**: Know exactly which page and layout are rendered
- **Provide accurate implementations**: Generate code that follows your project's patterns and conventions

## Examples

### Error detection and diagnosis

Ask your agent about errors in real-time:

```bash
User: "What errors are currently in my application?"
```

The agent will:

- Query your running Next.js application via `next-devtools-mcp`
- Retrieve current build errors, runtime errors, and type errors
- Analyze the errors and provide actionable fixes

<details>
<summary>Agent response (click to expand)</summary>

```bash
> fix errors on the page

⏺ I'll help you fix the errors on the page. Let me first check what errors exist by looking at the
  current state of the project.

⏺ next-devtools - nextjs_runtime (MCP)(action: "discover_servers")
⏺ next-devtools - nextjs_runtime (MCP)(action: "call_tool", toolName: "get_errors")

⏺ I found a hydration error on the /about page. The error shows that the server is rendering
  "server" but the client is rendering "client", causing a mismatch. Let me create a todo list and fix
   this issue.

⏺ Perfect! Now let me check for errors on the page.           01:14 PM  claude-sonnet-4-5-20250929

⏺ next-devtools - nextjs_runtime (MCP)(action: "call_tool", toolName: "get_errors")
  ⎿ {
      "success": true,
      "port": 3000,
      "toolName": "get_errors",
      "result": {
        "content": [
          {
            "type": "text",
            "text": "# Found errors in 1 browser session(s)\n\n## Session: /about\n\n**1 error(s)
     found**\n\n### Runtime Errors\n\n#### Error 1 (Type: recoverable)\n\n**Error**: Hydration failed
```

</details>

### Upgrading and best practices

Get help with Next.js concepts and migrations:

```bash
User: "Help me upgrade my Next.js app to version 16"
```

The agent will analyze your current version, guide you through automated migrations with codemods, and provide step-by-step instructions for handling breaking changes.

Ask conceptual questions:

```bash
User: "When should I use 'use client' in App Router?"
```

The agent will query the Next.js knowledge base and provide documentation-backed explanations with examples from your codebase.

## How it works

Next.js 16+ includes a built-in MCP endpoint at `/_next/mcp` that runs within your development server. The `next-devtools-mcp` package automatically discovers and communicates with these endpoints, allowing it to:

- Connect to multiple Next.js instances running on different ports
- Forward tool calls to the appropriate Next.js dev server
- Provide a unified interface for coding agents

This architecture decouples the agent interface from the internal implementation, enabling `next-devtools-mcp` to work seamlessly across different Next.js projects.

## Troubleshooting

### MCP server not connecting

- Ensure you're using Next.js v16 or above
- Verify `next-devtools-mcp` is configured in your `.mcp.json`
- Start your development server: `npm run dev`
- Restart your development server if it was already running
- Check that your coding agent has loaded the MCP server configuration

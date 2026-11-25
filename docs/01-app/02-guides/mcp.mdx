---
title: Connecting coding agents to the Next.js MCP server
nav_title: Next.js MCP Server
description: Learn how to give coding agents access to your running Next.js app through the built-in MCP endpoint.
related:
  links:
    - app/guides/ai-agents
---

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io) is an open standard that lets AI agents and coding assistants interact with your applications through one shared interface.

In Next.js 16 and later, the development server exposes an MCP endpoint at `/_next/mcp`. It gives coding agents the running app's view of errors, routes, logs, and compilation issues. To connect your agent client to it, install the [`next-devtools-mcp`](https://www.npmjs.com/package/next-devtools-mcp) package.

Skills such as [`next-dev-loop`](/docs/app/guides/ai-agents#next-dev-loop) call `/_next/mcp` directly, so they work without this setup.

## Getting started

Install `next-devtools-mcp` for the coding agents on your machine with [`add-mcp`](https://www.npmjs.com/package/add-mcp):

```bash filename="Terminal"
npx add-mcp next-devtools-mcp@latest
```

Or add it to the `.mcp.json` file at the root of your project:

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

When you start your development server, `next-devtools-mcp` discovers and connects to the running Next.js instance. For client-specific setup, see the [next-devtools-mcp repository](https://github.com/vercel/next-devtools-mcp).

## Capabilities

`next-devtools-mcp` connects your agent client to the Next.js development server. It gives agents these tools:

- **`nextjs_index`**: Discovers running Next.js dev servers and lists the runtime tools each one exposes.
- **`nextjs_call`**: Calls a runtime tool on a discovered dev server.
- **`nextjs_docs`**: Points the agent at the version-matched docs bundled with your installed Next.js in `node_modules/next/dist/docs/`.
- **`browser_eval`**: Points the agent at the [`agent-browser`](https://github.com/vercel-labs/agent-browser) CLI for verifying pages in a real browser.

`nextjs_docs` and `browser_eval` don't do the work themselves. They tell the agent where the docs are or how to run the CLI, and the agent uses them directly.

### Runtime tools

Through `nextjs_call`, agents can use the tools the Next.js development server exposes at `/_next/mcp`:

- **`get_errors`**: Get the current error state, including Next.js global errors such as `next.config` validation, browser runtime errors, and build errors with source-mapped stack traces.
- **`get_logs`**: Get the path to the development log file, which contains browser console logs and server output.
- **`get_page_metadata`**: Get runtime metadata about what contributes to the current page render. Requires the page to be open in a browser.
- **`get_project_metadata`**: Get the project path and dev server URL.
- **`get_routes`**: Get all routes that will become entry points by scanning the filesystem. Returns routes grouped by router type (`appRouter`, `pagesRouter`). Dynamic segments appear as `[param]` or `[...slug]` patterns.
- **`get_server_action_by_id`**: Look up a Server Action by its ID to find its source file and export name.
- **`get_compilation_issues`**: Build the module graph for all routes and return compilation issues such as resolve errors, missing modules, and transform errors. Doesn't require a browser session. Turbopack only.
- **`compile_route`**: Compile a specific route without making an HTTP request to it. Accepts either a `routeSpecifier` (for example, `/blog/[slug]`, as returned by `get_routes`) or a `path` (for example, `/blog/hello-world`), which is resolved to the matching route. Returns any compilation issues for the route. Turbopack only.
- **`get_request_insights`**: Get recent App Router request timelines, server fetches, and cache behavior captured by the local span recorder. Requires `experimental.requestInsights`.

With the compilation tools, agents can check whether code compiles from the running dev server instead of running `next build` while they are still editing.

## Development workflow

1. Start your Next.js development server:

```bash package="pnpm"
pnpm dev
```

```bash package="npm"
npm run dev
```

```bash package="yarn"
yarn dev
```

```bash package="bun"
bun dev
```

2. Your coding agent connects to the running Next.js instance through `next-devtools-mcp`.

3. Open the pages you're working on in the browser. Tools such as `get_errors` and `get_page_metadata` read from active browser sessions.

4. Ask your agent about the running app, as in the examples below.

## Examples

### Error detection and diagnosis

Ask your agent about errors in the running app:

```prompt
What errors are currently in my application?
```

The agent will:

- Discover the running dev server with `nextjs_index`
- Call `get_errors` through `nextjs_call` to retrieve the current errors
- Analyze the errors and suggest fixes

<details>
<summary>Agent response (click to expand)</summary>

```txt
> fix errors on the page

⏺ I'll check which errors the running app reports before changing anything.

⏺ next-devtools - nextjs_index (MCP)
⏺ next-devtools - nextjs_call (MCP)(port: 3000, toolName: "get_errors")
  ⎿ # Found errors in 1 browser session(s)

    ## Session: /about

    **1 error(s) found**

    ### Runtime Errors

    #### Error 1 (Type: recoverable)

    **Error**: Hydration failed because the server rendered text didn't match the client.

⏺ The /about page renders "server" on the server and "client" in the browser,
  which causes a hydration mismatch. I'll fix the component and check again.
```

</details>

### Concepts and best practices

Ask conceptual questions:

```prompt
When should I use 'use client' in the App Router?
```

The agent reads the version-matched Next.js docs bundled with your project and answers with examples from your codebase.

## How it works

The Next.js 16+ development server runs a built-in MCP endpoint at `/_next/mcp`. The `next-devtools-mcp` package discovers these endpoints and communicates with them, so it can:

- Connect to multiple Next.js instances running on different ports
- Forward tool calls to the right Next.js dev server
- Give agents one set of tools for every instance

Agents that connect through `next-devtools-mcp` use the same setup across Next.js projects and versions.

The endpoint is enabled by default. To disable it, set `experimental.mcpServer` to `false` in `next.config`.

## Troubleshooting

### MCP server not connecting

- Use Next.js 16 or later
- Verify `next-devtools-mcp` is configured in your agent client, for example in `.mcp.json`
- Check that `experimental.mcpServer` is not set to `false` in `next.config`
- Start your development server with `npm run dev`, or restart it if it was already running
- Check that your coding agent has loaded the MCP server configuration

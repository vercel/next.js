---
name: neon-postgres
description: >-
  Guides and best practices for working with Neon Serverless Postgres.
  Covers setup, connection methods, branching, autoscaling, scale-to-zero,
  read replicas, connection pooling, Neon Auth, and the Neon CLI, MCP server,
  REST API, TypeScript SDK, and Python SDK.
  Use when users ask about "Neon setup", "connect to Neon", "Neon project",
  "DATABASE_URL", "serverless Postgres", "Neon CLI", "neonctl", "Neon MCP",
  "Neon Auth", "@neondatabase/serverless", "@neondatabase/neon-js",
  "scale to zero", "Neon autoscaling", "Neon read replica", or
  "Neon connection pooling".
---

# Neon Serverless Postgres

Guide the user through any Neon-related task: setup, connections, branching, and advanced features. Deliver a working Neon connection, a completed feature configuration, or a specific answer from the official Neon docs.

Neon is a serverless Postgres platform that separates compute and storage to offer autoscaling, branching, instant restore, and scale-to-zero. It's fully compatible with Postgres and works with any language, framework, or ORM that supports Postgres.

## Neon Documentation

The Neon documentation is the source of truth for all Neon-related information. Always verify claims against the official docs before responding. Neon features and APIs evolve, so prefer fetching current docs over relying on training data.

### Fetching Docs as Markdown

Any Neon doc page can be fetched as markdown in two ways:

1. **Append `.md` to the URL** (simplest): https://neon.com/docs/introduction/branching.md
2. **Request `text/markdown`** on the standard URL: `curl -H "Accept: text/markdown" https://neon.com/docs/introduction/branching`

Both return the same markdown content. Use whichever method your tools support.

### Finding the Right Page

The docs index lists every available page with its URL and a short description:

```
https://neon.com/docs/llms.txt
```

Common doc URLs are organized in the topic links below. If you need a page not listed here, search the docs index: https://neon.com/docs/llms.txt. Don't guess URLs.

## What Is Neon

Use this for architecture explanations and terminology (organizations, projects, branches, endpoints) before giving implementation advice.

Link: https://neon.com/docs/introduction/architecture-overview.md

## Getting Started

Use this section when guiding a user through first-time Neon setup.

### Check Status Quo

Before starting setup, inspect the user's codebase and environment:

- Existing database connection code
- Existing Neon MCP server or Neon CLI configuration
- Existence of a `.env` file and `DATABASE_URL` environment variable
- Existing ORM (Prisma, Drizzle, TypeORM) configuration

### Self-Driving Setup With Neon's CLI or MCP Server

Offer to inspect existing connected Neon projects or create new ones using the Neon CLI or MCP server. If neither is set up yet, run init with the `--agent` flag. Use `npx -y` to skip the package install prompt. Auth is handled automatically. If the user is not logged in, it opens their browser for OAuth and waits for completion before proceeding.

```bash
npx -y neonctl@latest init --agent <agent-name>
```

Supported `--agent` values: `cursor`, `copilot`, `claude`, `claude-desktop`, `codex`, `opencode`, `cline`, `gemini-cli`, `goose`, `zed`.

This installs the Neon extension (for Cursor/VS Code) or MCP server (for other agents), creates an API key, and adds the `neon-postgres` agent skill to the project.

If `init` is not suitable, the individual steps can be run non-interactively:

- **Extension:** `cursor --install-extension databricks.neon-local-connect`
- **MCP server:** `npx -y add-mcp https://mcp.neon.tech/mcp -g -n Neon -y -a <agent-name>`
- **Agent skill:** `npx skills add neondatabase/agent-skills --skill neon-postgres --agent <agent-name> -y`

For full CLI installation options, see https://neon.com/docs/reference/cli-install.md

### Setup Flow

**1. Select Organization and Project**

Use MCP server or CLI to list organizations and projects. Let the user select an existing project or create a new one.

**2. Get Connection String**

Use MCP server or CLI to get the connection string. Store it in `.env` as `DATABASE_URL`. Read the file first before modifying to avoid overwriting existing values.

**3. Pick Connection Method & Driver**

Refer to the connection methods guide to pick the correct driver based on deployment platform: https://neon.com/docs/connect/choose-connection.md

**4. User Authentication with Neon Auth (if needed)**

Skip for CLI tools, scripts, or apps without user accounts. If the app needs auth: use MCP server `provision_neon_auth` tool, then see the auth overview (https://neon.com/docs/auth/overview.md) for setup. For auth + database queries, see the JavaScript SDK reference (https://neon.com/docs/reference/javascript-sdk.md).

**5. ORM Setup (optional)**

Check for existing ORM (Prisma, Drizzle, TypeORM). If none, ask if they want one. For Drizzle integration, see https://neon.com/docs/guides/drizzle.md.

**6. Schema Setup**

- Check for existing migration files or ORM schemas
- If none: offer to create an example schema or design one together

### Resume Support

If resuming setup, check what's already configured (MCP connection, `.env` with `DATABASE_URL`, dependencies, schema) and continue from the next incomplete step.

### Security Reminders

Remind users to use environment variables for credentials, never commit connection strings, and use least-privilege database roles.

## Connection Methods & Drivers

Use this when you need to pick the correct transport and driver based on runtime constraints (TCP, HTTP, WebSocket, edge, serverless, long-running).

Link: https://neon.com/docs/connect/choose-connection.md

### Serverless Driver

Use this for `@neondatabase/serverless` patterns, including HTTP queries, WebSocket transactions, and runtime-specific optimizations.

Link: https://neon.com/docs/serverless/serverless-driver.md

### Neon JS SDK

Use this for combined Neon Auth + Data API workflows with PostgREST-style querying and typed client setup.

Link: https://neon.com/docs/reference/javascript-sdk.md

## Developer Tools

Use this for local development enablement with `npx -y neonctl@latest init --agent <agent-name>`, VSCode extension setup, and Neon MCP server configuration.

| Tool             | URL                                             |
| ---------------- | ----------------------------------------------- |
| CLI Init Command | https://neon.com/docs/reference/cli-init.md     |
| VSCode Extension | https://neon.com/docs/local/vscode-extension.md |
| MCP Server       | https://neon.com/docs/ai/neon-mcp-server.md     |
| Neon CLI         | https://neon.com/docs/reference/neon-cli.md     |

### Neon CLI

Use this for terminal-first workflows, scripts, and CI/CD automation with `neonctl`.

Link: https://neon.com/docs/reference/neon-cli.md

## Neon Admin API

The Neon Admin API can be used to manage Neon resources programmatically. It is used behind the scenes by the Neon CLI and MCP server, but can also be used directly for more complex automation workflows or when embedding Neon in other applications.

### Neon REST API

Use this for direct HTTP automation, endpoint-level control, API key auth, rate-limit handling, and operation polling.

Link: https://neon.com/docs/reference/api-reference.md

### Neon TypeScript SDK

Use this when implementing typed programmatic control of Neon resources in TypeScript via `@neondatabase/api-client`.

Link: https://neon.com/docs/reference/typescript-sdk.md

### Neon Python SDK

Use this when implementing programmatic Neon management in Python with the `neon-api` package.

Link: https://neon.com/docs/reference/python-sdk.md

## Neon Auth

Use this for managed user authentication setup, UI components, auth methods, and Neon Auth integration pitfalls in Next.js and React apps.

Link: https://neon.com/docs/auth/overview.md

Neon Auth is also embedded in the Neon JS SDK. Depending on your use case, you may want to use the Neon JS SDK instead of Neon Auth alone. See https://neon.com/docs/connect/choose-connection.md for more details.

## Branching

Use this when the user is planning isolated environments, schema migration testing, preview deployments, or branch lifecycle automation.

Key points:

- Branches are instant, copy-on-write clones (no full data copy).
- Each branch has its own compute endpoint.
- Use the neonctl CLI or MCP server to create, inspect, and compare branches.

Link: https://neon.com/docs/introduction/branching.md

For detailed branch creation workflows (normal vs schema-only branches, reset-from-parent, CLI/MCP selection), fetch the full branching skill:

https://neon.com/docs/ai/skills/neon-postgres-branches/SKILL.md

To install the skill directly:

```bash
npx skills add neondatabase/agent-skills --skill neon-postgres-branches
```

## Autoscaling

Use this when the user needs compute to scale automatically with workload and wants guidance on CU sizing and runtime behavior.

Link: https://neon.com/docs/introduction/autoscaling.md

## Scale to Zero

Use this when optimizing idle costs and discussing suspend/resume behavior, including cold-start trade-offs.

Key points:

- Idle computes suspend automatically (default 5 minutes, configurable) (unless disabled - launch & scale plan only)
- First query after suspend typically has a cold-start penalty (around hundreds of ms)
- Storage remains active while compute is suspended.

Link: https://neon.com/docs/introduction/scale-to-zero.md

## Instant Restore

Use this when the user needs point-in-time recovery or wants to restore data state without traditional backup restore workflows.

Key points:

- History windows for instant restore depend on plan limits.
- Users can create branches from historical points-in-time.
- Time Travel queries can be used for historical inspection workflows.

Link: https://neon.com/docs/introduction/branch-restore.md

## Read Replicas

Use this for read-heavy workloads where the user needs dedicated read-only compute without duplicating storage.

Key points:

- Replicas are read-only compute endpoints sharing the same storage.
- Creation is fast and scaling is independent from primary compute.
- Typical use cases: analytics, reporting, and read-heavy APIs.

Link: https://neon.com/docs/introduction/read-replicas.md

## Connection Pooling

Use this when the user is in serverless or high-concurrency environments and needs safe, scalable Postgres connection management.

Key points:

- Neon pooling uses PgBouncer.
- Add `-pooler` to endpoint hostnames to use pooled connections.
- Pooling is especially important in serverless runtimes with bursty concurrency.

Link: https://neon.com/docs/connect/connection-pooling.md

## IP Allow Lists

Use this when the user needs to restrict database access by trusted networks, IPs, or CIDR ranges.

Link: https://neon.com/docs/introduction/ip-allow.md

## Logical Replication

Use this when integrating CDC pipelines, external Postgres sync, or replication-based data movement.

Key points:

- Neon supports native logical replication workflows.
- Useful for replicating to/from external Postgres systems.

Link: https://neon.com/docs/guides/logical-replication-guide.md

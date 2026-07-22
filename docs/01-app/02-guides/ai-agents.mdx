---
title: How to set up your Next.js project for AI coding agents
nav_title: AI Coding Agents
description: Learn how to configure your Next.js project so AI coding agents use up-to-date documentation instead of outdated training data.
related:
  title: Next Steps
  links:
    - app/guides/mcp
    - app/getting-started/upgrading
    - app/api-reference/cli/create-next-app
    - app/api-reference/cli/next
---

Next.js ships version-matched documentation inside the `next` package, allowing AI coding agents to reference accurate, up-to-date APIs and patterns. An `AGENTS.md` file at the root of your project directs agents to these bundled docs instead of their training data.

Beyond the docs, Next.js gives agents [runtime visibility](#runtime-visibility) into the running dev server, with forwarded browser logs, an [MCP server](/docs/app/guides/mcp), and a browser they can drive. [Skills](#skills-for-multi-step-workflows) package multi-step workflows like adopting Cache Components.

## How it works

When you install `next`, the Next.js documentation is bundled at `node_modules/next/dist/docs/`. The bundled docs mirror the structure of the [Next.js documentation site](https://nextjs.org/docs):

```txt
node_modules/next/dist/docs/
├── 01-app/
│   ├── 01-getting-started/
│   ├── 02-guides/
│   └── 03-api-reference/
├── 02-pages/
├── 03-architecture/
└── index.mdx
```

This means agents always have access to docs that match your installed version, with no network request or external lookup required. [Upgrading Next.js](/docs/app/getting-started/upgrading) also upgrades the bundled docs, including new guidance for existing features.

The `AGENTS.md` file at the root of your project tells agents to read these bundled docs before writing any code. Most AI coding agents, including Claude Code, Cursor, and GitHub Copilot, automatically read `AGENTS.md` when they start a session.

## Getting started

### New projects

[`create-next-app`](/docs/app/api-reference/cli/create-next-app) generates `AGENTS.md` and `CLAUDE.md` automatically. No additional setup is needed:

```bash package="pnpm"
pnpm create next-app@canary
```

```bash package="npm"
npx create-next-app@canary
```

```bash package="yarn"
yarn create next-app@canary
```

```bash package="bun"
bun create next-app@canary
```

If you don't want the agent files, pass `--no-agents-md`:

```bash
npx create-next-app@canary --no-agents-md
```

### Existing projects

On Next.js 16.3 or later, run `next dev`. When an AI coding agent is detected in the environment and no managed block is present, Next.js auto-generates `AGENTS.md` and `CLAUDE.md` at the project root. Existing `AGENTS.md` or `CLAUDE.md` files are upserted, so content outside the managed block is preserved:

```md filename="AGENTS.md"
<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
```

```md filename="CLAUDE.md"
@AGENTS.md
```

Add your own project-specific instructions outside the `<!-- BEGIN:nextjs-agent-rules -->` and `<!-- END:nextjs-agent-rules -->` markers, and they're preserved when Next.js updates the managed block.

### Opting out

We believe leaving auto-generation on is a good default. [Benchmark results on nextjs.org/evals](https://nextjs.org/evals) show agents do better when they read the bundled docs. If you really want to opt out, set `agentRules` to `false` in your config:

```ts filename="next.config.ts"
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  agentRules: false,
}

export default nextConfig
```

### For earlier versions

On version 16.2, the docs are bundled but `AGENTS.md` is not auto-generated. Add the file yourself with an instruction to read the bundled docs at `node_modules/next/dist/docs/` before writing code.

On version 16.1 and earlier, the docs are not bundled either. Use the legacy `agents-md` command, which downloads a version-matched copy to `.next-docs/` in the project root and indexes it in `AGENTS.md`:

```bash
npx @next/codemod@canary agents-md
```

## Runtime visibility

Agents also need to see what the running app is doing. Runtime errors, client-side warnings, and rendered output live in the browser, where agents can't look. Next.js surfaces two complementary views that an agent can read from the terminal.

First, `next dev` forwards browser console errors and warnings to the terminal (the [`logging.browserToTerminal`](/docs/app/api-reference/config/next-config-js/logging) config), so the output agents already read carries the client-side failures they're asked to fix.

The **framework's view** comes from the [Next.js MCP server](/docs/app/guides/mcp) at `/_next/mcp`: the running dev server's routes, server logs, and compilation issues. Its `get_compilation_issues` and `compile_route` tools report whether the code compiles straight from the dev server, so an agent doesn't have to run a full `next build` to find out.

The **browser's view** comes from [`agent-browser`](https://github.com/vercel-labs/agent-browser), a CLI that exposes the DOM, console, network, and Web Vitals as structured text. With React DevTools enabled (pass `--enable react-devtools` to `agent-browser open`, which the `next-dev-loop` skill does for you), it also reports the component tree and which Suspense boundaries are still pending. An agent runs a command like `react tree`, reads the output, and decides what to inspect next, instead of looking at a DevTools panel it can't see.

The [`next-dev-loop` skill](#skills-for-multi-step-workflows) builds on both views, combining the framework's and the browser's perspective into a single edit-and-verify loop.

> **Good to know:** For the story behind this tooling, see the [Next.js 16.2](https://nextjs.org/blog/next-16-2-ai) and [Next.js 16.3](https://nextjs.org/blog/next-16-3-ai-improvements) AI blog posts.

## Skills for multi-step workflows

Some tasks are workflows rather than lookups, such as adopting Cache Components or Partial Prefetching across an app. [Next.js skills](https://github.com/vercel/next.js/tree/canary/skills) package these as structured instructions an agent installs and follows, sequencing the work and pointing at the relevant docs at each step.

### `next-dev-loop`

The [`next-dev-loop`](https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop) skill verifies a change actually works at runtime against a running dev server, combining the [MCP server](/docs/app/guides/mcp)'s view with the browser's.

```bash filename="Terminal"
npx skills add vercel/next.js --skill next-dev-loop
```

Then give the agent this prompt:

```prompt
After every edit, verify the page still works at runtime using the next-dev-loop skill.
```

### `next-cache-components-adoption`

The [`next-cache-components-adoption`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-adoption) skill turns on [Cache Components](/docs/app/getting-started/caching) and walks the app to a passing build, resolving each blocking route the flag surfaces.

```bash filename="Terminal"
npx skills add vercel/next.js --skill next-cache-components-adoption
```

Then give the agent this prompt:

```prompt
Adopt Cache Components in this project using the next-cache-components-adoption skill.
```

### `next-cache-components-optimizer`

The [`next-cache-components-optimizer`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-optimizer) skill drives a route to instant navigation with a failing `@next/playwright` `instant()` test worked to green, then shipped as a regression guard.

```bash filename="Terminal"
npx skills add vercel/next.js --skill next-cache-components-optimizer
```

Then give the agent this prompt:

```prompt
Make the navigation from the dashboard to settings instant using the next-cache-components-optimizer skill.
```

### `next-partial-prefetching-adoption`

The [`next-partial-prefetching-adoption`](https://github.com/vercel/next.js/tree/canary/skills/next-partial-prefetching-adoption) skill turns on [Partial Prefetching](/docs/app/guides/adopting-partial-prefetching) and works through the insights it surfaces until every link reuses a shared App Shell.

```bash filename="Terminal"
npx skills add vercel/next.js --skill next-partial-prefetching-adoption
```

Then give the agent this prompt:

```prompt
Adopt Partial Prefetching in this project using the next-partial-prefetching-adoption skill.
```

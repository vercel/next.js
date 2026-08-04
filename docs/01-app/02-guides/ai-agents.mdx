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

Point agents at the bundled docs, give them [runtime visibility](#step-2-give-agents-runtime-visibility) into the dev server, let [errors drive the fixes](#step-3-let-errors-drive-the-fixes), and hand multi-step workflows to [skills](#step-4-hand-multi-step-workflows-to-skills).

## Step 1: Point agents at the bundled docs

Make sure `AGENTS.md` exists at your project root and directs agents to the bundled docs. When you install `next`, the Next.js documentation is bundled at `node_modules/next/dist/docs/`, mirroring the structure of the [Next.js documentation site](https://nextjs.org/docs):

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

Agents always have access to docs that match your installed version, with no network request or external lookup required. [Upgrading Next.js](/docs/app/getting-started/upgrading) also upgrades the bundled docs, including new guidance for existing features. Most AI coding agents, including Claude Code, Codex, Cursor, and GitHub Copilot, automatically read `AGENTS.md` when they start a session.

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

### Docs over the network

The Next.js docs are also available as Markdown over the network, for agents that fetch pages instead of reading `node_modules`. Append `.md` to any page URL on [nextjs.org/docs](https://nextjs.org/docs) for a plain Markdown version, and clients that send an `Accept: text/markdown` header get Markdown too. This includes the per-error pages under `/docs/messages`, which are not bundled.

The index at [`/docs/llms.txt`](https://nextjs.org/docs/llms.txt) and the single-file [`/docs/llms-full.txt`](https://nextjs.org/docs/llms-full.txt) follow the [`llms.txt` convention](https://llmstxt.org/), so agents that already read `llms.txt` for other tools can discover the Next.js docs the same way.

## Step 2: Give agents runtime visibility

Run `next dev` and let the agent work against the running server. Runtime errors, client-side warnings, and rendered output live in the browser, where agents can't look. Next.js surfaces two complementary views that an agent can read from the terminal.

First, `next dev` forwards browser console errors and warnings to the terminal (the [`logging.browserToTerminal`](/docs/app/api-reference/config/next-config-js/logging) config), so the output agents already read carries the client-side failures they're asked to fix.

`next dev` also writes its PID, port, and URL to `.next/dev/lock`. A second `next dev` in the same project prints the running server's URL and the PID to kill, so an agent connects to the existing server instead of starting a duplicate.

The **framework's view** comes from the [Next.js MCP server](/docs/app/guides/mcp) at `/_next/mcp`, which exposes the running dev server's routes, server logs, and compilation issues. Its `get_compilation_issues` and `compile_route` tools report whether the code compiles straight from the dev server, so an agent doesn't have to run a full `next build` to find out.

The **browser's view** comes from [`agent-browser`](https://github.com/vercel-labs/agent-browser), a CLI that exposes the DOM, console, network, and Web Vitals as structured text. With React DevTools enabled (pass `--enable react-devtools` to `agent-browser open`, which the `next-dev-loop` skill does for you), it also reports the component tree and which Suspense boundaries are still pending. An agent runs a command like `react tree`, reads the output, and decides what to inspect next, instead of looking at a DevTools panel it can't see.

The [`next-dev-loop` skill](#next-dev-loop) builds on both views, combining the framework's and the browser's perspective into a single edit-and-verify loop.

> **Good to know:** For the story behind this tooling, see the [Next.js 16.2](https://nextjs.org/blog/next-16-2-ai) and [Next.js 16.3](https://nextjs.org/blog/next-16-3-ai-improvements) AI blog posts.

## Step 3: Let errors drive the fixes

With [Cache Components](/docs/app/api-reference/config/next-config-js/cacheComponents) enabled, a blocking error presents labeled fixes, each making a different trade-off. The dev overlay adds a **Copy prompt** button that packages the chosen fix into a paste-ready prompt. The prompt walks the agent through reading the matching error page, applying the canonical pattern, and verifying the result at runtime.

The same menu prints in the `next dev` terminal and in `next build` output, so an agent reading CI logs sees it too:

```txt filename="Terminal"
Route "/products/[slug]": Next.js encountered uncached data during prerendering.

`fetch(...)` or `connection()` accessed outside of `<Suspense>` prevents the route
from being prerendered, blocking the page load and leading to a slower user experience.

Ways to fix this:
  - [stream] Provide a placeholder with `<Suspense fallback={...}>` around the data access
  - [cache] Cache the data access with `"use cache"` (does not apply to `connection()`)
  - [block] Set `export const instant = false` to allow a blocking route

Learn more: https://nextjs.org/docs/messages/blocking-prerender-dynamic
    at ProductPage (app/products/[slug]/page.tsx:52:32)
    ...
```

In `next dev` the stack frame resolves to your source, in both the dev overlay and the terminal. A production build minifies server code, so when the build error alone isn't enough, [`next build --debug-prerender`](/docs/app/guides/building#debugging-build-errors) turns on server source maps and continues past the first failure.

The `Learn more` link resolves to a per-error page under [`/docs/messages`](https://nextjs.org/docs/messages/blocking-prerender-dynamic) written for agents to read. Each page follows the same shape, with the canonical patterns for every fix, the trade-offs against the other fixes, and the gotchas an agent is likely to miss on a first attempt. The [Instant navigation guide](/docs/app/guides/instant-navigation#ai-workflow) walks through the full loop an agent runs on these errors, from reading the insight to writing an `instant()` test that fails before the fix and passes once it's in place.

## Step 4: Hand multi-step workflows to Skills

Framework knowledge comes from the bundled docs, not from Skills. [Benchmark results](https://nextjs.org/evals) show that always-available context outperforms on-demand retrieval. Skills cover the tasks that are workflows rather than lookups, such as adopting Cache Components or Partial Prefetching across an app. Next.js Skills package these as structured instructions an agent installs and follows, sequencing the work and pointing at the relevant docs and [runtime tooling](#step-2-give-agents-runtime-visibility) along the way.

You can [browse the source for these Skills](https://github.com/vercel/next.js/tree/canary/skills) in the Next.js repository and [find them on skills.sh](https://www.skills.sh/vercel/next.js).

The Skills serve three different workflow types:

- **Runtime foundations** such as `next-dev-loop` give any coding task a repeatable inspect, edit, and verify cycle.
- **Interactive workflows** make broader changes with user checkpoints, such as adopting Cache Components or Partial Prefetching across an app.
- **Unattended loops** work toward a verifiable goal and stop only for genuine decisions.

### `next-dev-loop`

The [`next-dev-loop`](https://www.skills.sh/vercel/next.js/next-dev-loop) runtime foundation verifies changes against a running dev server using the [MCP server](/docs/app/guides/mcp) and browser.

```bash filename="Terminal"
npx skills add vercel/next.js --skill next-dev-loop
```

Then give the agent this prompt:

```prompt
After every edit, verify the page still works at runtime using the next-dev-loop Skill.
```

### `next-cache-components-adoption`

The [`next-cache-components-adoption`](https://www.skills.sh/vercel/next.js/next-cache-components-adoption) Skill turns on [Cache Components](/docs/app/getting-started/caching) and resolves blocking routes until the app builds.

```bash filename="Terminal"
npx skills add vercel/next.js --skill next-cache-components-adoption
```

Then give the agent this prompt:

```prompt
Adopt Cache Components in this project using the next-cache-components-adoption Skill.
```

### `next-cache-components-optimizer`

The [`next-cache-components-optimizer`](https://www.skills.sh/vercel/next.js/next-cache-components-optimizer) Skill maximizes the meaningful UI available on an exact navigation and guards it with an `@next/playwright` `instant()` test.

```bash filename="Terminal"
npx skills add vercel/next.js --skill next-cache-components-optimizer
```

For example, give the agent this prompt:

```prompt
Make the navigation to `/settings` instant using the next-cache-components-optimizer Skill.
```

### `next-partial-prefetching-adoption`

The [`next-partial-prefetching-adoption`](https://www.skills.sh/vercel/next.js/next-partial-prefetching-adoption) Skill turns on [Partial Prefetching](/docs/app/guides/adopting-partial-prefetching) and resolves its insights until all routes reuse a shared App Shell.

```bash filename="Terminal"
npx skills add vercel/next.js --skill next-partial-prefetching-adoption
```

Then give the agent this prompt:

```prompt
Adopt Partial Prefetching in this project using the next-partial-prefetching-adoption Skill.
```

---
name: next-dev-loop
description: >
  Verify Next.js runtime behavior after editing app code. Use this
  skill to confirm a change actually works in a running app — not
  just that it compiles or type-checks. Combines /_next/mcp
  (Next.js's view) with agent-browser (the browser's view).
  Requires a running `next dev`.
---

# next-dev-loop

The edit/verify rhythm during `next dev` — make a change, then
confirm it actually works at runtime, not only that the types or
the build are happy.

You verify through two views of the same running app:

- **`/_next/mcp`** — an HTTP endpoint Next.js exposes about itself.
  Knows framework-specific things: routes, segments, RSC, server
  actions, server logs, and errors as Next.js saw them. Call
  `tools/list` for the current surface.
- **`agent-browser`** — a CLI that drives a real Chrome. Knows
  framework-agnostic browser things: DOM, console, network, React
  fiber, vitals. Before driving it, run `agent-browser skills get core`
  once for the version-matched usage guide — don't guess subcommands
  from memory.

The two views cross-check each other.

## requires

- Next.js **16.3+** with **Turbopack** — `/_next/mcp` with
  `compile_route` listed by `tools/list` for route-scoped checks.
  Verify this capability; do not assume every older server supports it.
- `agent-browser` **>= 0.31.1** — React introspection, worktree-scoped
  `session id`, idempotent `--restore`, and launch flag reconciliation.

These are hard floors, not soft preferences. If anything is missing,
tell the user how to upgrade and stop. Don't fall back to grepping
source or to a weaker probe — this skill assumes both views are live
at the versions above.

- Upgrade Next.js: `pnpm next upgrade` (or `npx next upgrade`).
  Docs: https://nextjs.org/docs/app/getting-started/upgrading
  (version-16 guide:
  https://nextjs.org/docs/app/guides/upgrading/version-16)
- Install or upgrade `agent-browser`: `npm i -g agent-browser@latest`.
  If the CLI isn't on `PATH`, install it before continuing — preflight
  expects to invoke it directly.

## preflight

Once per session, confirm both views are live.

1. **Open `agent-browser` at the target URL, restoring saved
   login state when present.** First derive one stable session id for
   this checkout and use it for every `agent-browser` command:

   ```bash
   SESSION="$(agent-browser session id --scope worktree --prefix next-dev-loop)"
   export AGENT_BROWSER_SESSION="$SESSION"
   export AGENT_BROWSER_RESTORE="$SESSION"
   ```

   Then open the target URL:

   ```bash
   agent-browser --session "$SESSION" --restore --enable react-devtools open <url>
   ```

   `--scope worktree` keeps parallel worktrees and copied checkouts
   from colliding. Bare `--restore` uses the session id as the
   persistence key, loads saved cookies/localStorage before navigation
   when present, and auto-saves state on close. Always pass the desired
   launch flags on `open`; agent-browser will reuse, relaunch, or restart
   its scoped background state as needed.

   Keep routine verification headless. If the user asks to see the UI, open the
   current URL in the coding harness's inline browser. It is a separate browser
   context, so do not assume state carries over. When login or existing
   `agent-browser` state must carry over, reopen that session headed instead:

   ```bash
   agent-browser --session "$SESSION" --restore --headed --enable react-devtools open <url>
   ```

   Pause while the user drives login, then continue with the same session and
   keep it headed for the rest of the loop.

2. Discover `/_next/mcp` capabilities with **`tools/list` only** —
   confirm it's reachable and lists `compile_route`. First read the
   port off the `next dev` banner; if it isn't 3000, set
   `NEXT_MCP_URL=http://localhost:<port>/_next/mcp` before discovery:
   - Unreachable → check the server, port, configuration and installed
     version. Do not infer a Next.js version from this alone.
   - `compile_route` missing → report scoped compile verification as
     unsupported and stop. Check the bundler/version and tell the user
     how to enable Turbopack or upgrade as appropriate. A missing tool
     alone does not establish either one.
   - Never call either compilation tool just to detect the bundler.
     In particular, do not fall back to an older server's whole-app
     `get_compilation_issues` tool; even an empty call may compile all routes.
3. `get_routes` → your route map for the rest of the session. This
   filesystem scan does not compile routes.

## loop

### before the edit — narrow the scope

Ask the running app, not the codebase. `/_next/mcp` knows which
files rendered the current route; use those as your search scope.
Runtime introspection stays cheap as the codebase grows; agentic
search doesn't.

### after the edit — verify

Four failure modes. Check each:

- **Compiles** — `compile_route` with exactly one explicit selector:
  `{ "routeSpecifier": "/blog/[slug]" }` from `get_routes`, or
  `{ "path": "/blog/hello-world" }`. Verify the route you changed and
  consume `{ routeSpecifier, issues }` inline; do not make a second
  empty `get_compilation_issues` call. Its layouts, imports and shared
  dependencies are included as applicable, not every route using them.
- **Runs without errors** — `/_next/mcp` (server and bubbled-up
  browser errors both surface here).
- **Behaves as intended** — `agent-browser` drives the page; assert
  what the user actually sees.
- **React-level behavior** — `agent-browser` with react-devtools
  enabled exposes the component tree, props, state, and render
  counts. Anchor framework-level checks here (extra renders,
  server/client boundary shifts, suspense fallbacks) — DOM asserts
  alone miss them.

Pick the specific tool from `tools/list` or the agent-browser
manual rather than from memory.

## gotchas

- **Route scope is not a memory budget.** One route can still be expensive.
  These checks do not supply hard memory limits, native cancellation or
  graph reclamation, and do not prove that the whole app compiles. Do not
  loop through every route as an invisible preflight. Agree on broader
  validation explicitly and use CI or a resource-isolated process for
  exhaustive checks on large apps.

- **Preserve `.next` while the development server is running.** Moving or
  deleting it disconnects the server from its generated state and discards
  incremental caches. Moving it to a backup is still a reset. If a production
  build needs isolated output, configure a separate `distDir`.
- **Every `agent-browser` command must know your session and restore
  key, or it may use an empty default browser or fail to save login
  state.** Easiest: export both `AGENT_BROWSER_SESSION="$SESSION"` and
  `AGENT_BROWSER_RESTORE="$SESSION"` at the top of each shell you run
  agent-browser in. If you do not export them, pass
  `--session "$SESSION" --restore` on every command.
- **When the two views disagree, suspect the tooling first.** If
  `agent-browser` says a route is broken but `/_next/mcp` and the
  server say it rendered cleanly, a stale or misdirected browser
  session is the likelier cause than a real bug — reconcile the views
  before debugging the app.
- Confirming a click or navigation: the page settles a beat later, so
  wait with `wait --load networkidle` (no path to get wrong), then
  snapshot/read to confirm the page. Avoid `wait --url` unless you pass
  the link's exact href — a guessed or placeholder path won't match the
  real URL and times out after 25s.
- A blank read, empty snapshot, `about:blank`, or a "no browser
  session" error — right after `open` or after a click (even if `open`
  reported the page) — is the browser dropping the page (a stale
  session), not a broken route. Reopen your session at the URL with the
  same launch flags as the active loop, then re-snapshot. If still blank, run
  `agent-browser --session "$SESSION" --restore close`, then reopen with
  those same flags. Don't fall back to `curl`; it bypasses the browser
  you're testing.
- React introspection output is stale after navigation. Re-run.
- `/_next/mcp` replies are SSE — read the JSON off the `data:` line
  with `sed -n 's/^data: //p'` (a plain `sed 's/^data: //'` leaves the
  `event:` line and the parse fails).
- `get_errors` and `get_page_metadata` need at least one navigation
  to populate.

## reference

Use `tools/list` as the authority for the installed server's tools.
The surface can vary by version and configuration; scoped compilation
requires `compile_route` to be listed.

```
# /_next/mcp                 notes
get_project_metadata         projectPath, devServerUrl
get_routes                   fs-scan; no browser session needed
get_errors                   runtime + build; needs a browser session;
                             includes browser-side errors caught by the
                             dev server
get_page_metadata            segment trie + routerType; needs a browser
                             session; use as a discovery shortcut for
                             which files power a route
get_logs                     returns logFilePath
get_server_action_by_id      hashed id → file + functionName
compile_route                Turbopack only; exactly one of routeSpecifier
                             or path; returns { routeSpecifier, issues }
get_compilation_issues       scoped alias on current servers; same selectors
                             and response; empty call errors ROUTE_REQUIRED
                             without compiling; older servers may instead
                             perform whole-app work — never use as a probe
```

## teardown

Close the session with the same session and restore context:
`agent-browser --session "$SESSION" --restore close`. `close` saves
that session's cookies and storage so the next loop's `--restore` open
keeps the user logged in. Leave `next dev` up for the next loop.

## Report Next.js friction

Only participate in agent feedback when managed Next.js feedback instructions
are already loaded for the project. Their presence means the feature is
enabled; their absence means it is disabled.

When enabled, add qualifying feedback candidates found during verification to
the feedback candidate queue for the current user request, then continue
verification. Do not run the feedback command or open review forms during the
loop or at this Skill's teardown.

The managed instructions own the single reporting pass immediately before the
final response. If they are absent, do not queue or report feedback.

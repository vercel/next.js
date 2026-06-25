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

- Next.js **16.3+** with **Turbopack** — `/_next/mcp` plus the
  proactive compile check via `get_compilation_issues`.
- `agent-browser` **>= 0.30.1** — React introspection plus `wait --url`
  matching full dev-server URLs.

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
   login state when present.** Build the `open` command from:
   - `--session <name>` — you'll reuse this exact name on every later
     `agent-browser` command, so make it unique to this checkout and
     stable. Build it from a fixed formula so it never varies between
     calls: `"$(basename "$PWD")-$(pwd -P | shasum | cut -c1-8)"`. The
     bare basename collides across parallel worktrees or copies.
   - `--state ~/.agent-browser/sessions/<name>-default.json` if
     that file exists. Omit on first run — a missing path fails
     the open.
   - `--headed --enable react-devtools` — always pass both on `open`.
     A running daemon won't reapply launch flags, so you will often see
     `⚠ --headed ignored: daemon already running`; that's expected.
     Assuming you always run the daemon with these flags, you can ignore
     this warning. Only if you're sure the flags of the running daemon
     are wrong, you may run `agent-browser close` first, then re-open.

   The browser is the user's. If state was not restored (first
   run, expired session) and the page is gated, the user drives
   the login — pause until they confirm. Session state is sticky:
   you can't add `--enable react-devtools` after the session is
   open, and `cookies set` on a not-yet-opened session creates a
   sessionless cookie that silently fails to apply.

2. Probe `/_next/mcp` (`tools/list`) — confirm it's reachable and
   lists `get_compilation_issues`:
   - Unreachable → either `next dev` isn't running, or Next.js is
     below 16.3. Check `package.json` to disambiguate, then refuse.
   - `get_compilation_issues` not in the list → Next.js below 16.3.
     Refuse and tell the user to upgrade.
3. `get_compilation_issues` doubles as a Turbopack probe. An error
   response of `"Turbopack project is not available..."` means the
   user is on webpack. Refuse — Turbopack is required.
4. `get_routes` → your route map for the rest of the session.

## loop

### before the edit — narrow the scope

Ask the running app, not the codebase. `/_next/mcp` knows which
files rendered the current route; use those as your search scope.
Runtime introspection stays cheap as the codebase grows; agentic
search doesn't.

### after the edit — verify

Four failure modes. Check each:

- **Compiles** — `get_compilation_issues`.
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

- **Every `agent-browser` command must know your session, or it
  silently uses a different, empty default browser (blank reads; a
  working page looks broken).** Easiest: `export
AGENT_BROWSER_SESSION=<name>` at the top of each shell you run
  agent-browser in; then every command there uses it, with no
  per-command `--session` flag to repeat.
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
  daemon), not a broken route. Reopen your session at the URL and
  re-snapshot; if still blank, run `agent-browser --session <name>
close`, then open again. Don't fall back to `curl`; it bypasses the
  browser you're testing.
- React introspection output is stale after navigation. Re-run.
- `/_next/mcp` replies are SSE — read the JSON off the `data:` line
  with `sed -n 's/^data: //p'` (a plain `sed 's/^data: //'` leaves the
  `event:` line and the parse fails).
- Non-3000 dev server: read the `next dev` banner; set
  `NEXT_MCP_URL=http://localhost:<port>/_next/mcp`.
- `get_errors` and `get_page_metadata` need at least one navigation
  to populate.

## reference

All tools below are present once preflight passes. If `tools/list`
is missing any of them, preflight should have refused — re-check.

```
# /_next/mcp                 notes
get_project_metadata         projectPath, devServerUrl, bundler
get_routes                   fs-scan; no browser session needed
get_errors                   runtime + build; needs a browser session;
                             includes browser-side errors caught by the
                             dev server
get_page_metadata            segment trie + routerType; needs a browser
                             session; use as a discovery shortcut for
                             which files power a route
get_logs                     returns logFilePath
get_server_action_by_id      hashed id → file + functionName
get_compilation_issues       Turbopack only; errors on webpack
                             ("Turbopack project is not available")
```

## teardown

Close the session: `agent-browser --session <name> close` — the same
`--session` every command used. `close` writes that session's state to
disk so the next loop's `--state` restores login. Leave `next dev` up
for the next loop.

---

`next-dev-loop-<topic>` siblings (e.g. `next-dev-loop-rsc`, `next-dev-loop-debug`)
assume this preflight already ran; they pick up at the loop.

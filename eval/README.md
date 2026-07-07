# curl → agent-hint: prototype + eval

Prototype of a Next.js **dev-server feature**: when a page request comes from a
command-line HTTP client (curl/wget/…), return an **agent-facing hint** instead
of the browser-only HTML the client cannot actually observe, telling the agent
to use a browser-capable tool (e.g. `next-browser` / the `next-dev-loop` skill).

Motivation: agents reflexively `curl` a dev server to "see" a page. For
app-router pages whose content is client-rendered (hydration, effects, client
navigation), curl only ever returns the pre-hydration skeleton (`Loading…`), so
the agent draws wrong conclusions. The hint redirects it to a tool that drives a
real browser.

## The feature (framework patch)

- `packages/next/src/server/lib/curl-agent-hint.ts` — detection + hint document.
- `packages/next/src/server/lib/router-server.ts` — one call site in the dev
  request handler, right after internal-header filtering:

  ```ts
  if (maybeSendCurlAgentHint(req, res, opts)) {
    return
  }
  ```

Only fires for: dev mode, `NEXT_CURL_AGENT_HINT=1`, a CLI User-Agent, and a
top-level HTML page GET (not `/_next`, `/api`, RSC, or static assets). Browsers,
assets, and API/RSC requests are untouched. Verified:

| Request | Response |
| --- | --- |
| curl UA → `/dashboard` | agent hint (`x-nextjs-agent-hint: 1`) |
| browser UA → `/dashboard` | normal HTML |
| curl UA → `/_next/**` asset | normal asset |

> For the eval the identical logic is applied to the **installed dist**
> (`eval/app/node_modules/next/dist/server/lib/router-server.js`) so it runs
> without a full monorepo rebuild. It is gated by `NEXT_CURL_AGENT_HINT`, so the
> same binary serves control (env off) and treatment (env on) — a clean A/B.

## The fixture (`eval/app`)

`/dashboard` shows a revenue KPI that is **only observable in a real browser**:

- The figure lives server-side in `app/api/kpi/route.js`; it is **not** in the
  HTML or the client JS bundle.
- `revenue-client.js` fetches `/api/kpi` on hydration and renders it.
- `/api/kpi` returns the number to browsers but `null` to CLI user-agents.
- `turbopack.root` is pinned so the worktree path is stripped from the RSC
  payload (otherwise curl output leaks the source location).

Net: `curl` (any UA) cannot get the figure; only a rendered browser can. The
escape hatches that remain (broad `find` for the source, or curling `/api/kpi`
with a spoofed browser UA) are deliberate, effortful, and detected/categorized
by the scorer.

`eval/tools/next-browser` is a **real** headless-Chromium wrapper (dump-dom with
a virtual-time budget so effects/fetch resolve). It is the tool the hint/skill
recommend; it genuinely observes `$42,317` where curl sees `Loading…`.

## The harness (`eval/harness`)

`runmatrix.mjs` runs N isolated headless Claude Code sessions per arm against an
already-running dev server, and scores each transcript.

- Each session runs in a neutral sandbox **outside** the worktree (so the agent
  can't reach the app source by walking up from cwd) with a fresh
  `CLAUDE_CONFIG_DIR` (no global `CLAUDE.md` / global skills leak in) and only
  the arm's own setup. Tools: `Bash` (+`Skill` for skill arms).
- `next-browser` is on `PATH` in **every** arm (tool availability is constant);
  arms differ only in whether the agent is *told* about it.
- Scored from `--output-format stream-json`: `method` (browser / api-spoof /
  source / other / failed), `adapted` (used the browser tool), `solved`
  (reported the figure), `promptInjectionReject`, curl count.

### Arms

| arm | server hint | skill in sandbox |
| --- | --- | --- |
| control | off | no |
| server-hint | on | no |
| skill-only | off | yes |
| both | on | yes |

### Run

```bash
# start servers (one project dir per server; env gates the hint)
NEXT_CURL_AGENT_HINT=1 next dev -p 3111   # treatment
NEXT_CURL_AGENT_HINT=0 next dev -p 3121   # control

# per arm:
node harness/runmatrix.mjs --arm server-hint --port 3111 --skill 0 --n 8 --outdir results/exp1
node harness/report.mjs results/exp1
```

Model: `claude-sonnet-5`. Results and the write-up live in `RESULTS.md`.

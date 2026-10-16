---
name: next-bundle-optimizer
description: >
  Audit and reduce Next.js browser initial-load work. Use for slow route startup,
  oversized client bundles, duplicate browser dependencies, or features that can
  wait for interaction.
---

# Bundle optimizer

## 1. Set the scope

Analyze the whole app by default, covering all routes and shared client dependencies. Narrow the scope only when the user specifies a route, dependency, feature or other subset. Choose **audit** or **fix** mode. Audit is the default: generate analyzer artifacts and report candidates while leaving application source, dependencies and lockfiles unchanged. Fix mode requires an explicit request to change the app. Ask before changing visible behavior, timing, compatibility or a trust boundary. For a route's static App Shell, use [`next-cache-components-optimizer`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-optimizer); install it first if unavailable (`npx skills add https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-optimizer`). For navigation prefetch work, use [`next-partial-prefetching-optimizer`](https://github.com/vercel/next.js/tree/canary/skills/next-partial-prefetching-optimizer); install it first if unavailable (`npx skills add https://github.com/vercel/next.js/tree/canary/skills/next-partial-prefetching-optimizer`).

**Done:** the whole-app or user-specified scope, mode and intended behavior are recorded. A request to capture or export data is audit mode, not permission to fix.

## 2. Capture and export a baseline

Run from the app directory with its package manager. Read `next analyze --help` for capture options and `next analyze export --help` for replay options in the installed CLI. Reuse a selected saved snapshot, or capture with a distinctive name first; then export it through gzip at its default compression level. Keep before/after `.jsonl.gz` files separate.

**Sandbox requirement:** If the agent’s sandbox blocks TCP port binding (as Codex’s does), it MUST run the `next analyze --output` capture outside the sandbox. Do not attempt the capture inside that sandbox, even though `--output` does not serve the analyzer UI.

Run the pipeline in Bash:

```bash
set -o pipefail
# Capture only when a new baseline is needed
pnpm exec next analyze --output --snapshot 'audit-before-unique-1'
pnpm exec next analyze export --snapshot 'audit-before-unique-1' | gzip > /tmp/analyze-app-before.jsonl.gz
```

`--output` builds and saves binary/UI artifacts without serving. `next analyze export` reads a saved snapshot without building; stdout is one typed JSON record per line, with errors on stderr. Omit `--route` for whole-app analysis; add it for a user-specified route. The route filter keeps the whole-app module graph, so scope it in the next step.

For a custom `distDir`, replay with `--dist-dir <configured-directory>` (relative or absolute): capture loads the app config, replay does not. `--snapshot <name>` selects a retained name; omission selects the newest snapshot. Capture generates a unique timestamp name when omitted, and **replaces** an existing capture when an explicit name is reused. Use distinct before/after names, including names with spaces, to preserve both baselines. For interactive exploration, capture without `--output` to serve the UI; `next build --analyze` also produces replayable data.

**Done:** the chosen capture is identified, export succeeded, and the baseline file, snapshot name and analysis scope are recorded. Check the whole pipeline's exit status before processing the compressed file: `pipefail` prevents gzip from hiding a failed export. Export validates one route at a time, so a failure can leave a partial archive even if `gzip -t` accepts it. Discard output when export or gzip fails.

## 3. Interpret the evidence

Resolve the schema from the app's **installed Next.js**, using its Node launcher:

```bash
pnpm exec node -p "require.resolve('next/analyze/graph-v1.schema.json')"
```

Read its descriptions for record meanings, joins, attribution and coverage. Stream decompression with `gzip -dc /tmp/analyze-app-before.jsonl.gz` into a line-oriented analysis script rather than loading the whole dump into context. Use the schema to interpret client/server contributions across every route in scope and choose the metric.

**Done:** the baseline's route-attributed client/server contributions and the metric are identified. Treat this as **build evidence**: claims about observed browser requests, timing or transfer savings need separate evidence.

## 4. Explain a candidate

Inspect actual project source and exact importers. Rank client-output contributions across the whole app, or within the user-specified scope, by attributed size, repetition, likely runtime cost, need before interaction and correctness risk.

### Community → min-cut pass

For broad audits seeking opportunities across multiple features or a large contributor list, run **community detection → target selection → directed min-cut → source validation** after the initial ranking. Read [Graph methods](references/graph-methods.md) before constructing the graph or running solvers.

1. Rank detected communities by scoped client-output attribution and inspect their inbound importers.
2. Select large communities, or optional feature regions within them, that can plausibly wait for interaction. Record why each selected region is optional under the route's render conditions.
3. Run directed min-cuts from the verified client roots to those targets to find small sets of importer changes that could detach them.
4. Validate the cut edges against source and behavior constraints; account for each investigated target as a candidate, rejected cut or evidence gap.

For a narrow audit of a named dependency or feature, use direct importer reasoning when it fully accounts for the relevant paths and proposed boundary; record why the paired pass adds no useful target discovery. If graph evidence or tooling blocks the pass, record the blocker and limit the conclusions accordingly.

### Graph-evidence checklist

Before proposing an edit, record these items for each candidate. Mark an inapplicable item with its reason; give missing evidence an explicit gap.

- **Scope:** name the affected routes, snapshot, render conditions, client/server output class, exact target identities and metric. For reachability claims, identify every selected client root, including applicable client references.
- **Coverage:** summarize relevant unsupported outputs and absent group triggers, and their effect on the claim. Scope conclusions to the known subgraph when completeness is uncertain.
- **Attribution:** count each selected output contribution once. Record repeated-record handling and distinguish source paths from module identities; explain any mapping used for solver weights and preserve unknown weights as gaps.
- **Reachability:** for a lazy boundary, check **all** synchronous root-to-target paths, alternate importers and cycles, including a target that is itself a root. Record which paths the proposed boundary severs and which stay reachable. Verify async and erased type-only imports against source.
- **Source checks:** inspect import triggers, mount-time preloading, module side effects and shared routes. Record the conditions under which an async import executes. The graph establishes indexed reachability; an after snapshot verifies emitted outputs and attribution changes.
- **Method:** record the chosen method, its parameters and why it fits the candidate.

For lazy interaction features, duplicate packages, server-rendered display work or other attributed assets, read the matching section in [Fix patterns](references/fix-patterns.md) before proposing an edit.

### Unexpected client dependencies

The size ranking misses small modules that cross an unintended runtime boundary. In both modes, check client-reachable modules for dependencies intended for the server, using a small script that streams the export.

**Find what reaches the browser.** Reuse the graph-evidence checklist above. Keep these records while streaming:

- **Modules:** exact `ident`, `path` and both `dependencies.sync` and `dependencies.async`. Browser layers (`[app-client]`, or `[client]` for Pages) distinguish client variants from `[app-ssr]` and `[app-rsc]`; emitted output membership establishes which variants ship.
- **Roots:** for each `route` record, every entry with `entry_kind: client_bootstrap`, plus each entry's `client_references[].module_ident`.
- **Outputs:** each route's `[client-fs]` output records, with `modules`, `async_loaders` and `coverage`. Join real members by exact `ident`; an async loader target is a loading edge, not a member of the importer's chunk.
- **Bytes:** `part` records whose `filename` starts with `[client-fs]`, keyed by `source_path`. Count each `filename` once per source path, because the same chunk shows up under several routes.

Run a BFS per route over both synchronous and asynchronous dependencies, keeping parent pointers and edge kinds. Use `(ident, crossedAsync)` as the visited key to preserve the shortest synchronous chain separately from paths that cross an async edge. Prefer a synchronous chain when one exists; otherwise report the shortest async chain with its loading edge and source trigger marked. For modules shared by routes, choose the shortest chain of the preferred kind.

Collect affected routes by joining reachable modules to each route's emitted client outputs, keeping conditional loads distinct from synchronous reachability. Missing roots or unsupported membership mean a partial scan: record the evidence gap rather than declaring the route clean.

The graph comes from the emitted build, so re-exports can be optimized away and a barrel like `lib/agents/index.ts` may be missing from the chain. Report the chain the graph shows, and mention the source import path too if it's different.

**Check each module.** Use project source to identify matches, then confirm that the matching value, operation or dependency survives in emitted client code. Module membership alone does not prove its original contents ship: Server Action implementations become client reference stubs, and unused exports can be erased. Record these as suppressed source matches with the emitted evidence. If that evidence is unavailable, record an unverified source match and the gap separately from leak findings. For dependencies in `node_modules`, use package identities and project importer configuration rather than scanning package source. Record every heuristic that survives validation:

- **Database schema:** Drizzle `pgTable`/`mysqlTable`/`sqliteTable`, Mongoose `new Schema(...)`/`model(...)`, TypeORM `@Entity`, Sequelize `define`, generated Prisma client modules, migrations and raw SQL. A client component that imports a schema only to read enum values or column names can still ship schema construction. Type-only imports like `typeof users.$inferSelect` are erased and don't count.
- **Database client:** driver and ORM packages (`pg`, `postgres`, `mysql2`, `mongodb`, `mongoose`, `ioredis`, `redis`, `@prisma/client`, `@neondatabase/serverless`, `@planetscale/database`, `@libsql/client`), and project modules that create one (`new PrismaClient()`, `new Pool(...)`, `drizzle(...)`, `createClient(...)` with a connection string).
- **Server-side authentication:** signing or verifying tokens with a secret (`jsonwebtoken`, `jose` `SignJWT`/`jwtVerify`), password hashing (`bcrypt`, `bcryptjs`, `argon2`, `scrypt`), session stores, OAuth client secrets, and server auth config or entry points (`NextAuth(...)` config, `getServerSession`, `@clerk/nextjs/server`, a `better-auth` server instance, `cookies()`/`headers()` from `next/headers`).
- **Server-side authorization:** role→permission tables, policy or ACL definitions, admin or staff allowlists, feature entitlements, and gates like `requireAdmin`, `assertCan` or `authorize`. It's more likely to be real when the same module also uses a database client or verifies a session.
- **Node-only SDKs:** `@aws-sdk/*`, `@google-cloud/*`, `firebase-admin`, `@azure/storage-blob` with account keys, the Node `stripe` SDK, `twilio`, `@sendgrid/mail`, `resend`, `openai` and `@anthropic-ai/sdk`. Attribute each one to the nearest project importer.

These signals warrant checking ownership and intended use; none establishes a leak by itself:

- **Model instructions:** establish intended runtime from source, callers or project documentation. Report exposure only when that context identifies server-owned material reaching client code. String length, role messages, tool definitions and wording alone do not establish a boundary.
- **Server-looking path:** a segment named `server`, `db`, `database`, `prisma`, `drizzle`, `auth`, `agent(s)`, `prompt(s)` or `llm`, or a `*.server.*` file, especially next to modules that import `server-only`.
- **Node built-in polyfills:** browser polyfills or stubs for `fs`, `crypto`, `net`, `child_process`, `buffer` or `stream`. They usually mean the importer was written for the server, but plenty of browser libraries pull in `buffer`, `stream` or `events` shims too.

Names like `prompt`, `instructions`, `description`, `system`, `auth`, `role` or `permissions` make a module worth a closer look, but never count as a match. UI code uses them all the time.

**Drop known false positives.** Write down each match you suppress and why, so the owner can check your reasoning:

- **Framework runtime:** the whole chain is inside `node_modules/next/`. The client bootstrap includes Next's own `process` polyfill.
- **Unreached server modules:** a `server-only` module imported only from Server Components has no browser-layer ident, so a path match alone never makes it a finding.
- **Browser auth SDKs:** `next-auth/react` (`useSession`, `signIn`, `signOut`), `@clerk/nextjs` client components, Firebase client `auth`, Supabase browser clients created with the anon key, and `jose` used only to decode or to verify with a public key.
- **UI-only authorization:** hiding or disabling controls based on a role the server already sent. It only counts if the client holds the permission table or allowlist itself.
- **Isomorphic shims:** `buffer`, `events`, `stream` or `util` polyfills pulled in by a package documented for the browser, when nothing else on the chain matches.
- **Browser-capable SDKs:** `@stripe/stripe-js`, `@aws-sdk/*` clients configured with Cognito or presigned URLs, `@vercel/blob/client` uploads and other packages documented for the browser.
- **UI copy:** help text, onboarding steps, product descriptions, form instructions and error messages meant for the user, even under keys named `description`, `instructions` or `prompt`.
- **Public model instructions:** prompts intentionally authored, edited or executed in the browser, including browser inference and instructions sent by the client. Treat them as ordinary client content, eligible for the same size and behavior checks as other code.

Report each validated match as a **leak finding** with its emitted module, affected routes and loading conditions, the preferred import chain from a client root, the heuristics that matched and its attributed compressed bytes. If you can't get one of those, say why. Keep boundary concerns in their own report section, separate from size candidates. A size metric alone cannot justify a boundary repair; follow the scope's consent rule before changing ownership or runtime.

**Done:** the paired pass is recorded along with what happened to each target, or the reason it was skipped or blocked is written down. Every candidate has a completed checklist, exact source/importer, proposed edit and named behavior checks. Every client-reachable module in the known subgraph has been scanned, including async descendants; record coverage gaps. Each source match has an emitted-code check and is reported as a heuristic finding, suppressed with a reason or left unverified with an evidence gap. The report step completes **audit** mode.

## 5. Verify one change — fix mode only

Make one small, cohesive change. Capture/export an after snapshot with a new name and compare the **same analysis scope, output class and metric** with the baseline. For whole-app analysis, account for changes across all routes, including shared dependencies. Run relevant behavior tests and type-check; use [`next-dev-loop`](https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop) when verifying the edit in the running app, and install it first if unavailable (`npx skills add https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop`).

Keep ordinary bundle optimizations available in prompt modules and their importers when intended use is preserved and behavior is verified. Use the scope's consent rule for boundary repairs, including moving server-owned policy or adding `import 'server-only'`. Record boundary concerns separately from size improvements.

**Done:** retain the change only when the scoped metric improves and the intended behavior passes its checks. Revert a change that fails either condition. If checks are blocked, report the unverified edit and blocker rather than accepting it. Record the accepted after snapshot as the next baseline before another edit.

## 6. Report and stop

Audit reports candidates; fix reports accepted edits and any reverted or unverified attempts. Include snapshot names, scoped attribution/deltas, exact source/importer, behavior-check results and blockers. For a graph cut, include its route/render conditions, roots/target and unknowns. Distinguish source facts, build evidence, heuristics and separately observed runtime facts.

Add a separate **Possible server-only leaks** section that marks every finding as heuristic and gives each one the same five labeled lines: **Module**, **Routes**, **Chain**, **Heuristics** and **Compressed bytes**. Include ownership evidence for prompt findings on the Heuristics line. Where you couldn't get a value, write the reason on that line instead. In fix mode, distinguish unresolved boundary concerns from accepted size edits, even when they involve the same file. If the pass found nothing, say that.

**Done:** every scoped candidate, leak finding or attempted edit is accounted for, with evidence or a stated gap.

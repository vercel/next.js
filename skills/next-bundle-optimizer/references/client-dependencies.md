# Client dependencies

Use this reference for the unexpected-client-dependencies pass. Reuse the main workflow's graph-evidence checklist and read the installed schema for field meanings.

## Discover emitted modules

While streaming the export, retain:

- **Modules:** exact `ident`, source `path` and `dependencies.sync`/`dependencies.async`. Browser layers (`[app-client]`, or `[client]` for Pages) distinguish client variants from `[app-ssr]` and `[app-rsc]`; output membership establishes which variants ship.
- **Outputs:** each route's client and server output records, with `modules`, `async_loaders` and `coverage`. Join members by exact `ident`; an async loader target is a loading edge, not a member of the importer's chunk.
- **Roots:** route entries with `entry_kind: client_bootstrap`, plus each entry's `client_references[].module_ident`.
- **Bytes:** `[client-fs]` `part` records keyed by `source_path`. Count each `filename` once per source path across routes.

Group emitted members by source `path` to find sources shared by server and client, retaining each variant's exact identity. Inspect shared sources first, then remaining client members. Output membership identifies affected routes; unsupported membership is a coverage gap.

## Validate candidates

These examples are non-exhaustive and can produce false positives. Validate each against surrounding source, callers and intended behavior; inspect equivalent dependencies and custom code using the same ownership and emitted-code tests:

- **Database schemas and clients:** Drizzle table constructors, Mongoose schemas/models, TypeORM entities, Sequelize definitions, generated Prisma clients, migrations, SQL, drivers such as `pg`/`mysql2`/`mongodb`, and connection factories such as `new Pool(...)` or `drizzle(...)`. Distinguish server-owned schema construction and connections from intentionally public enums, validation data or browser-configured database clients.
- **Authentication:** secret-based token signing/verification, password hashing, session stores, OAuth client secrets and server auth entry points such as `getServerSession` or `@clerk/nextjs/server`. Browser session components, Supabase anon-key clients and public-key verification with `jose` are legitimate client uses.
- **Authorization:** permission tables, ACLs, allowlists, entitlements and gates such as `requireAdmin` or `assertCan`. Public permission mappings used to render controls can intentionally ship to the browser while access is enforced on the server; their presence alone is insufficient.
- **SDKs:** AWS/Google Cloud clients, `firebase-admin`, Stripe's Node SDK, mail providers and model SDKs. Inspect the nearest project importer and its configuration: browser-supported clients, Cognito credentials, presigned URLs and public upload flows can be intentional.
- **Model instructions:** public, editable prompts and browser inference are ordinary client content, eligible for size optimization. Wording, string length, roles and tool definitions alone do not establish server ownership.
- **Names and shims:** paths containing `server`, `db`, `auth`, `agents` or `prompts`, `*.server.*` files, and Node built-in polyfills warrant inspection. UI copy and browser libraries using `buffer`, `stream`, `events` or `util` are common legitimate uses. Next.js's own client bootstrap includes a `process` polyfill.

Use project source for inspection; for `node_modules`, use package identities and project importer configuration. Confirm matching contents survive in emitted client code: Server Action implementations become reference stubs, and unused exports can be erased. Type-only imports are erased before the emitted graph; exclude them when inspecting source. A server module absent from client output is not a finding.

## Trace findings

For affected routes, run BFS from client roots over synchronous and asynchronous dependencies, retaining parent pointers and edge kinds. Use `(ident, crossedAsync)` as the visited key to preserve synchronous paths separately. Prefer the shortest synchronous chain; otherwise use the shortest async chain and mark its loading edge and source trigger. Across routes, choose the shortest chain of the preferred kind. Record missing roots as evidence gaps.

Keep conditional loading distinct from synchronous reachability. Optimized-away barrels may be absent from the emitted chain; report the chain the graph shows and the source import path when different.

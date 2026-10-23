# Client dependencies

Use the main workflow's graph-evidence checklist and installed schema.

## Discover emitted modules

While streaming the export, retain:

- **Modules:** exact `ident`, source `path` and `dependencies.sync`/`dependencies.async`. Browser layers (`[app-client]`, or `[client]` for Pages) distinguish client variants from `[app-ssr]` and `[app-rsc]`; output membership establishes which variants ship.
- **Outputs:** each route's client and server output records, with `modules`, `async_loaders` and `coverage`. Join members by exact `ident`; an async loader target is a loading edge, not a member of the importer's chunk.
- **Roots:** route entries with `entry_kind: client_bootstrap`, plus each entry's `client_references[].module_ident`.
- **Bytes:** `[client-fs]` `part` records keyed by `source_path`. Count each `filename` once per source path across routes.

Group emitted members by source `path`, retaining each variant's identity. Inspect sources shared by server and client first, then remaining client members. Output membership identifies affected routes; unsupported membership is a coverage gap.

## Validate candidates

For every match, establish server ownership from source, callers or project documentation and confirm the relevant contents survive in emitted client code. Apply this to custom code and dependencies alike. Examples and common false positives:

- **Databases:** ORM schemas/models, migrations, SQL, drivers (`pg`, `mysql2`, `mongodb`) and connection factories. Public enums, validation data and browser-configured clients can be intentional.
- **Authentication:** secret-based signing/verification, password hashing, session stores, OAuth secrets and server auth APIs. Browser session UI, anon-key clients and public-key verification can be intentional.
- **Authorization:** permission tables, ACLs, entitlements and gates. Public mappings may render controls while the server enforces access.
- **SDKs:** cloud, admin, payment, mail and model SDKs. Inspect project importers and configuration; browser clients, presigned URLs and public upload flows can be intentional.
- **Model instructions:** public, editable prompts and browser inference are ordinary client content eligible for size optimization. Wording, length, roles and tool definitions alone do not establish ownership.
- **Names and shims:** `server`, `db`, `auth`, `agents`, `prompts`, `*.server.*` and Node polyfills warrant inspection. UI copy and browser libraries using `buffer`, `stream`, `events`, `util` or `process` can be legitimate.

Inspect project source; for `node_modules`, use package identities and project importer configuration. Exclude type-only imports and exports erased from client output. Server modules absent from client output are not findings.

For each inspected Server Action client reference, map its emitted identity (possibly generated or `data:`) to the source action and client importer. Record routes and attributed compressed bytes, and check whether private implementation contents survive. Report verified reference-only stubs as suppressed matches; incomplete mappings or checks as unverified matches with specific gaps. Stub bytes alone do not establish a leak.

## Trace findings

For affected routes, run BFS from client roots over synchronous and asynchronous dependencies, retaining parent pointers and edge kinds. Use `(ident, crossedAsync)` as the visited key to preserve synchronous paths separately. Prefer the shortest synchronous chain; otherwise use the shortest async chain and mark its loading edge and source trigger. Across routes, choose the shortest chain of the preferred kind. Record missing roots as evidence gaps.

Keep conditional loading distinct from synchronous reachability. Optimized-away barrels may be absent from the emitted chain; report the chain the graph shows and the source import path when different.

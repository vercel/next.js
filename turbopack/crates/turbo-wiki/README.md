# turbo-wiki

A little wiki compiler built on `turbo-tasks`, the incremental computation
engine inside Turbopack. It's the system that lets Turbopack recompile only
what changed — and it isn't specific to bundling, so here it's compiling a
wiki instead.

turbo-wiki takes a flat directory of Markdown files with `[[WikiLinks]]` and
produces HTML pages with resolved links and a backlinks section. Broken links
show up as warnings. Edit a page and only the affected pages recompile
(`--watch`), including across restarts (`--persist`).

This is a personal experiment, not something the Turbopack team maintains or
endorses. `turbo-tasks` is an internal part of Turbopack — its APIs aren't
stable and may change at any time.

## Usage

From this folder:

```bash
# one-shot compile
cargo run --release -- example /tmp/wiki-out

# recompile on file changes
cargo run --release -- example /tmp/wiki-out --watch

# persistent cache (stored in <out>/.turbo-wiki-cache)
cargo run --release -- example /tmp/wiki-out --persist

# dev server with live updates at http://127.0.0.1:3080/
cargo run --release -- example --serve
```

## How it works

Every step is a `#[turbo_tasks::function]`, so the whole compilation is a
memoized task graph:

```
read_dir ──> page_paths ────────────┬───────────────┐
file read ─> parse_page ─┬─> title_index ──(keyed get)──> render_body ────────┐
                         └─> page_links ──> backlinks ────> render_backlinks ─┼─> render_page ─> compile_wiki ─> compile_report
                                                                              │
                                            (BrokenLink diagnostics as collectibles)
```

Two things stop invalidation early. `page_links` is a separate task so prose
edits (which don't change the extracted links) never touch backlinks. And
links are resolved with a keyed read (`title_index.get(&key)` on a
`cell = "keyed"` value), so a render depends only on the index keys it looked
up — adding or renaming a page invalidates only the pages whose lookups
changed, not everyone who consulted the index. Broken-link warnings are
collectibles attached to the body render tasks, so they disappear on their
own when the task re-runs.

The body and the backlinks section of each page are rendered by separate
tasks, so they recompute independently; `render_page` just concatenates the
two cached fragments. Both tasks log their executions to stderr, so in watch
mode you can see exactly what recomputes:

- Edit prose on a page: one `[render body]` for that page, no backlinks work
  anywhere.
- Add `[[Home]]` to a page: that page's body re-renders, and `index.md` gets a
  `[render backlinks]` — but not a `[render body]`. Its article HTML came from
  cache; only the backlinks fragment was rebuilt.
- Rename a page's title: bodies of pages linking to it re-render (their links
  now dangle), the rest stay cached.

The driver spawns a root task that does a single strongly consistent read of
`compile_report`, sends each settled result over a channel, and reconciles the
output directory from the main thread.

`--serve` is the same standing query with a different consumer: pages are kept
in memory and served over HTTP, changed page names are streamed to open tabs
over server-sent events, and a small injected script refetches the current
page and patches the document in place — edits (including fixing a broken
link by creating the missing page) show up in the browser without a reload.

Everything is in [`src/main.rs`](./src/main.rs), top to bottom: value types,
diagnostics, tasks, plain markdown/HTML helpers, then the driver. Only
top-level `*.md` files are compiled, and the output directory must be outside
the (watched) input directory.

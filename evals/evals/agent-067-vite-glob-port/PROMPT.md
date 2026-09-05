We're porting our release-notes browser from Vite to this Next.js app, and it's half done. The page renders, but the list of documents is empty — it should list every markdown file in `content/` and load a document's body when you click it.

Requirements — our old Vite build met all of these, and the port must too:

1. Dropping a new `.md` file into `content/` must show up in the list after a rebuild with zero code changes. No hard-coded file lists or per-file import lists anywhere.
2. Document bodies must not ship in the page's JavaScript. We audit this by grepping the built JS for changelog text, and the audit has to stay clean — a body should only come over the network at the moment someone opens that document. The initial HTML must not contain document bodies either. (The content set in production is huge; shipping it up front is what we're paying to avoid.)
3. The browser stays an interactive client-side component — the list and the reading pane as they are now.
4. No server endpoints for this feature (no API or route handlers). This piece also gets deployed as a static bundle elsewhere, so it has to work served as plain static files.
5. Keep the markdown files where they are, in `content/` at the project root, and keep building with plain `next build` — don't change the build command.

The previous dev on this port stubbed out the document index (see `docs-index.ts`) with a note claiming the way we did this in Vite simply doesn't exist in Next.js. Please verify that claim yourself instead of taking it at face value — then make the browser work.

Done means: `npm run build` passes, and under `next start` the page lists all the documents and clicking one shows its body, within the constraints above.

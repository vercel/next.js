# React internals need human review

rule: A change that couples Next.js to React's internal implementation details always gets a human reviewer, and above all a change that depends on the Flight serialization protocol. React doesn't treat its internals as API. They can change in any React sync with no notice, and Next.js then breaks on every App Router page, usually in only one environment.

The test is whether React would treat changing the behavior as a breaking change, not whether it's written down. Long-standing behavior that ordinary apps rely on is part of React's contract, documented or not. Internals are what React changes in a minor release or a sync without telling anyone: protocol encodings, private fields, internal states, and scheduler mechanics. When it's unclear which side something falls on, it's a judgment call to raise as a comment, not a trigger.

severity: escalate (strong). It can't be justified: no explanation in the description turns it into a medium. It applies even when the author owns every matching area, because it's a trigger, not an area signal. The agent never approves a PR that matches it. A human must.

In scope: any new coupling, or a change to existing coupling. Moving, renaming, or deleting existing coupling counts too, since the reviewer has to confirm the new code still matches what React does.

Not in scope:

- APIs React exports for frameworks and bundlers, used as documented: `react-server-dom-*` entry points (`renderToReadableStream`, `prerender`, `createFromReadableStream`, `createFromFetch`, `encodeReply`, `decodeReply`, `registerServerReference`, `registerClientReference`), the client and server reference manifests, and `react-dom/server` and `react-dom/static`.
- The thenable convention that `use` documents: reading `status`, `value`, and `reason`.
- Handling a Flight stream as opaque bytes: teeing, buffering, caching, or inlining it into `__next_f` without reading what's inside.
- React syncs. They're covered by the vendored-code trigger and the [react-vendoring](../areas/react-vendoring.md) rubric.

## Signs in review

**Flight serialization protocol**

- Next.js code that parses, builds, or rewrites Flight rows: row ids, row tags (`I`, `H`, `E`, `T`, `D`, ...), reference prefixes (`$`, `$L`, `$@`, `$B`, `$F`, `$h`, ...), or the `id:tag` line layout.
- Scanning a payload's bytes or text for a known substring or row, or splitting it on newlines, to get data out of it.
- Injecting, stripping, or reordering rows in an RSC stream, or concatenating Flight streams.
- Assuming a layout React doesn't promise: that the root model is row `0`, that a given row arrives first or in its own chunk, that two renders of the same tree produce the same bytes, or that a payload ends at a given byte.
- A Next.js data structure that is encoded inside Flight values in a way that only works because of how React serializes them today.

**Other React internals**

- `__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE`, `__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE`, `__SECRET_INTERNALS_*`, or the dispatchers on them.
- Underscore fields on React objects: `_payload`, `_init`, `_owner`, `_store`, `_debugInfo`, `_debugStack`, the `_response` or `_chunks` of a Flight response, or any Fiber field.
- Internal thenable or chunk states, such as `'resolved_model'`, `'resolved_module'`, or `'halted'`.
- Building or inspecting React objects by shape instead of through React: a hand-made lazy, element, or reference with a `$$typeof` symbol, or a branch on `REACT_*_TYPE` symbols other than the documented element checks.
- Scheduler mechanics: how many microtasks or tasks a render, flush, or abort takes, or which task a chunk is written in. Ordering that's part of how components behave isn't covered by this, even when it's undocumented.
- Hand edits or build-time rewrites of vendored React code under `packages/next/src/compiled/**` or in `taskfile.js`.

## Example

Bad, in `packages/next/src/server/stream-utils/`:

```ts
// Hoist preload hints out of the RSC payload so they can go in <head>.
for (const line of text.split('\n')) {
  const match = /^[0-9a-f]+:HL(.*)$/.exec(line)
  if (match) hints.push(JSON.parse(match[1]))
}
```

This depends on the row tag React uses for hints today, on how it formats that row, and on rows never splitting across chunks. A React change to any of them silently drops the hints, or throws, and nothing in Next.js's own tests is guaranteed to notice.

Good: get the data from a React API that exposes it (here, the `onHeaders` or resource hint APIs in `react-dom`), or send it on a separate channel that Next.js controls. If React has no API for it, the PR says so, links the discussion with the React team, and a human reviewer decides whether the coupling is worth it until the API exists.

More examples:

- Bad: detecting Blob references by searching serialized page data for `"$B`, and reasoning that it can't match inside a string because React escapes quotes and doubles a leading `$` (#101440). Both are encoding details React can change, and a missed match gives a wrong answer, not an error.
- Not a match: relying on the order in which effects run across a component tree. It's undocumented, but changing it would break apps, so it's contract, not internals.

## Why

React ships its internals to Next.js as compiled code, so nothing stops Next.js from depending on them, and the types don't say which parts are stable. The Flight protocol in particular looks like a simple line format, but React changes it freely: rows have been added, renamed, and re-encoded across releases. When Next.js parses it, every React sync can break App Router rendering, navigation, or prerendered payloads already in a CDN. An agent can check that the code matches React today. It can't judge whether React will keep it that way, or whether the React team should add an API instead. That takes a person who knows both codebases.

---
name: insight-error-page
description: Write or audit an Instant Navigation validation error page for the Next.js dev overlay. Use when creating a new `errors/<slug>.mdx` page, auditing an existing one, or checking that a page matches the framework fix cards. Covers page structure, title alignment, FixCard cards with Copy prompt button, code snippets, terminology verification against canonical docs, and Vercel technical writing style.
metadata:
  internal: true
---

# Validation Error Page — Write & Audit

Write or audit an `errors/<slug>.mdx` validation error page that ships from this repo to `nextjs.org` and mirrors the fix-card set in the Next.js dev overlay.

> **Terminology**: match the current error pages: use `kind: error` and call these "errors" in the body. Non-blocking navigation insights are still called insights where their behavior requires that distinction. Do not infer the error-page frontmatter from this skill's name.

## When to use this skill

- **Write mode**: "create the error page for `next-prerender-random`", "write the sync IO docs"
- **Audit mode**: "audit the blocking-prerender-dynamic page", "check the error pages match the framework"
- Any task involving `errors/*.mdx` pages in the Instant Navigation validation family

## Source of truth chain

Every decision traces back to one of these. When in doubt, read the source — don't guess.

| What                                          | Source file                                                                                   | How to read it                                                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Card titles, IDs, groups, snippets, link URLs | `packages/next/src/next-devtools/dev-overlay/components/instant/instant-guidance-data.ts`     | Each `FixCard[]` array is one error family                                                                                             |
| Error headline (literal text user sees)       | `packages/next/src/server/app-render/sync-io-messages.ts`, `blocking-route-messages.ts`, etc. | `createSyncIOError`, `createDynamicBodyError`, etc. — the template string is the headline                                              |
| Existing page (content to preserve)           | `errors/<slug>.mdx` in this repo                                                              | Read the full file; relocate useful content that doesn't fit fix cards into its matching fix, Gotchas, or genuinely additional options |
| Canonical API docs (behavior and terminology) | `docs/01-app/` in this repo                                                                   | Verify behavior, requirements, thresholds, defaults, API names, and terminology against the reference                                  |
| Template structure                            | This skill file (below)                                                                       | The canonical shape of the page                                                                                                        |
| Vercel writing style                          | The `vercel-technical-writing` skill in `vercel/front` (not present here)                     | Apply end-to-end; see "Voice and style" below for the rules condensed                                                                  |

## Documentation ownership

Canonical API references and guides own API behavior, requirements, limits, numeric thresholds, and defaults. Error pages rephrase that existing information to explain a diagnostic and help the reader choose a fix.

- Verify behavior against the implementation and its canonical documentation. If a requirement is missing from the API reference or guide, add it there first, then summarize it on the error page with a link to the relevant section.
- Keep complete requirement tables and API explanations in the reference. Error pages may restate facts needed to understand a fix, but must link to the canonical documentation and must not be the only place a requirement is documented.
- Use code examples to illustrate documented requirements. A value in an example does not define an API minimum or default. For cache lifetimes, the thresholds belong in `cacheLife`'s Prerendering behavior section.
- Link sibling error pages for diagnostic-specific patterns. Follow their links to the API reference for the underlying behavior and constraints.
- When a cause gets its own diagnostic, remove its superseded fix sections from unrelated error pages. Keep a brief cross-link only when a reader can still reach that page for the cause, such as a combined production fallback. Verify those destinations in the error factories instead of adding the same link to every sibling page.

## Before you start

1. **Read the framework card data** for the error family you're writing. Find the matching `FixCard[]` in `instant-guidance-data.ts`. Inspect `getCards()` as well as the base arrays, because variants can replace, add, or remove cards. Note every card's `id`, `title`, `group`, `link`, and `snippets`, across all contexts the page covers.
2. **Read the factory message** that produces the dev-overlay headline. Find `createSyncIOError`, `createSyncIOClientError`, `createDynamicBodyError`, etc. The headline template (minus the `Route "..."` prefix) becomes the page `title`.
3. **Read the existing `errors/<slug>.mdx`** if it exists. Note every pattern, code example, and caveat. You must preserve all useful content — relocate it if the new structure doesn't have a 1:1 slot for it.
4. **Read the canonical docs** for every API you'll reference: `use cache`, `cacheLife`, `cacheTag`, `connection`, `Suspense`, `useEffect`, `use client`, `generateStaticParams`, etc. Use the exact terminology from the published docs.
5. **Read the current reference page and index**: `errors/blocking-prerender-random.mdx` and `errors/instant-navigation-validation.mdx`. If this skill conflicts with the current framework or established page conventions, follow those sources and correct the stale skill instructions.
6. **Apply Vercel technical writing style** (active voice, sentence-case headings, no banned words). The full `vercel-technical-writing` skill lives in `vercel/front`; the condensed rules below are the minimum bar.

## Page structure (mandatory)

Follow this structure. Include context-specific constraints where needed, especially when one error page covers both ordinary validation and fully static routes. Do not give all fixes to every context without checking the framework card sets.

```
---
title: <literal dev-overlay headline, no period, strip Route "..." prefix>
kind: error
---

<the Instant Navigations callout div — the styled box linking the blog post and the Ensuring instant navigations guide; copy it from any existing insight page>

<Framing, 2-3 paragraphs. Paragraph 1 opens "During <phase>, <event>" in past tense (e.g. "During prerendering, a Server Component called ..."), names the APIs, and states the mechanism or consequence. Never open a paragraph with inline code — lead with a word ("The `params` prop ..."). Later paragraphs carry the teaching and cross-link sibling pages (parallel API families + client/server counterpart) using the "For X, see Y" formula.>

## Ways to fix this

<Context/applicability guidance when the card set varies by route body, metadata, viewport, or static requirement>
<FixCardGrid> wrapping the framework fixes as peers, in an order consistent with each applicable card set

## <Card 1 title>
  Choose this fix when ...
  ### Patterns
  ### Trade-off
  ### Gotchas

## <Card 2 title>
  ...

## <Card N title>
  ...

(optional: ## Other options — only for useful patterns that do not map to this error's framework cards. A fix offered by any applicable framework card belongs alongside the other fixes, even when it is covered in depth on a sibling page. Show its common pattern and link to that sibling for more detail.)

## Verifying the fix
  (canonical two paragraphs — see "Verifying the fix" rule below)

<Closing section matching the constraint: ordinary validation opt-out, sync-IO explanation, or static-requirement removal. Shared pages qualify opt-out advice by context.>

## Related validation errors
  See [Instant Navigation validation errors](/docs/messages/instant-navigation-validation) for the complete reference.
```

## Rules (hard requirements)

### Frontmatter

- `title` = the dev-overlay display headline, no period. That is the string the overlay shows (see the headline strings in `errors.tsx` / the factory in e.g. `sync-io-messages.ts`), with the `Route "..."` prefix stripped and any inline expression genericized (the client-hook overlay shows `` `useSearchParams()` `` inline; its docs title says "in a Client Component" instead).
- `kind: error` — match the canonical validation error pages. Non-blocking navigation insight pages may have different frontmatter; inspect the matching page family first.

### Verifying the fix

Every page has a `## Verifying the fix` section before the opt-out block. No page has a top-level Good to know; page-specific tips go in Gotchas under the relevant fix section. Two canonical paragraphs:

1. The observable check: "After applying a fix, reload the route and confirm the page immediately paints meaningful UI, with any `<Suspense>` fallbacks covering only the regions that stream in." (navigation insights say "navigate to the route and confirm the insight no longer appears in the dev overlay and ..." instead of "reload the route"). Followed by the empty-shell caveat sentence: a boundary around the whole page body can pass validation with an empty shell.
2. The tooling paragraph: dev overlay points at the failing component; from a build, the output is more abbreviated. Run `next build --debug-prerender` for full user-frame stack traces and `next build --debug-build-paths /dashboard /settings` to iterate on specific routes. Copy the exact wording from an existing page.

State the check as what the reader sees in the browser, not as framework artifacts ("the static shell renders real content" was retired for this reason — a fallback is expected after a correct fix; the check is that it covers only the streamed region).

### `<FixCard>` cards

- Wrap all cards in a single `<FixCardGrid>` (the same component used in `docs/01-app/02-guides/instant-navigation.mdx`).
- Every framework fix is a peer under `## Ways to fix this`, with its own card and `## <Fix>` section. Never demote a card fix to "Other options" or omit it because a sibling page documents it.
- For a page covering multiple framework card sets, show their unique fixes in one grid. Preserve the relative order within each applicable set, and explain availability by context. Do not suggest streaming, blocking, or dynamic markers for a route that must remain fully static.
- `title` = card title from framework, **verbatim**. If it reads awkward as a heading, change the framework first — never the docs.
- `href` = `#` + the auto-slug of the title (e.g. "Generate on every request" → `#generate-on-every-request`). This must match what the heading auto-generates.
- `group` = card group from framework (`dynamic`, `cache`, `client`, `stream`, `defer`, `measure`, `block`, `render`, `ignore`, `upgrade`, `disable`, `static`).
- `snippets` = the same `snippets` array as the matching framework `FixCard` in `instant-guidance-data.ts`. Copy it verbatim. No description prose lives on the card — the snippets carry the visual.
- Card snippets are pseudocode with at most three displayed lines. Show the solution and relevant data. Highlight only the changed value or operation, leaving setup and omission comments unhighlighted. Put complete, valid examples in Patterns. If the framework snippet needs correction, fix it there first and keep the docs in sync.
- Self-close the tag (`<FixCard ... />`). The card has no children.
- **No `prompt` prop.** The "Copy prompt" button builds the prompt dynamically at click time from the page URL and the card's `title` + `href`. The agent receives a prompt that points at the rule docs and names the fix — it then reads the error page for the diagnostic and matching fix, and follows its canonical API-reference links for behavior and constraints. The error page supplies troubleshooting guidance, not a separate API specification.

### `## <Fix>` sections

- Heading text = card title, verbatim. Auto-slugs to the `href` above.
- Opens with: "Choose this fix when `<condition>`."
- `### Patterns` — one `####` per meaningfully different shape of the fix. Each has:
  - 1–2 sentences of plain-prose framing
  - One short, readable `jsx filename="app/..."` snippet (complete, copy-paste-ready, no `...existing code...`)
  - Optional `Learn more:` link below the snippet
- `### Trade-off` — 1 paragraph. Mandatory. Describe the trade-off **in the context of this error**, not the generic API trade-off. If the only honest trade-off is the canonical API behavior (e.g. "GSP requires a rebuild when the list changes"), keep it to one sentence and link out to the API reference. Don't repeat what the API reference page already covers.
- `### Gotchas` — bulleted list. Mandatory (at least 1 bullet).
- When a cache fix can still fail because of its lifetime, add a short Gotcha linking to the `cacheLife` reference and the dedicated short-lived-cache error. Do not recreate lifetime fix sections on pages for a different diagnostic.

### Code snippets

- Must be valid React. Do not show unstable APIs (random, time, crypto) inline during render in a Client Component — that causes a hydration mismatch. Defer to `useEffect` + `useState` or an event handler.
- Lazy `useState` initializers (e.g. `useState(() => someUnstableCall())`) run during SSR — warn against this in Gotchas.
- `useRef` lazy-init pattern is valid for stable IDs (initialize in a getter function, not inline). Only applicable when the value should be computed once and frozen — not when it should reflect the current moment.
- Always include `filename="app/..."` on code blocks.
- When a pattern defers rendering to after hydration (e.g. `useEffect`), the Trade-off must link to [Preventing flash before hydration](/docs/app/guides/preventing-flash-before-hydration).

### Cross-links

- Framing paragraph: link to sibling pages (client ↔ server counterpart, parallel API families).
- Gotchas: link to the `-client` page when warning about inline render in Client Components.
- Related validation errors: use the canonical single link to `/docs/messages/instant-navigation-validation`. Add new error pages to the appropriate category in `errors/instant-navigation-validation.mdx`. Do not maintain a duplicate full list or an arbitrary subset of sibling pages on each error page. Keep useful context-specific sibling links inline in the body.
- Every API reference and file convention must be inline-linked throughout, not reserved for the related-errors section.
- **Cross-page pattern linking**: When a fix on one page is covered in depth on a sibling page, show only the most common pattern inline and link out to the sibling for the full set. For example, a server page's "Render on the client" fix shows one client pattern and links to the `-client` page; a client page's "Other options" section bridges to the server page's cache fix. Don't duplicate entire sections across sibling pages — keep each error page focused on troubleshooting. API references and guides remain authoritative for the underlying behavior.
- **First-party only**: link only to `nextjs.org/docs/*`, `react.dev/*`, `developer.mozilla.org/*`, and other canonical first-party references. **Never** link to personal blogs, community write-ups, conference talks, X/Bluesky posts, GitHub gists, or any third-party source — including the page author's own blog. If a third-party post inspired a pattern, internalize the idea and write it in our own voice without citation. Sibling error pages, our own docs, and primary API specs are the only acceptable destinations.

### Terminology (verify against canonical docs)

- `use cache` directive (not `"use cache"` in prose)
- Cache Components (capitalized)
- static shell (link to `/docs/app/glossary#static-shell`)
- `instant` (not `instant`)
- `cacheLife` / `cacheTag` / `revalidateTag` / `updateTag` — use published names exactly
- `connection()` from `next/server`
- Client Component / Server Component (capitalized)
- [prerendering](/docs/app/glossary#prerendering) — always linked on first use

### Allow blocking route section (canonical pattern)

When the framework card set includes `instant = false` (group `block`), use the canonical `## Allow blocking route` section shape. All pages with this fix must match. Cross-page consistency matters — diverging from this shape produces a page that reads like an outlier.

**Intro**: One paragraph explaining what setting `instant` to `false` does and what the trade-off is. Optional second paragraph noting when this is _rarely_ the right answer (for example, on client-hook or cache fixes where a Suspense boundary is almost always feasible). Phrase the rarity directly.

**Patterns**: For page-body errors (runtime data, uncached data, client hooks), use both `#### Opt the page out` and `#### Opt the layout out`. For viewport errors, use only `#### Opt the layout out` (viewport always lives on a layout). Each pattern has:

- 1–2 sentences of framing explaining when to use that scope
- A `jsx filename="app/..."` snippet showing the export
- A `Learn more:` link

After the pattern snippets, include a "Use either pattern when:" bulleted list (2 bullets: layout-shell-not-meaningful + incremental migration; phrase singular for viewport pages with one pattern) and a single-sentence closer explaining when the sibling fixes apply, with links to their sections. Do not imply a priority between valid card fixes.

**Trade-off**: One paragraph. "Navigations to this route are not instant. The user waits for the full server render before any HTML arrives. Use this only when that latency is the deliberate cost of the route's purpose."

**Gotchas** (mandatory bullets, in this order):

- Setting `instant` to `false` opts out only the segment that exports it. Descendant segments remain validated by their own config or the global default.
- This export does not disable prerendering. The route still prerenders if it can. It only disables instant-navigation validation for the route.
- Page-specific gotchas (for example, viewport pages add framework-synthesized routes gotcha) come after the two canonical bullets.

**Never** add a gotcha that says `Confirm with the user that ...` in user-facing body prose. The page is what the user reads — write for them, not for the agent. Guardrails the agent should apply belong in the actual code-shape guidance under the `### Patterns` heading (which the agent reads via the docs link in the copied prompt).

### Don't want this validation?

Use `## Don't want this validation?` before `## Related validation errors` when instant-navigation validation is the constraint. Sync-IO pages instead explain why opting out does not clear the prerender error. Fully static pages explain how to remove the static requirement. A shared page covering multiple contexts must scope opt-out advice to ordinary validation and explicitly say it does not relax `ensureStatic = 'navigation'`. Use the ordinary-validation block below where applicable:

```mdx
## Don't want this validation?

Instant-navigation validation runs by default in [Cache Components](/docs/app/api-reference/config/next-config-js/cacheComponents) apps and is what surfaces this error.

- **One segment**: add [`export const instant = false`](/docs/app/api-reference/file-conventions/route-segment-config/instant) to the page or layout file. This opts out the segment itself. Child segments are still validated during client navigations.
- **Entire app**: set [`experimental.instantInsights.validationLevel`](/docs/app/api-reference/file-conventions/route-segment-config/instant#configuring-validation-defaults) to `'manual-warning'` in `next.config`. This limits validation to segments that explicitly export `instant`.

See [Ensuring instant navigations](/docs/app/guides/instant-navigation) for the full model.
```

### Writing style

- Lead each section with the answer: "Choose this fix when ..."
- Sentence-case headings, no periods
- No em-dashes for emphasis
- No banned words: `easy`, `quick`, `simple`, `just`, `very`, `basically`, `obviously`, `utilize`, `facilitate`, `leverage`, `robust`, `seamless`, `cutting-edge`, `innovative`
- No filler: `In this guide ...`, `As mentioned above ...`, `Let's take a look at ...`, `It's worth noting ...`
- Active voice + direct address: "You wrap the component" not "the component is wrapped"
- No "Default." labels on patterns (removed during review — patterns don't have a default)
- No semicolons in prose — split into two sentences, or use ", and" for an elliptical contrast
- Never open a paragraph or sentence with inline code — lead with a word ("The `params` prop ...")
- Code in headings is fine only when it names a real API with its exact casing (`await connection()`, `cacheLife`); concepts stay prose ("Opt the page out")
- `Learn more:` link text = the target page's exact title for guides ("Streaming", "Ensuring instant navigations"), the bare code name matching the doc title for API references ([`connection`], [`io`], [`searchParams`] — no parens); third-party APIs keep their canonical spelling ([`performance.now()`])

## Audit checklist

When auditing an existing page, check every item:

- [ ] `title` = overlay display headline, no period, inline expressions genericized
- [ ] `kind: error` in frontmatter
- [ ] No top-level Good to know; `## Verifying the fix` present with the two canonical paragraphs (observable check + `--debug-prerender` tooling)
- [ ] All cards wrapped in a single `<FixCardGrid>`
- [ ] All applicable framework fixes are peers, with cards and matching fix sections; shared pages state context restrictions and preserve each set's relative order
- [ ] Every `<FixCard />` `title` = card title verbatim
- [ ] Every `<FixCard />` `href` = `#` + auto-slug of the heading
- [ ] Every `<FixCard />` `group` matches framework card group
- [ ] Every `<FixCard />` `snippets` matches a corresponding framework card; snippets show the solution in at most three lines and highlight only the change
- [ ] No `prompt` prop on any `<FixCard />` — the copy button generates the prompt from `title` + `href` + the page URL
- [ ] `<FixCard />` is self-closing (no children, no description prose)
- [ ] Every `## <Fix>` heading = card title verbatim
- [ ] Every fix section has `### Patterns`, `### Trade-off`, `### Gotchas`
- [ ] No "Default." labels on patterns
- [ ] No `Confirm with the user ...` phrasing anywhere in the page. The page is for the user; the agent reads the same page via the docs link in the copied prompt.
- [ ] If the page has `## Allow blocking route`, it matches the canonical shape: patterns (page-body errors use both Opt the page out + Opt the layout out; viewport errors use Opt the layout out only), "Use either pattern when" list, closer explaining when sibling fixes apply, canonical 2-bullet Gotchas
- [ ] Code snippets are valid React (no inline `Math.random()` during render in Client Components)
- [ ] `useState(() => Math.random())` warned against in Gotchas
- [ ] All API references inline-linked throughout
- [ ] Sibling pages cross-linked in framing paragraph (inline body links carry the bulk of API references)
- [ ] Closing validation guidance matches the constraint: ordinary opt-out, sync-IO explanation, or static-requirement removal; shared pages qualify opt-outs so they do not appear to bypass fully static requirements
- [ ] `## Related validation errors` links to the shared index, and the index includes the new page
- [ ] Useful existing content preserved in the appropriate fix or Gotchas; Other options contains no framework card fixes
- [ ] Requirements, numeric thresholds, limits, defaults, and behavior are documented in the canonical API reference or guide; the error page summarizes and links to that source
- [ ] Terminology matches canonical docs (verified, not assumed)
- [ ] Vercel technical writing style applied (no banned words, active voice, sentence-case headings)
- [ ] Framework card `link` URLs point to the correct heading auto-slugs; every local docs target and anchor resolves
- [ ] Superseded fix sections are removed when a cause has its own diagnostic; remaining cross-links serve a reachable reader path
- [ ] No prose semicolons; no paragraph opens with inline code
- [ ] `Learn more:` texts follow the title/bare-API convention and every target is the best page for the pattern

## File locations

- New pages: `errors/<slug>.mdx` (this repo)
- URL: `https://nextjs.org/docs/messages/<slug>`
- `nextjs.org` clones `errors/` from canary on every deploy (sync pipeline lives in `vercel/front`)
- Framework cards: `packages/next/src/next-devtools/dev-overlay/components/instant/instant-guidance-data.ts`
- Factory messages: `packages/next/src/server/app-render/sync-io-messages.ts`, `blocking-route-messages.ts`, `use-cache-messages.ts`

## Reference page

The canonical reference page is `errors/blocking-prerender-random.mdx`. Read it and the matching body/metadata/viewport/static sibling before editing. The shared reference index is `errors/instant-navigation-validation.mdx`. Current framework data and these pages take precedence over stale examples in this skill.

## Verification

Run focused Prettier and MDX lint checks on the edited files, compile new or structurally changed MDX, and check local docs links and heading anchors. Compare the rendered card data with every applicable framework variant, including its static restrictions. Report what was actually checked. Documentation-only edits do not require a framework watch build or runtime tests. If framework code changes too, follow the repository build and test workflow.

## Related skills

- `update-docs` for related documentation changes
- `authoring-skills` for maintaining these instructions

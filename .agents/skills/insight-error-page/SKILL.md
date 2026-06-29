---
name: insight-error-page
description: Write or audit an insight-kind error page for the Next.js dev overlay. Use when creating a new `errors/<slug>.mdx` page, auditing an existing one, or checking that a page matches the framework fix cards. Covers page structure, title alignment, FixOption cards with Copy AI prompt button, code snippets, terminology verification against canonical docs, and Vercel technical writing style.
metadata:
  internal: true
---

# Insight Error Page — Write & Audit

Write or audit an `errors/<slug>.mdx` insight-kind page that ships from this repo to `nextjs.org` and mirrors the fix-card set in the Next.js dev overlay.

> **Terminology**: the frontmatter uses `kind: insight` but the body text calls these "errors" — never "insights". Write "this error", "error pages", "dismiss the error".

## When to use this skill

- **Write mode**: "create the error page for `next-prerender-random`", "write the sync IO docs"
- **Audit mode**: "audit the blocking-prerender-dynamic page", "check the error pages match the framework"
- Any task involving `errors/*.mdx` insight pages (frontmatter has `kind: insight`)

## Source of truth chain

Every decision traces back to one of these. When in doubt, read the source — don't guess.

| What                                          | Source file                                                                                   | How to read it                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Card titles, IDs, groups, snippets, link URLs | `packages/next/src/next-devtools/dev-overlay/components/instant/instant-guidance-data.ts`     | Each `FixCard[]` array is one error family                                                           |
| Error headline (literal text user sees)       | `packages/next/src/server/app-render/sync-io-messages.ts`, `blocking-route-messages.ts`, etc. | `createSyncIOError`, `createDynamicBodyError`, etc. — the template string is the headline            |
| Existing page (content to preserve)           | `errors/<slug>.mdx` in this repo                                                              | Read the full file; relocate useful content that doesn't fit fix cards into Gotchas or Other options |
| Canonical API docs (terminology)              | `docs/01-app/` in this repo                                                                   | Cross-check every API name, directive name, and concept against the published docs                   |
| Template structure                            | This skill file (below)                                                                       | The canonical shape of the page                                                                      |
| Vercel writing style                          | The `vercel-technical-writing` skill in `vercel/front` (not present here)                     | Apply end-to-end; see "Voice and style" below for the rules condensed                                |

## Before you start

1. **Read the framework card data** for the error family you're writing. Find the matching `FixCard[]` in `instant-guidance-data.ts`. Note every card's `id`, `title`, `group`, `link`, and `snippets`.
2. **Read the factory message** that produces the dev-overlay headline. Find `createSyncIOError`, `createSyncIOClientError`, `createDynamicBodyError`, etc. The headline template (minus the `Route "..."` prefix) becomes the page `title`.
3. **Read the existing `errors/<slug>.mdx`** if it exists. Note every pattern, code example, and caveat. You must preserve all useful content — relocate it if the new structure doesn't have a 1:1 slot for it.
4. **Read the canonical docs** for every API you'll reference: `use cache`, `cacheLife`, `cacheTag`, `connection`, `Suspense`, `useEffect`, `use client`, `generateStaticParams`, etc. Use the exact terminology from the published docs.
5. **Apply Vercel technical writing style** (active voice, sentence-case headings, no banned words). The full `vercel-technical-writing` skill lives in `vercel/front`; the condensed rules below are the minimum bar.

## Page structure (mandatory)

Every page follows this exact shape. Do not add, remove, or reorder sections.

```
---
title: <literal dev-overlay headline, no period, strip Route "..." prefix>
kind: insight
---

<1-paragraph framing: what triggered the insight, name the APIs, link to Cache Components and instant navigation>

<Cross-link to sibling pages (parallel API families + client/server counterpart)>

> **Good to know**: In [`next dev`](/docs/app/api-reference/cli/next#next-dev-options), the error overlay points at the failing component. Run `next build --debug-prerender` to get the full list of blocking routes with stack traces. When iterating on specific routes, use `next build --debug-build-paths /dashboard /settings` to rebuild only those pages.

## Ways to fix this

<FixOption /> cards — one per framework card, in framework order

## <Card 1 title>
  Choose this fix when ...
  ### Patterns
  ### Trade-off
  ### Gotchas
  (optional: ### Short-lived caches — only for cache fixes)

## <Card 2 title>
  ...

## <Card N title>
  ...

(optional: ## Other options — for useful patterns that don't map to a framework fix card but are still relevant. Examples: bridging to a different error page's fix ("Cache the value in a Server Component" on a client page, linking to the server page), upstream content from `errors/<slug>.mdx` that doesn't fit the card structure, alternative APIs that sidestep the problem entirely. Each option gets its own `###` heading with framing prose, a code snippet, and a "Learn more" link to the page that covers it in full.)

## Don't want this validation?
  (canonical opt-out block — see "Don't want this validation?" rule below)

## Useful links
```

## Rules (hard requirements)

### Frontmatter

- `title` = literal dev-overlay headline, no period. Get this from the factory function in the framework (e.g. `sync-io-messages.ts`). Strip the `Route "..."` prefix.
- `kind: insight` — always present.

### Good to Know

- **Always the same canonical block** across all insight pages (the `--debug-prerender` tip). Never put page-specific content here.
- Useful page-specific tips go in Gotchas under the relevant fix section.

### `<FixOption>` cards

- One per framework card, in the same order as the framework `FixCard[]` array.
- `title` = card title from framework, **verbatim**. If it reads awkward as a heading, change the framework first — never the docs.
- `href` = `#` + the auto-slug of the title (e.g. "Generate on every request" → `#generate-on-every-request`). This must match what the heading auto-generates.
- `group` = card group from framework (`dynamic`, `cache`, `client`, `stream`, `defer`, `measure`, `block`, `render`, `silence`).
- Children = one-sentence plain-prose summary. **No inline code**, no API names in backticks, no snippets. Save technical detail for the section body.
- **No `prompt` prop.** The "Copy AI prompt" button builds the prompt dynamically at click time from the page URL and the card's `title` + `href`. The agent receives a prompt that points at the rule docs and names the fix — it then reads the docs page (the same one the user is on) for every constraint and code shape. That is why this skill exists: the docs page itself **is** the prompt's source of truth.

### `## <Fix>` sections

- Heading text = card title, verbatim. Auto-slugs to the `href` above.
- Opens with: "Choose this fix when `<condition>`."
- `### Patterns` — one `####` per meaningfully different shape of the fix. Each has:
  - 1–2 sentences of plain-prose framing
  - One short, readable `jsx filename="app/..."` snippet (complete, copy-paste-ready, no `...existing code...`)
  - Optional `Learn more:` link below the snippet
- `### Trade-off` — 1 paragraph. Mandatory. Describe the trade-off **in the context of this error**, not the generic API trade-off. If the only honest trade-off is the canonical API behavior (e.g. "GSP requires a rebuild when the list changes"), keep it to one sentence and link out to the API reference. Don't repeat what the API reference page already covers.
- `### Gotchas` — bulleted list. Mandatory (at least 1 bullet).
- Optional `### Short-lived caches` subsection for cache fixes (document the 5-minute threshold).

### Code snippets

- Must be valid React. Do not show unstable APIs (random, time, crypto) inline during render in a Client Component — that causes a hydration mismatch. Defer to `useEffect` + `useState` or an event handler.
- Lazy `useState` initializers (e.g. `useState(() => someUnstableCall())`) run during SSR — warn against this in Gotchas.
- `useRef` lazy-init pattern is valid for stable IDs (initialize in a getter function, not inline). Only applicable when the value should be computed once and frozen — not when it should reflect the current moment.
- Always include `filename="app/..."` on code blocks.
- When a pattern defers rendering to after hydration (e.g. `useEffect`), the Trade-off must link to [Preventing flash before hydration](/docs/app/guides/preventing-flash-before-hydration).

### Cross-links

- Framing paragraph: link to sibling pages (client ↔ server counterpart, parallel API families).
- Gotchas: link to the `-client` page when warning about inline render in Client Components.
- Useful links: keep it short (typically 2–6 entries). Sibling error pages + the canonical [Ensuring instant navigations](/docs/app/guides/instant-navigation) guide + 1–3 API references central to the fixes but not already inline-linked throughout the body. Do not re-list every API the body mentions — those are inline-linked at first use and the section is for follow-on navigation, not an index.
- Every API reference and file convention must be inline-linked throughout, not reserved for Useful Links.
- **Cross-page pattern linking**: When a fix on one page is covered in depth on a sibling page, show only the most common pattern inline and link out to the sibling for the full set. For example, a server page's "Render on the client" fix shows one client pattern and links to the `-client` page; a client page's "Other options" section bridges to the server page's cache fix. Don't duplicate entire sections across sibling pages — keep each page lean and let the sibling be the canonical reference.
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

After the pattern snippets, include a "Use either pattern when:" bulleted list (2 bullets: layout-shell-not-meaningful + incremental migration; phrase singular for viewport pages with one pattern) and a single-sentence "Don't use this to dismiss the error. Choose [Sibling fix A](#anchor-a) or [Sibling fix B](#anchor-b) when either is feasible." closer.

**Trade-off**: One paragraph. "Navigations to this route are not instant. The user waits for the full server render before any HTML arrives. Use this only when that latency is the deliberate cost of the route's purpose."

**Gotchas** (mandatory bullets, in this order):

- Setting `instant` to `false` opts out only the segment that exports it. Descendant segments remain validated by their own config or the global default.
- This export does not disable prerendering. The route still prerenders if it can. It only silences the instant-navigation validation error.
- Page-specific gotchas (for example, viewport pages add framework-synthesized routes gotcha) come after the two canonical bullets.

**Never** add a gotcha that says `Confirm with the user that ...` in user-facing body prose. The page is what the user reads — write for them, not for the agent. Guardrails the agent should apply belong in the actual code-shape guidance under the `### Patterns` heading (which the agent reads via the docs link in the copied prompt).

### Don't want this validation?

Every insight page ends (just before `## Useful links`) with the canonical opt-out block. It teaches the reader how to silence validation per-segment, subtree-wide, and app-wide, since instant-navigation validation runs by default in Cache Components apps. Copy verbatim:

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

## Audit checklist

When auditing an existing page, check every item:

- [ ] `title` = literal dev-overlay headline (from factory function), no period
- [ ] `kind: insight` in frontmatter
- [ ] Good to Know = the canonical `--debug-prerender` block (no page-specific content)
- [ ] One `<FixOption>` per framework card, in framework order
- [ ] Every `<FixOption>` `title` = card title verbatim
- [ ] Every `<FixOption>` `href` = auto-slug of the heading
- [ ] Every `<FixOption>` `group` matches framework card group
- [ ] No `prompt` prop on any `<FixOption>` — the copy button generates the prompt from `title` + `href` + the page URL
- [ ] `<FixOption>` children: plain prose, no backticks, no inline code
- [ ] Every `## <Fix>` heading = card title verbatim
- [ ] Every fix section has `### Patterns`, `### Trade-off`, `### Gotchas`
- [ ] No "Default." labels on patterns
- [ ] No `Confirm with the user ...` phrasing anywhere in the page. The page is for the user; the agent reads the same page via the docs link in the copied prompt.
- [ ] If the page has `## Allow blocking route`, it matches the canonical shape: patterns (page-body errors use both Opt the page out + Opt the layout out; viewport errors use Opt the layout out only), "Use either pattern when" list, "Don't use this to dismiss the error" closer, canonical 2-bullet Gotchas
- [ ] Code snippets are valid React (no inline `Math.random()` during render in Client Components)
- [ ] `useState(() => Math.random())` warned against in Gotchas
- [ ] All API references inline-linked throughout
- [ ] Sibling pages cross-linked in framing paragraph + Useful links
- [ ] Useful links section is short (typically 2–6 entries). Does not re-list APIs that are already inline-linked in the body.
- [ ] `## Don't want this validation?` section present, verbatim per the canonical block
- [ ] Upstream `errors/<slug>.mdx` content preserved (relocated to Gotchas or Other options if needed)
- [ ] Terminology matches canonical docs (verified, not assumed)
- [ ] Vercel technical writing style applied (no banned words, active voice, sentence-case headings)
- [ ] Framework card `link` URLs point to the correct heading auto-slugs (if not, flag as a framework follow-up)
- [ ] Short-lived caches subsection present under cache fixes (when applicable)

## File locations

- New pages: `errors/<slug>.mdx` (this repo)
- URL: `https://nextjs.org/docs/messages/<slug>`
- `nextjs.org` clones `errors/` from canary on every deploy (sync pipeline lives in `vercel/front`)
- Framework cards: `packages/next/src/next-devtools/dev-overlay/components/instant/instant-guidance-data.ts`
- Factory messages: `packages/next/src/server/app-render/sync-io-messages.ts`, `blocking-route-messages.ts`, `use-cache-messages.ts`

## Reference page

The canonical reference page is `errors/blocking-prerender-random.mdx`. When writing a new page, read it first to match the exact structure, tone, and level of detail.

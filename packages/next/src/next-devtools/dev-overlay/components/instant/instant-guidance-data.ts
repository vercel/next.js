export type CardColor = 'blue' | 'purple' | 'red' | 'amber' | 'teal' | 'gray'

export type FixCardGroup =
  | 'stream'
  | 'block'
  | 'cache'
  | 'static'
  | 'dynamic'
  | 'client'
  | 'defer'
  | 'measure'
  | 'ignore'
  | 'render'

export type FixCardIcon =
  | 'align-left'
  | 'database'
  | 'history'
  | 'layout'
  | 'loading'
  | 'pointer-click'
  | 'minus-circle'
  | 'server-stack'
  | 'timer'
  | 'zap'

export const FIX_CARD_GROUPS: Record<
  FixCardGroup,
  { label: string; color: CardColor; icon: FixCardIcon }
> = {
  stream: { label: 'Stream', color: 'blue', icon: 'align-left' },
  block: { label: 'Block', color: 'red', icon: 'loading' },
  cache: { label: 'Cache', color: 'purple', icon: 'database' },
  static: { label: 'Static', color: 'gray', icon: 'zap' },
  dynamic: { label: 'Dynamic', color: 'blue', icon: 'server-stack' },
  client: { label: 'Client', color: 'amber', icon: 'layout' },
  defer: { label: 'Defer', color: 'amber', icon: 'pointer-click' },
  measure: { label: 'Measure', color: 'gray', icon: 'timer' },
  ignore: { label: 'Ignore', color: 'red', icon: 'minus-circle' },
  render: { label: 'Render', color: 'gray', icon: 'layout' },
}

export type FixCard = {
  /** Stable docs-anchor id for this fix card. */
  id: string
  title: string
  group: FixCardGroup
  /** Docs URL the card links to, or `null` for no link. */
  link: string | null
  snippets: Snippet[]
  /**
   * AI-agent prompt copied when the user presses the "Copy AI prompt" button on
   * the card. Phrased as an instruction the agent can act on directly.
   */
  prompt?: string
}

export type SnippetPart = {
  text: string
  highlight?: boolean
}

export type Snippet = {
  text: string
  highlight?: boolean
  // When present, render the line with inline highlighted parts instead of
  // applying the line-level `highlight` flag. `text` is still kept for any
  // tooling that reads the full line content.
  parts?: SnippetPart[]
}

// ── Blocking-route cards ──────────────────────────

const runtimeCards: FixCard[] = [
  {
    id: 'wrap-in-or-move-into-suspense',
    title: 'Wrap in or move into Suspense',
    group: 'stream',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense',
    snippets: [
      { text: '<Suspense fallback={…}>', highlight: true },
      { text: '  <DataChild />' },
      { text: '</Suspense>', highlight: true },
    ],
    prompt:
      'Wrap the component that reads cookies(), headers(), params, or searchParams in <Suspense>. The fallback prop must render synchronous, deterministic JSX (no fetch, no awaiting, no Math.random or Date.now) that approximates the final layout (skeleton, spinner, or stable placeholder text). Import Suspense from "react". Do not change the data access call. Place the Suspense boundary as close to the access as possible so the cached content above remains in the static shell. If the access is deep in a tree and used for a small piece of UI, prefer to push the access down to the leaf component that needs it instead of awaiting it at the top and forwarding the value.',
  },
  {
    id: 'for-known-params-prerender',
    title: 'For known params, prerender',
    group: 'cache',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender',
    snippets: [
      {
        text: 'function generateStaticParams() {',
        parts: [
          { text: 'function ' },
          { text: 'generateStaticParams', highlight: true },
          { text: '() {' },
        ],
      },
      {
        text: '  return [{ slug: "…" }]',
        parts: [
          { text: '  return ' },
          { text: '[{ slug: "…" }]', highlight: true },
        ],
      },
      { text: '}' },
    ],
    prompt:
      'Add a generateStaticParams() export to the dynamic segment. Return an array of param objects whose keys match the segment\'s [param] names. Each entry is prerendered into static HTML at build time. With Cache Components, requests for params not in the list are served a fallback shell and the route is upgraded in the background. Return a subset of known params for common routes (popular categories, top locales, recent slugs); rare or open-ended params will fall back at runtime. Do not introduce new imports beyond Next.js types. If you can\'t return at least one known param at build time, use "Wrap in or move into Suspense" instead.',
  },
  {
    id: 'allow-blocking-route',
    title: 'Allow blocking route',
    group: 'block',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route',
    snippets: [
      { text: '// page.tsx or layout.tsx' },
      { text: 'export const instant = false', highlight: true },
    ],
    prompt:
      'Add "export const instant = false" as a top-level export in the page or layout file. This silences the warning for this segment. Confirm with the user that the route is intentionally request-time before applying this change: the export exempts the segment from instant-navigation validation, and the route renders on every request, so navigations to it block until the render completes.',
  },
]

const clientHookSuspenseCard: FixCard = {
  id: 'wrap-in-or-move-into-suspense',
  title: 'Wrap in or move into Suspense',
  group: 'stream',
  link: 'https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense',
  snippets: [
    { text: '<Suspense fallback={…}>', highlight: true },
    { text: '  <SidebarNav />' },
    { text: '</Suspense>', highlight: true },
  ],
  prompt:
    'Wrap the component that calls the navigation hook in <Suspense>. The fallback prop must render synchronous, deterministic JSX (no fetch, no awaiting, no Math.random or Date.now) that approximates the final layout. Import Suspense from "react". Do not change the hook call itself. Place the Suspense boundary as close to the hook call as possible so the rest of the route stays in the prerendered static shell.',
}

const clientHookBlockCard: FixCard = {
  id: 'allow-blocking-route',
  title: 'Allow blocking route',
  group: 'block',
  link: 'https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route',
  snippets: [
    { text: '// page.tsx or layout.tsx' },
    { text: 'export const instant = false', highlight: true },
  ],
  prompt:
    'Add "export const unstable_instant = false" as a top-level export in the page or layout file. This silences the warning for this segment. Confirm with the user that the route is intentionally request-time before applying this change: the export exempts the segment from instant-navigation validation, and the route renders on every request, so navigations to it block until the render completes.',
}

const clientHookGspCard: FixCard = {
  id: 'for-known-params-prerender',
  title: 'For known params, prerender',
  group: 'cache',
  link: 'https://nextjs.org/docs/messages/blocking-prerender-client-hook#for-known-params-prerender',
  snippets: [
    {
      text: 'function generateStaticParams() {',
      parts: [
        { text: 'function ' },
        { text: 'generateStaticParams', highlight: true },
        { text: '() {' },
      ],
    },
    {
      text: '  return [{ slug: "…" }]',
      parts: [
        { text: '  return ' },
        { text: '[{ slug: "…" }]', highlight: true },
      ],
    },
    { text: '}' },
  ],
  prompt:
    "Add a generateStaticParams() export to the page or layout that defines the dynamic segment. Return an array of param objects whose keys match the segment's [param] names. On the generated paths, useParams resolves to a build-time constant, and usePathname and useSelectedLayoutSegment(s) (which derive from the URL path) also resolve without needing a Suspense boundary. Does not help useSearchParams, since search params come from the request URL's query string and are not part of segment params. Do not introduce new imports beyond Next.js types. If you can't return at least one known param at build time, use \"Wrap in or move into Suspense\" instead.",
}

/** useSearchParams: Stream + Block (GSP doesn't apply — search params come from request). */
const clientHookCardsSearchParams: FixCard[] = [
  clientHookSuspenseCard,
  clientHookBlockCard,
]

/** useParams: Stream + GSP + Block. */
const clientHookCardsWithGsp: FixCard[] = [
  clientHookSuspenseCard,
  clientHookGspCard,
  clientHookBlockCard,
]

/** usePathname, useSelectedLayoutSegment(s): Stream + Block. */
const clientHookCardsNoGsp: FixCard[] = [
  clientHookSuspenseCard,
  clientHookBlockCard,
]

const dynamicCards: FixCard[] = [
  {
    id: 'cache-the-component-or-data',
    title: 'Cache the component or data',
    group: 'cache',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data',
    snippets: [
      { text: 'async function Posts() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return <List items={…} />' },
    ],
    prompt:
      'Convert the highlighted data access into a cached function. Put "use cache" as the first statement of the function body. If the value depends on input that changes between calls, accept the input as a function argument so it becomes part of the cache key. Optionally call cacheTag(tag) to allow invalidation via revalidateTag(tag), and cacheLife(profile) to set automatic expiration. Do not move the call site. Do not introduce new imports beyond "next/cache".',
  },
  {
    id: 'wrap-in-or-move-into-suspense',
    title: 'Wrap in or move into Suspense',
    group: 'stream',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense',
    snippets: [
      { text: '<Suspense fallback={…}>', highlight: true },
      { text: '  <DataChild />' },
      { text: '</Suspense>', highlight: true },
    ],
    prompt:
      'Wrap the component that performs the failing data access in <Suspense>. The fallback prop must render synchronous, deterministic JSX (no fetch, no awaiting, no Math.random or Date.now) that approximates the final layout (skeleton, spinner, or stable placeholder text). Import Suspense from "react". Do not change the data fetching logic. If the surrounding parent component already has cached content, place the Suspense boundary as close to the data access as possible so the cached content remains in the static shell.',
  },
  {
    id: 'allow-blocking-route',
    title: 'Allow blocking route',
    group: 'block',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route',
    snippets: [
      { text: '// page.tsx or layout.tsx' },
      { text: 'export const instant = false', highlight: true },
    ],
    prompt:
      'Add "export const instant = false" as a top-level export in the page or layout file. This silences the warning for this segment. Confirm with the user that the route is intentionally request-time before applying this change: the export exempts the segment from instant-navigation validation, and the route renders on every request, so navigations to it block until the render completes.',
  },
]

// ── Unrendered-segment cards ──────────────────────

const unrenderedSegmentCards: FixCard[] = [
  {
    id: 'render-the-dropped-segment',
    title: 'Render the dropped segment',
    group: 'render',
    link: 'https://nextjs.org/docs/messages/instant-unrendered-segment#render-the-dropped-segment',
    snippets: [
      {
        text: 'function Layout({ children }) {',
        parts: [
          { text: 'function Layout({ ' },
          { text: 'children', highlight: true },
          { text: ' }) {' },
        ],
      },
      {
        text: '  return <><Nav />{children}</>',
        parts: [
          { text: '  return <><Nav />{' },
          { text: 'children', highlight: true },
          { text: '}</>' },
        ],
      },
      { text: '}' },
    ],
    prompt:
      'Ensure the layout renders {children} so the dropped segment is included in the render tree. If the layout conditionally omits {children} (e.g. showing a login page instead), restructure so both branches render {children} and use a Suspense boundary or conditional content inside the child segment instead. If the segment is a parallel route slot, ensure the layout renders the slot prop.',
  },
  {
    id: 'skip-validation-on-the-segment',
    title: 'Skip validation on the segment',
    group: 'ignore',
    link: 'https://nextjs.org/docs/messages/instant-unrendered-segment#skip-validation-on-the-segment',
    snippets: [
      { text: '// page.tsx or layout.tsx' },
      { text: '' },
      { text: 'export const instant = false', highlight: true },
    ],
    prompt:
      'Add "export const unstable_instant = false" as a top-level export in the dropped segment\'s page or layout file. This silences the warning for the dropped segment and tells Next.js the segment does not need instant-navigation validation. Confirm with the user that skipping validation is intentional before applying this change.',
  },
]

// ── Metadata cards ────────────────────────────────

const metadataRuntimeCards: FixCard[] = [
  {
    id: 'use-static-metadata',
    title: 'Use static metadata',
    group: 'static',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime#use-static-metadata',
    snippets: [
      { text: 'export const metadata = {', highlight: true },
      { text: '  title: "My Page"' },
      { text: '}' },
    ],
    prompt:
      'Replace the generateMetadata() function with a static metadata export. Convert all dynamic values to static strings. If the metadata depends on params, use generateStaticParams instead to prerender each variant. Do not introduce new imports.',
  },
  {
    id: 'render-page-at-request-time',
    title: 'Mark the route as dynamic',
    group: 'dynamic',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime#mark-the-route-as-dynamic',
    snippets: [
      { text: '// page.tsx or layout.tsx' },
      { text: 'await connection()', highlight: true },
    ],
    prompt:
      'Add "await connection()" from "next/server" inside a component rendered by the page, wrapped in <Suspense>. The component can render null. This creates a dynamic hole inside Suspense so the rest of the page can still prerender, while signalling to Next.js that the dynamic metadata is intentional. Use this fix when the page would otherwise have no dynamic content other than the metadata.',
  },
]

const metadataDynamicCards: FixCard[] = [
  {
    id: 'cache-the-metadata',
    title: 'Cache the metadata',
    group: 'cache',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#cache-the-metadata',
    snippets: [
      { text: 'async function generateMetadata() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return await cms.getMeta(…)' },
    ],
    prompt:
      'Add "use cache" as the first statement inside generateMetadata(). This caches the metadata so it can be included in the prerender. Optionally call cacheTag(tag) so the entry can be invalidated on-demand from a Server Action via updateTag(tag), or from a Route Handler via revalidateTag(tag, "max") for stale-while-revalidate semantics. Optionally call cacheLife(profile) to control how long the cache lives before background revalidation or full expiration. Do not introduce new imports beyond "next/cache".',
  },
  {
    id: 'render-page-at-request-time',
    title: 'Mark the route as dynamic',
    group: 'dynamic',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#mark-the-route-as-dynamic',
    snippets: [
      { text: '// page.tsx or layout.tsx' },
      { text: 'await connection()', highlight: true },
    ],
    prompt:
      'Add "await connection()" from "next/server" inside a component rendered by the page, wrapped in <Suspense>. The component can render null. This creates a dynamic hole inside Suspense so the rest of the page can still prerender, while signalling to Next.js that the dynamic metadata is intentional. Use this fix when the page would otherwise have no dynamic content other than the metadata.',
  },
]

// ── Viewport cards ────────────────────────────────

const viewportRuntimeCards: FixCard[] = [
  {
    id: 'use-static-viewport',
    title: 'Use static viewport',
    group: 'static',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime#use-static-viewport',
    snippets: [
      { text: 'export const viewport = {', highlight: true },
      { text: '  themeColor: "#000"' },
      { text: '}' },
    ],
    prompt:
      'Replace the generateViewport() function with a static viewport export. Convert all dynamic values to static ones. Do not introduce new imports.',
  },
  {
    id: 'allow-blocking-route',
    title: 'Allow blocking route',
    group: 'block',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime#allow-blocking-route',
    snippets: [
      { text: '// page.tsx or layout.tsx' },
      { text: 'export const instant = false', highlight: true },
    ],
    prompt:
      'Add "export const unstable_instant = false" as a top-level export in the page or layout file. This silences the warning for this segment. Confirm with the user that the route is intentionally fully dynamic before applying this change: the export exempts the segment from instant-navigation validation, and the route renders on every request.',
  },
]

const viewportDynamicCards: FixCard[] = [
  {
    id: 'cache-viewport-data',
    title: 'Cache the viewport data',
    group: 'cache',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic#cache-the-viewport-data',
    snippets: [
      { text: 'async function generateViewport() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return await db.getViewport(…)' },
    ],
    prompt:
      'Add "use cache" as the first statement inside generateViewport(). This caches the viewport so Next.js can include it in the prerender. Optionally call cacheLife(profile) to set automatic expiration. Do not introduce new imports beyond "next/cache".',
  },
  {
    id: 'allow-blocking-route',
    title: 'Allow blocking route',
    group: 'block',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic#allow-blocking-route',
    snippets: [
      { text: '// page.tsx or layout.tsx' },
      { text: 'export const instant = false', highlight: true },
    ],
    prompt:
      'Add "export const unstable_instant = false" as a top-level export in the page or layout file. This silences the warning for this segment. Confirm with the user that the route is intentionally fully dynamic before applying this change: the export exempts the segment from instant-navigation validation, and the route renders on every request.',
  },
]

// ── Sync IO cards (per API) ───────────────────────

const syncMathCards: FixCard[] = [
  {
    id: 'render-at-request-time',
    title: 'Generate on every request',
    group: 'dynamic',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-random#generate-on-every-request',
    snippets: [
      { text: 'await connection()', highlight: true },
      { text: 'const id = Math.random()' },
      { text: 'return <Item id={id} />' },
    ],
    prompt:
      'Add "await connection()" from "next/server" immediately before the Math.random() call. This marks the component as request-time, so Next.js excludes it from the prerendered HTML and streams it in from the nearest <Suspense> boundary on each request. Do not change the call site of Math.random() itself. Only change the call site once you\'ve confirmed with the user that a fresh value on every request is the intent.',
  },
  {
    id: 'cache-the-random-value',
    title: 'Cache the random value',
    group: 'cache',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-random#cache-the-random-value',
    snippets: [
      { text: 'function RandomId() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return String(Math.random())' },
    ],
    prompt:
      'Move the Math.random() call into its own function or component and add "use cache" as the first statement of the body. Optionally call cacheLife(profile) to control how long the same random value is reused before regeneration. Do not introduce new imports beyond "next/cache".',
  },
  {
    id: 'render-on-the-client',
    title: 'Render on the client',
    group: 'client',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-random#render-on-the-client',
    snippets: [
      { text: '"use client"', highlight: true },
      { text: '// runs in the browser' },
      { text: 'const id = Math.random()' },
    ],
    prompt:
      'Move the component that calls Math.random() into a Client Component by adding "use client" at the top of the file. The browser produces a fresh value on each visit. If the value needs to be hydration-stable, compute it inside a useEffect or event handler instead of inline during render.',
  },
]

const syncDateCards: FixCard[] = [
  {
    id: 'render-at-request-time',
    title: 'Generate on every request',
    group: 'dynamic',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-current-time#generate-on-every-request',
    snippets: [
      { text: 'await connection()', highlight: true },
      { text: 'const t = Date.now()' },
      { text: 'return <Banner time={t} />' },
    ],
    prompt:
      'Add "await connection()" from "next/server" immediately before the Date.now() call. This marks the component as request-time, so Next.js excludes it from the prerendered HTML and streams it in from the nearest <Suspense> boundary on each request. Do not change the call site of Date.now() itself. Only change the call site once you\'ve confirmed with the user that a fresh value on every request is the intent.',
  },
  {
    id: 'cache-the-timestamp',
    title: 'Cache the timestamp',
    group: 'cache',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-current-time#cache-the-timestamp',
    snippets: [
      { text: 'function Timestamp() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return <time>{Date.now()}</time>' },
    ],
    prompt:
      'Move the Date.now() call into its own function and add "use cache" as the first statement. Optionally call cacheLife(profile) to control how often the timestamp is regenerated. Do not introduce new imports beyond "next/cache".',
  },
  {
    id: 'render-on-the-client',
    title: 'Render on the client',
    group: 'client',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-current-time#render-on-the-client',
    snippets: [
      { text: '"use client"', highlight: true },
      { text: '// runs in the browser' },
      { text: 'const t = Date.now()' },
    ],
    prompt:
      'Move the component that calls Date.now() into a Client Component by adding "use client" at the top of the file. If the value needs to be hydration-stable, compute it inside useEffect instead of inline during render.',
  },
  {
    id: 'measure-elapsed-time',
    title: 'For telemetry, use a timing API',
    group: 'measure',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-current-time#for-telemetry-use-a-timing-api',
    snippets: [
      { text: 'const start = performance.now()', highlight: true },
      { text: 'doWork()' },
      { text: 'const ms = performance.now() - start' },
    ],
    prompt:
      'Replace Date.now() with performance.now() if the value is used for elapsed-time measurement, instrumentation, or telemetry. performance.now() returns a high-resolution monotonic timestamp and does not interfere with prerendering. Do not change the call if the value is rendered into the UI.',
  },
]

const syncCryptoCards: FixCard[] = [
  {
    id: 'render-at-request-time',
    title: 'Generate on every request',
    group: 'dynamic',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-crypto#generate-on-every-request',
    snippets: [
      { text: 'await connection()', highlight: true },
      { text: 'const id = crypto.randomUUID()' },
      { text: 'return <Token id={id} />' },
    ],
    prompt:
      'Add "await connection()" from "next/server" immediately before the crypto call. This marks the component as request-time, so Next.js excludes it from the prerendered HTML and streams it in from the nearest <Suspense> boundary on each request. Do not change the crypto call itself. Only change the call site once you\'ve confirmed with the user that a fresh value on every request is the intent.',
  },
  {
    id: 'cache-the-generated-value',
    title: 'Cache the generated value',
    group: 'cache',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-crypto#cache-the-generated-value',
    snippets: [
      { text: 'function TokenId() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return crypto.randomUUID()' },
    ],
    prompt:
      'Move the crypto call into its own function and add "use cache" as the first statement. Useful when the same generated value is reused as a key for another cached operation (talking to a database, signing a payload). Do not introduce new imports beyond "next/cache".',
  },
  {
    id: 'render-on-the-client',
    title: 'Render on the client',
    group: 'client',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-crypto#render-on-the-client',
    snippets: [
      { text: '"use client"', highlight: true },
      { text: '// runs in the browser' },
      { text: 'const id = crypto.randomUUID()' },
    ],
    prompt:
      'Move the component that calls the crypto API into a Client Component by adding "use client" at the top of the file. The browser produces the value, so the server never has to. If the value needs to be hydration-stable, compute it inside useEffect instead of inline during render.',
  },
]

// ── Client sync IO cards (no Suspense above) ──────

const syncClientDateCards: FixCard[] = [
  {
    id: 'wrap-in-or-move-into-suspense',
    title: 'Wrap in or move into Suspense',
    group: 'stream',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense',
    snippets: [
      { text: '<Suspense fallback={…}>', highlight: true },
      { text: '  <DateDisplay />' },
      { text: '</Suspense>', highlight: true },
    ],
    prompt:
      'Wrap the Client Component that calls Date.now() in <Suspense> in its parent. The fallback prop must render synchronous, deterministic JSX (no Date.now or Math.random) that approximates the final layout. Import Suspense from "react". Do not change the Date.now() call.',
  },
  {
    id: 'move-into-effect-or-event-handler',
    title: 'Move into effect or event handler',
    group: 'defer',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler',
    snippets: [
      { text: '<button onClick={() => {', highlight: true },
      { text: '  setT(Date.now())' },
      { text: '}} />' },
    ],
    prompt:
      'Move the Date.now() call out of the inline render path and into useEffect (for mount-time values) or an event handler (for interaction values). Initialize state to a deterministic value so SSR and the first hydrated render agree. Do not introduce new imports beyond "react".',
  },
  {
    id: 'measure-elapsed-time',
    title: 'For telemetry, use a timing API',
    group: 'measure',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api',
    snippets: [
      { text: 'const start = performance.now()', highlight: true },
      { text: 'doWork()' },
      { text: 'const ms = performance.now() - start' },
    ],
    prompt:
      'Replace Date.now() with performance.now() if the value is used for elapsed-time measurement, instrumentation, or telemetry. performance.now() returns a high-resolution monotonic timestamp and does not interfere with prerendering. Do not change the call if the value is rendered into the UI.',
  },
]

const syncClientMathCards: FixCard[] = [
  {
    id: 'wrap-in-or-move-into-suspense',
    title: 'Wrap in or move into Suspense',
    group: 'stream',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-random-client#wrap-in-or-move-into-suspense',
    snippets: [
      { text: '<Suspense fallback={…}>', highlight: true },
      { text: '  <RandomId />' },
      { text: '</Suspense>', highlight: true },
    ],
    prompt:
      'Wrap the Client Component that calls Math.random() in <Suspense> in its parent. The fallback prop must render synchronous, deterministic JSX (no Math.random or Date.now) that approximates the final layout (skeleton, spinner, or stable placeholder text). Import Suspense from "react". Do not change the Math.random() call.',
  },
  {
    id: 'move-into-effect-or-event-handler',
    title: 'Move into effect or event handler',
    group: 'defer',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-random-client#move-into-effect-or-event-handler',
    snippets: [
      { text: '<button onClick={() => {', highlight: true },
      { text: '  setId(Math.random())' },
      { text: '}} />' },
    ],
    prompt:
      'Move the Math.random() call out of the inline render path and into useEffect (for mount-time values) or an event handler (for interaction values). Initialize state to a deterministic value so SSR and the first hydrated render agree. Do not introduce new imports beyond "react".',
  },
]

const syncClientCryptoCards: FixCard[] = [
  {
    id: 'wrap-in-or-move-into-suspense',
    title: 'Wrap in or move into Suspense',
    group: 'stream',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-crypto-client#wrap-in-or-move-into-suspense',
    snippets: [
      { text: '<Suspense fallback={…}>', highlight: true },
      { text: '  <TokenId />' },
      { text: '</Suspense>', highlight: true },
    ],
    prompt:
      'Wrap the Client Component that calls the crypto API in <Suspense> in its parent. The fallback prop must render synchronous, deterministic JSX that approximates the final layout. Import Suspense from "react". Do not change the crypto call.',
  },
  {
    id: 'move-into-effect-or-event-handler',
    title: 'Move into effect or event handler',
    group: 'defer',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-crypto-client#move-into-effect-or-event-handler',
    snippets: [
      { text: '<button onClick={() => {', highlight: true },
      { text: '  setId(crypto.randomUUID())' },
      { text: '}} />' },
    ],
    prompt:
      'Move the crypto call out of the inline render path and into useEffect (for mount-time values) or an event handler (for interaction values). Initialize state to a deterministic value so SSR and the first hydrated render agree. Do not introduce new imports beyond "react".',
  },
]

// ── Card lookup ───────────────────────────────────

export type GuidanceKind =
  | 'blocking-route'
  | 'client-hook'
  | 'metadata'
  | 'viewport'
  | 'sync-io'
  | 'sync-io-client'
  | 'unrendered-segment'

export type GuidanceVariant = 'runtime' | 'dynamic'

export const DOCS_URLS: Record<GuidanceKind, string> = {
  'blocking-route': 'https://nextjs.org/docs/messages/blocking-route',
  'client-hook':
    'https://nextjs.org/docs/messages/blocking-prerender-client-hook',
  metadata:
    'https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic',
  viewport:
    'https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic',
  'sync-io': '',
  'sync-io-client': '',
  'unrendered-segment':
    'https://nextjs.org/docs/messages/instant-unrendered-segment',
}

export const SYNC_IO_DOCS: Record<string, string> = {
  'Math.random()': 'https://nextjs.org/docs/messages/blocking-prerender-random',
  'Date.now()':
    'https://nextjs.org/docs/messages/blocking-prerender-current-time',
  'Date()': 'https://nextjs.org/docs/messages/blocking-prerender-current-time',
  'new Date()':
    'https://nextjs.org/docs/messages/blocking-prerender-current-time',
  'crypto.randomUUID()':
    'https://nextjs.org/docs/messages/blocking-prerender-crypto',
  'crypto.getRandomValues()':
    'https://nextjs.org/docs/messages/blocking-prerender-crypto',
  "require('node:crypto').randomUUID()":
    'https://nextjs.org/docs/messages/blocking-prerender-crypto',
  "require('node:crypto').randomBytes(size)":
    'https://nextjs.org/docs/messages/blocking-prerender-crypto',
  "require('node:crypto').randomFillSync(...)":
    'https://nextjs.org/docs/messages/blocking-prerender-crypto',
  "require('node:crypto').randomInt(min, max)":
    'https://nextjs.org/docs/messages/blocking-prerender-crypto',
  "require('node:crypto').generatePrimeSync(...)":
    'https://nextjs.org/docs/messages/blocking-prerender-crypto',
  "require('node:crypto').generateKeyPairSync(...)":
    'https://nextjs.org/docs/messages/blocking-prerender-crypto',
  "require('node:crypto').generateKeySync(...)":
    'https://nextjs.org/docs/messages/blocking-prerender-crypto',
}

export const SYNC_IO_CLIENT_DOCS: Record<string, string> = {
  'Math.random()':
    'https://nextjs.org/docs/messages/blocking-prerender-random-client',
  'Date.now()':
    'https://nextjs.org/docs/messages/blocking-prerender-current-time-client',
  'Date()':
    'https://nextjs.org/docs/messages/blocking-prerender-current-time-client',
  'new Date()':
    'https://nextjs.org/docs/messages/blocking-prerender-current-time-client',
  'crypto.randomUUID()':
    'https://nextjs.org/docs/messages/blocking-prerender-crypto-client',
  'crypto.getRandomValues()':
    'https://nextjs.org/docs/messages/blocking-prerender-crypto-client',
  "require('node:crypto').randomUUID()":
    'https://nextjs.org/docs/messages/blocking-prerender-crypto-client',
  "require('node:crypto').randomBytes(size)":
    'https://nextjs.org/docs/messages/blocking-prerender-crypto-client',
  "require('node:crypto').randomFillSync(...)":
    'https://nextjs.org/docs/messages/blocking-prerender-crypto-client',
  "require('node:crypto').randomInt(min, max)":
    'https://nextjs.org/docs/messages/blocking-prerender-crypto-client',
  "require('node:crypto').generatePrimeSync(...)":
    'https://nextjs.org/docs/messages/blocking-prerender-crypto-client',
  "require('node:crypto').generateKeyPairSync(...)":
    'https://nextjs.org/docs/messages/blocking-prerender-crypto-client',
  "require('node:crypto').generateKeySync(...)":
    'https://nextjs.org/docs/messages/blocking-prerender-crypto-client',
}

export const EXPLANATIONS: Record<GuidanceKind, string> = {
  'blocking-route':
    'This prevents the route from being prerendered, blocking navigation and leading to a slower user experience.',
  'client-hook':
    'This blocks prerendering because the value is only available at runtime.',
  metadata:
    "This route's metadata is blocked, but the rest of its content can be prerendered.",
  viewport:
    'This prevents the page from being prerendered, leading to a slower user experience.',
  'sync-io': '',
  'sync-io-client':
    'This value would be evaluated during the prerender and fixed at build time, instead of recomputed on each visit.',
  'unrendered-segment':
    'This segment was dropped from rendering. Issues that would prevent instant navigation will go undetected.',
}

export const BLOCKING_ROUTE_NAVIGATION_EXPLANATION =
  'This prevents the navigation from being instant, leading to a slower user experience.'

const syncCardsByCause: Record<string, FixCard[]> = {
  'Math.random()': syncMathCards,
  'Date.now()': syncDateCards,
  'Date()': syncDateCards,
  'new Date()': syncDateCards,
  'crypto.randomUUID()': syncCryptoCards,
  'crypto.getRandomValues()': syncCryptoCards,
  "require('node:crypto').randomUUID()": syncCryptoCards,
  "require('node:crypto').randomBytes(size)": syncCryptoCards,
  "require('node:crypto').randomFillSync(...)": syncCryptoCards,
  "require('node:crypto').randomInt(min, max)": syncCryptoCards,
  "require('node:crypto').generatePrimeSync(...)": syncCryptoCards,
  "require('node:crypto').generateKeyPairSync(...)": syncCryptoCards,
  "require('node:crypto').generateKeySync(...)": syncCryptoCards,
}

const syncClientCardsByCause: Record<string, FixCard[]> = {
  'Math.random()': syncClientMathCards,
  'Date.now()': syncClientDateCards,
  'Date()': syncClientDateCards,
  'new Date()': syncClientDateCards,
  'crypto.randomUUID()': syncClientCryptoCards,
  'crypto.getRandomValues()': syncClientCryptoCards,
  "require('node:crypto').randomUUID()": syncClientCryptoCards,
  "require('node:crypto').randomBytes(size)": syncClientCryptoCards,
  "require('node:crypto').randomFillSync(...)": syncClientCryptoCards,
  "require('node:crypto').randomInt(min, max)": syncClientCryptoCards,
  "require('node:crypto').generatePrimeSync(...)": syncClientCryptoCards,
  "require('node:crypto').generateKeyPairSync(...)": syncClientCryptoCards,
  "require('node:crypto').generateKeySync(...)": syncClientCryptoCards,
}

export function getCards(
  kind: GuidanceKind,
  variant: GuidanceVariant,
  cause?: string
): FixCard[] {
  switch (kind) {
    case 'blocking-route':
      return variant === 'dynamic' ? dynamicCards : runtimeCards
    case 'client-hook':
      if (cause === 'useSearchParams()') return clientHookCardsSearchParams
      if (cause === 'useParams()') return clientHookCardsWithGsp
      return clientHookCardsNoGsp
    case 'metadata':
      return variant === 'runtime' ? metadataRuntimeCards : metadataDynamicCards
    case 'viewport':
      return variant === 'runtime' ? viewportRuntimeCards : viewportDynamicCards
    case 'sync-io':
      return (cause && syncCardsByCause[cause]) || []
    case 'sync-io-client':
      return (cause && syncClientCardsByCause[cause]) || []
    case 'unrendered-segment':
      return unrenderedSegmentCards
    default:
      return kind satisfies never
  }
}

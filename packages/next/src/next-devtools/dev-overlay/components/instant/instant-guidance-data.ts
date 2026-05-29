export type CardColor = 'blue' | 'purple' | 'red' | 'amber' | 'teal' | 'gray'

export type FixCardGroup =
  | 'stream'
  | 'prerender'
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
  prerender: { label: 'Prerender', color: 'purple', icon: 'history' },
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
    link: 'https://nextjs.org/docs/messages/blocking-route#wrap-in-or-move-into-suspense',
    snippets: [
      { text: '<Suspense fallback={…}>', highlight: true },
      { text: '  <DataChild />' },
      { text: '</Suspense>', highlight: true },
    ],
  },
  {
    id: 'prerender-known-params',
    title: 'For known params, prerender',
    group: 'cache',
    link: 'https://nextjs.org/docs/messages/blocking-route#prerender-known-params',
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
  },
  {
    id: 'allow-blocking-route',
    title: 'Allow blocking route',
    group: 'block',
    link: 'https://nextjs.org/docs/messages/blocking-route#allow-blocking-route',
    snippets: [
      { text: '// page.tsx or layout.tsx' },
      { text: 'export const instant = false', highlight: true },
    ],
  },
]

const dynamicCards: FixCard[] = [
  {
    id: 'cache-the-component-or-data',
    title: 'Cache the component or data',
    group: 'cache',
    link: 'https://nextjs.org/docs/messages/blocking-route#cache-the-component-or-data',
    snippets: [
      { text: 'async function Posts() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return <List items={…} />' },
    ],
  },
  {
    id: 'wrap-in-or-move-into-suspense',
    title: 'Wrap in or move into Suspense',
    group: 'stream',
    link: 'https://nextjs.org/docs/messages/blocking-route#wrap-in-or-move-into-suspense',
    snippets: [
      { text: '<Suspense fallback={…}>', highlight: true },
      { text: '  <DataChild />' },
      { text: '</Suspense>', highlight: true },
    ],
  },
  {
    id: 'allow-blocking-route',
    title: 'Allow blocking route',
    group: 'block',
    link: 'https://nextjs.org/docs/messages/blocking-route#allow-blocking-route',
    snippets: [
      { text: '// page.tsx or layout.tsx' },
      { text: 'export const instant = false', highlight: true },
    ],
  },
]

// ── Unrendered-segment cards ──────────────────────

const unrenderedSegmentCards: FixCard[] = [
  {
    id: 'render-the-dropped-segment',
    title: 'Render the dropped segment',
    group: 'render',
    link: 'https://nextjs.org/docs/messages/unrendered-instant-segment#render-the-dropped-segment',
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
  },
  {
    id: 'skip-validation-on-the-segment',
    title: 'Skip validation on the segment',
    group: 'ignore',
    link: 'https://nextjs.org/docs/messages/unrendered-instant-segment#skip-validation-on-the-segment',
    snippets: [
      { text: '// page.tsx or layout.tsx' },
      { text: '' },
      { text: 'export const instant = false', highlight: true },
    ],
  },
]

// ── Metadata cards ────────────────────────────────

const metadataRuntimeCards: FixCard[] = [
  {
    id: 'use-static-metadata',
    title: 'Use static metadata',
    group: 'static',
    link: 'https://nextjs.org/docs/messages/next-prerender-dynamic-metadata#use-static-metadata',
    snippets: [
      { text: 'export const metadata = {', highlight: true },
      { text: '  title: "My Page"' },
      { text: '}' },
    ],
  },
  {
    id: 'render-page-at-request-time',
    title: 'Mark the route as dynamic',
    group: 'dynamic',
    link: 'https://nextjs.org/docs/messages/next-prerender-dynamic-metadata#render-page-at-request-time',
    snippets: [
      { text: '// page.tsx or layout.tsx' },
      { text: 'await connection()', highlight: true },
    ],
  },
]

const metadataDynamicCards: FixCard[] = [
  {
    id: 'cache-the-metadata',
    title: 'Cache the metadata',
    group: 'cache',
    link: 'https://nextjs.org/docs/messages/next-prerender-dynamic-metadata#cache-the-metadata',
    snippets: [
      { text: 'async function generateMetadata() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return await cms.getMeta(…)' },
    ],
  },
  {
    id: 'render-page-at-request-time',
    title: 'Mark the route as dynamic',
    group: 'dynamic',
    link: 'https://nextjs.org/docs/messages/next-prerender-dynamic-metadata#render-page-at-request-time',
    snippets: [
      { text: '// page.tsx or layout.tsx' },
      { text: 'await connection()', highlight: true },
    ],
  },
]

// ── Viewport cards ────────────────────────────────

const viewportRuntimeCards: FixCard[] = [
  {
    id: 'use-static-viewport',
    title: 'Use static viewport',
    group: 'static',
    link: 'https://nextjs.org/docs/messages/next-prerender-dynamic-viewport#use-static-viewport',
    snippets: [
      { text: 'export const viewport = {', highlight: true },
      { text: '  themeColor: "#000"' },
      { text: '}' },
    ],
  },
  {
    id: 'allow-blocking-route',
    title: 'Allow blocking route',
    group: 'block',
    link: 'https://nextjs.org/docs/messages/next-prerender-dynamic-viewport#allow-blocking-route',
    snippets: [
      { text: '// page.tsx or layout.tsx' },
      { text: 'export const instant = false', highlight: true },
    ],
  },
]

const viewportDynamicCards: FixCard[] = [
  {
    id: 'cache-viewport-data',
    title: 'Cache the viewport data',
    group: 'cache',
    link: 'https://nextjs.org/docs/messages/next-prerender-dynamic-viewport#cache-viewport-data',
    snippets: [
      { text: 'async function generateViewport() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return await db.getViewport(…)' },
    ],
  },
  {
    id: 'allow-blocking-route',
    title: 'Allow blocking route',
    group: 'block',
    link: 'https://nextjs.org/docs/messages/next-prerender-dynamic-viewport#allow-blocking-route',
    snippets: [
      { text: '// page.tsx or layout.tsx' },
      { text: 'export const instant = false', highlight: true },
    ],
  },
]

// ── Sync IO cards (per API) ───────────────────────

const syncMathCards: FixCard[] = [
  {
    id: 'render-at-request-time',
    title: 'Generate on every request',
    group: 'dynamic',
    link: 'https://nextjs.org/docs/messages/next-prerender-random#render-at-request-time',
    snippets: [
      { text: 'await connection()', highlight: true },
      { text: 'const id = Math.random()' },
      { text: 'return <Item id={id} />' },
    ],
  },
  {
    id: 'cache-the-random-value',
    title: 'Cache the random value',
    group: 'cache',
    link: 'https://nextjs.org/docs/messages/next-prerender-random#cache-the-random-value',
    snippets: [
      { text: 'function RandomId() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return String(Math.random())' },
    ],
  },
  {
    id: 'render-on-the-client',
    title: 'Render on the client',
    group: 'client',
    link: 'https://nextjs.org/docs/messages/next-prerender-random#render-on-the-client',
    snippets: [
      { text: '"use client"', highlight: true },
      { text: '// runs in the browser' },
      { text: 'const id = Math.random()' },
    ],
  },
]

const syncDateCards: FixCard[] = [
  {
    id: 'render-at-request-time',
    title: 'Generate on every request',
    group: 'dynamic',
    link: 'https://nextjs.org/docs/messages/next-prerender-current-time#render-at-request-time',
    snippets: [
      { text: 'await connection()', highlight: true },
      { text: 'const t = Date.now()' },
      { text: 'return <Banner time={t} />' },
    ],
  },
  {
    id: 'cache-the-timestamp',
    title: 'Cache the timestamp',
    group: 'cache',
    link: 'https://nextjs.org/docs/messages/next-prerender-current-time#cache-the-timestamp',
    snippets: [
      { text: 'function Timestamp() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return <time>{Date.now()}</time>' },
    ],
  },
  {
    id: 'render-on-the-client',
    title: 'Render on the client',
    group: 'client',
    link: 'https://nextjs.org/docs/messages/next-prerender-current-time#render-on-the-client',
    snippets: [
      { text: '"use client"', highlight: true },
      { text: '// runs in the browser' },
      { text: 'const t = Date.now()' },
    ],
  },
  {
    id: 'measure-elapsed-time',
    title: 'For telemetry, use a timing API',
    group: 'measure',
    link: 'https://nextjs.org/docs/messages/next-prerender-current-time#measure-elapsed-time',
    snippets: [
      { text: 'const start = performance.now()', highlight: true },
      { text: 'doWork()' },
      { text: 'const ms = performance.now() - start' },
    ],
  },
]

const syncCryptoCards: FixCard[] = [
  {
    id: 'render-at-request-time',
    title: 'Generate on every request',
    group: 'dynamic',
    link: 'https://nextjs.org/docs/messages/next-prerender-crypto#render-at-request-time',
    snippets: [
      { text: 'await connection()', highlight: true },
      { text: 'const id = crypto.randomUUID()' },
      { text: 'return <Token id={id} />' },
    ],
  },
  {
    id: 'cache-the-generated-value',
    title: 'Cache the generated value',
    group: 'cache',
    link: 'https://nextjs.org/docs/messages/next-prerender-crypto#cache-the-generated-value',
    snippets: [
      { text: 'function TokenId() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return crypto.randomUUID()' },
    ],
  },
  {
    id: 'render-on-the-client',
    title: 'Render on the client',
    group: 'client',
    link: 'https://nextjs.org/docs/messages/next-prerender-crypto#render-on-the-client',
    snippets: [
      { text: '"use client"', highlight: true },
      { text: '// runs in the browser' },
      { text: 'const id = crypto.randomUUID()' },
    ],
  },
]

// ── Client sync IO cards (no Suspense above) ──────

const syncClientDateCards: FixCard[] = [
  {
    id: 'wrap-in-or-move-into-suspense',
    title: 'Wrap in or move into Suspense',
    group: 'stream',
    link: 'https://nextjs.org/docs/messages/next-prerender-current-time-client#wrap-in-or-move-into-suspense',
    snippets: [
      { text: '<Suspense fallback={…}>', highlight: true },
      { text: '  <DateDisplay />' },
      { text: '</Suspense>', highlight: true },
    ],
  },
  {
    id: 'move-into-effect-or-event-handler',
    title: 'Move into effect or event handler',
    group: 'defer',
    link: 'https://nextjs.org/docs/messages/next-prerender-current-time-client#move-into-effect-or-event-handler',
    snippets: [
      { text: '<button onClick={() => {', highlight: true },
      { text: '  setT(Date.now())' },
      { text: '}} />' },
    ],
  },
  {
    id: 'measure-elapsed-time',
    title: 'For telemetry, use a timing API',
    group: 'measure',
    link: 'https://nextjs.org/docs/messages/next-prerender-current-time-client#measure-elapsed-time',
    snippets: [
      { text: 'const start = performance.now()', highlight: true },
      { text: 'doWork()' },
      { text: 'const ms = performance.now() - start' },
    ],
  },
]

const syncClientMathCards: FixCard[] = [
  {
    id: 'wrap-in-or-move-into-suspense',
    title: 'Wrap in or move into Suspense',
    group: 'stream',
    link: 'https://nextjs.org/docs/messages/next-prerender-random-client#wrap-in-or-move-into-suspense',
    snippets: [
      { text: '<Suspense fallback={…}>', highlight: true },
      { text: '  <RandomId />' },
      { text: '</Suspense>', highlight: true },
    ],
  },
  {
    id: 'move-into-effect-or-event-handler',
    title: 'Move into effect or event handler',
    group: 'defer',
    link: 'https://nextjs.org/docs/messages/next-prerender-random-client#move-into-effect-or-event-handler',
    snippets: [
      { text: '<button onClick={() => {', highlight: true },
      { text: '  setId(Math.random())' },
      { text: '}} />' },
    ],
  },
]

const syncClientCryptoCards: FixCard[] = [
  {
    id: 'wrap-in-or-move-into-suspense',
    title: 'Wrap in or move into Suspense',
    group: 'stream',
    link: 'https://nextjs.org/docs/messages/next-prerender-crypto-client#wrap-in-or-move-into-suspense',
    snippets: [
      { text: '<Suspense fallback={…}>', highlight: true },
      { text: '  <TokenId />' },
      { text: '</Suspense>', highlight: true },
    ],
  },
  {
    id: 'move-into-effect-or-event-handler',
    title: 'Move into effect or event handler',
    group: 'defer',
    link: 'https://nextjs.org/docs/messages/next-prerender-crypto-client#move-into-effect-or-event-handler',
    snippets: [
      { text: '<button onClick={() => {', highlight: true },
      { text: '  setId(crypto.randomUUID())' },
      { text: '}} />' },
    ],
  },
]

// ── Card lookup ───────────────────────────────────

export type GuidanceKind =
  | 'blocking-route'
  | 'metadata'
  | 'viewport'
  | 'sync-io'
  | 'sync-io-client'
  | 'unrendered-segment'

export type GuidanceVariant = 'runtime' | 'dynamic'

export const DOCS_URLS: Record<GuidanceKind, string> = {
  'blocking-route': 'https://nextjs.org/docs/messages/blocking-route',
  metadata: 'https://nextjs.org/docs/messages/next-prerender-dynamic-metadata',
  viewport: 'https://nextjs.org/docs/messages/next-prerender-dynamic-viewport',
  'sync-io': '',
  'sync-io-client': '',
  'unrendered-segment':
    'https://nextjs.org/docs/messages/unrendered-instant-segment',
}

export const SYNC_IO_DOCS: Record<string, string> = {
  'Math.random()': 'https://nextjs.org/docs/messages/next-prerender-random',
  'Date.now()': 'https://nextjs.org/docs/messages/next-prerender-current-time',
  'Date()': 'https://nextjs.org/docs/messages/next-prerender-current-time',
  'new Date()': 'https://nextjs.org/docs/messages/next-prerender-current-time',
  'crypto.randomUUID()':
    'https://nextjs.org/docs/messages/next-prerender-crypto',
  'crypto.getRandomValues()':
    'https://nextjs.org/docs/messages/next-prerender-crypto',
  "require('node:crypto').randomUUID()":
    'https://nextjs.org/docs/messages/next-prerender-crypto',
  "require('node:crypto').randomBytes(size)":
    'https://nextjs.org/docs/messages/next-prerender-crypto',
  "require('node:crypto').randomFillSync(...)":
    'https://nextjs.org/docs/messages/next-prerender-crypto',
  "require('node:crypto').randomInt(min, max)":
    'https://nextjs.org/docs/messages/next-prerender-crypto',
  "require('node:crypto').generatePrimeSync(...)":
    'https://nextjs.org/docs/messages/next-prerender-crypto',
  "require('node:crypto').generateKeyPairSync(...)":
    'https://nextjs.org/docs/messages/next-prerender-crypto',
  "require('node:crypto').generateKeySync(...)":
    'https://nextjs.org/docs/messages/next-prerender-crypto',
}

export const SYNC_IO_CLIENT_DOCS: Record<string, string> = {
  'Math.random()':
    'https://nextjs.org/docs/messages/next-prerender-random-client',
  'Date.now()':
    'https://nextjs.org/docs/messages/next-prerender-current-time-client',
  'Date()':
    'https://nextjs.org/docs/messages/next-prerender-current-time-client',
  'new Date()':
    'https://nextjs.org/docs/messages/next-prerender-current-time-client',
  'crypto.randomUUID()':
    'https://nextjs.org/docs/messages/next-prerender-crypto-client',
  'crypto.getRandomValues()':
    'https://nextjs.org/docs/messages/next-prerender-crypto-client',
  "require('node:crypto').randomUUID()":
    'https://nextjs.org/docs/messages/next-prerender-crypto-client',
  "require('node:crypto').randomBytes(size)":
    'https://nextjs.org/docs/messages/next-prerender-crypto-client',
  "require('node:crypto').randomFillSync(...)":
    'https://nextjs.org/docs/messages/next-prerender-crypto-client',
  "require('node:crypto').randomInt(min, max)":
    'https://nextjs.org/docs/messages/next-prerender-crypto-client',
  "require('node:crypto').generatePrimeSync(...)":
    'https://nextjs.org/docs/messages/next-prerender-crypto-client',
  "require('node:crypto').generateKeyPairSync(...)":
    'https://nextjs.org/docs/messages/next-prerender-crypto-client',
  "require('node:crypto').generateKeySync(...)":
    'https://nextjs.org/docs/messages/next-prerender-crypto-client',
}

export const EXPLANATIONS: Record<GuidanceKind, string> = {
  'blocking-route':
    'This prevents the route from being prerendered, blocking navigation and leading to a slower user experience.',
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

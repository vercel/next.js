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
  | 'upgrade'
  | 'disable'

export type FixCardIcon =
  | 'align-left'
  | 'arrow-up'
  | 'database'
  | 'history'
  | 'layout'
  | 'loading'
  | 'minus'
  | 'minus-circle'
  | 'pointer-click'
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
  upgrade: { label: 'Upgrade', color: 'amber', icon: 'arrow-up' },
  disable: { label: 'Disable', color: 'gray', icon: 'minus' },
}

export type FixCard = {
  /** Stable docs-anchor id for this fix card. */
  id: string
  title: string
  group: FixCardGroup
  /** Docs URL the card links to, or `null` for no link. */
  link: string | null
  snippets: Snippet[]
  /** Whether to render the "Copy AI prompt" button on this card. */
  copyable?: boolean
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
    copyable: true,
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
    copyable: true,
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
  copyable: true,
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
  copyable: true,
}

const clientHookCards: FixCard[] = [clientHookSuspenseCard, clientHookBlockCard]

const dynamicCards: FixCard[] = [
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
    copyable: true,
  },
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
    copyable: true,
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
    copyable: true,
  },
]

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
    copyable: true,
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
    copyable: true,
  },
]

const linkPrefetchPartialCards: FixCard[] = [
  {
    id: 'opt-into-partial-prefetching',
    title: 'Opt into Partial Prefetching',
    group: 'upgrade',
    link: 'https://nextjs.org/docs/messages/instant-link-prefetch-partial#opt-into-partial-prefetching',
    snippets: [
      { text: '// page.tsx or layout.tsx' },
      { text: "export const prefetch = 'partial'", highlight: true },
    ],
    copyable: true,
  },
  {
    id: 'use-the-default-prefetch',
    title: 'Use the default prefetch',
    group: 'disable',
    link: 'https://nextjs.org/docs/messages/instant-link-prefetch-partial#use-the-default-prefetch',
    snippets: [
      { text: '<Link href="/dashboard">', highlight: true },
      { text: '  Dashboard' },
      { text: '</Link>' },
    ],
    copyable: true,
  },
  {
    id: 'disable-validation-on-this-route',
    title: 'Disable validation on this route',
    group: 'ignore',
    link: 'https://nextjs.org/docs/messages/instant-link-prefetch-partial#disable-validation-on-this-route',
    snippets: [
      { text: '// page.tsx or layout.tsx' },
      { text: 'export const instant = false', highlight: true },
    ],
    copyable: true,
  },
]

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
    copyable: true,
  },
  {
    id: 'mark-the-route-as-dynamic',
    title: 'Mark the route as dynamic',
    group: 'dynamic',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime#mark-the-route-as-dynamic',
    snippets: [
      { text: '// page.tsx or layout.tsx' },
      { text: 'await connection()', highlight: true },
    ],
    copyable: true,
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
    copyable: true,
  },
  {
    id: 'mark-the-route-as-dynamic',
    title: 'Mark the route as dynamic',
    group: 'dynamic',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#mark-the-route-as-dynamic',
    snippets: [
      { text: '// page.tsx or layout.tsx' },
      { text: 'await connection()', highlight: true },
    ],
    copyable: true,
  },
]

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
    copyable: true,
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
    copyable: true,
  },
]

const viewportDynamicCards: FixCard[] = [
  {
    id: 'cache-the-viewport-data',
    title: 'Cache the viewport data',
    group: 'cache',
    link: 'https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic#cache-the-viewport-data',
    snippets: [
      { text: 'async function generateViewport() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return await db.getViewport(…)' },
    ],
    copyable: true,
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
    copyable: true,
  },
]

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
    copyable: true,
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
    copyable: true,
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
    copyable: true,
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
    copyable: true,
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
    copyable: true,
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
    copyable: true,
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
    copyable: true,
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
    copyable: true,
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
    copyable: true,
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
    copyable: true,
  },
]

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
    copyable: true,
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
    copyable: true,
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
    copyable: true,
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
    copyable: true,
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
    copyable: true,
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
    copyable: true,
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
    copyable: true,
  },
]

export type GuidanceKind =
  | 'blocking-route'
  | 'client-hook'
  | 'metadata'
  | 'viewport'
  | 'sync-io'
  | 'sync-io-client'
  | 'unrendered-segment'
  | 'link-prefetch-partial'

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
  'link-prefetch-partial':
    'https://nextjs.org/docs/messages/instant-link-prefetch-partial',
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
  'link-prefetch-partial':
    'This will lead to slower, more expensive prefetches.',
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

// `connection()`-triggered errors can't be cached.
function filterCacheForConnection(
  cards: FixCard[],
  variant: GuidanceVariant,
  cause: string | undefined
): FixCard[] {
  if (variant !== 'dynamic' || cause !== 'connection') return cards
  return cards.filter((card) => card.group !== 'cache')
}

export function getCards(
  kind: GuidanceKind,
  variant: GuidanceVariant,
  cause?: string
): FixCard[] {
  switch (kind) {
    case 'blocking-route':
      return variant === 'dynamic'
        ? filterCacheForConnection(dynamicCards, variant, cause)
        : runtimeCards
    case 'client-hook':
      return clientHookCards
    case 'metadata':
      return variant === 'runtime'
        ? metadataRuntimeCards
        : filterCacheForConnection(metadataDynamicCards, variant, cause)
    case 'viewport':
      return variant === 'runtime'
        ? viewportRuntimeCards
        : filterCacheForConnection(viewportDynamicCards, variant, cause)
    case 'sync-io':
      return (cause && syncCardsByCause[cause]) || []
    case 'sync-io-client':
      return (cause && syncClientCardsByCause[cause]) || []
    case 'unrendered-segment':
      return unrenderedSegmentCards
    case 'link-prefetch-partial':
      return linkPrefetchPartialCards
    default:
      return kind satisfies never
  }
}

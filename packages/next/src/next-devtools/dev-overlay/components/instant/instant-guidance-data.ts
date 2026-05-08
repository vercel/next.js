export type CardColor = 'blue' | 'purple' | 'red' | 'amber' | 'teal'

export type FixCard = {
  title: string
  color: CardColor
  snippets: Snippet[]
  conditional?: boolean
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
    title: 'Provide a placeholder with Suspense',
    color: 'purple',
    snippets: [
      { text: '<Suspense fallback={…}>', highlight: true },
      { text: '  <DataChild />' },
      { text: '</Suspense>', highlight: true },
    ],
  },
  {
    title: 'Make route params static',
    color: 'blue',
    conditional: true,
    snippets: [
      { text: 'export async function' },
      {
        text: '  generateStaticParams() {',
        parts: [
          { text: '  ' },
          { text: 'generateStaticParams()', highlight: true },
          { text: ' {' },
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
    title: 'Allow blocking route',
    color: 'red',
    snippets: [
      { text: 'export const instant = false', highlight: true },
      { text: '' },
      { text: 'export default async function Page() {' },
    ],
  },
]

const dynamicCards: FixCard[] = [
  {
    title: 'Prerender and cache',
    color: 'blue',
    snippets: [
      { text: 'async function getData() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return db.query(…)' },
      { text: '}' },
    ],
  },
  {
    title: 'Provide a placeholder with Suspense',
    color: 'purple',
    snippets: [
      { text: '<Suspense fallback={…}>', highlight: true },
      { text: '  <DataChild />' },
      { text: '</Suspense>', highlight: true },
    ],
  },
  {
    title: 'Allow blocking route',
    color: 'red',
    snippets: [
      { text: 'export const instant = false', highlight: true },
      { text: '' },
      { text: 'export default async function Page() {' },
    ],
  },
]

// ── Metadata cards ────────────────────────────────

const metadataRuntimeCards: FixCard[] = [
  {
    title: 'Use static metadata',
    color: 'blue',
    snippets: [
      { text: 'export const metadata = {' },
      { text: '  title: "My Page"', highlight: true },
      { text: '}' },
    ],
  },
  {
    title: 'Render page at request time',
    color: 'purple',
    snippets: [
      { text: 'export default async function Page() {' },
      { text: '  await connection()', highlight: true },
      { text: '  return …' },
      { text: '}' },
    ],
  },
]

const metadataDynamicCards: FixCard[] = [
  {
    title: 'Prerender and cache',
    color: 'blue',
    snippets: [
      { text: 'async function generateMetadata() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return await cms.getPageMeta(…)' },
      { text: '}' },
    ],
  },
  {
    title: 'Render page at request time',
    color: 'purple',
    snippets: [
      { text: 'export default async function Page() {' },
      { text: '  await connection()', highlight: true },
      { text: '  return …' },
      { text: '}' },
    ],
  },
]

// ── Viewport cards ────────────────────────────────

const viewportRuntimeCards: FixCard[] = [
  {
    title: 'Use static viewport',
    color: 'blue',
    snippets: [
      { text: 'export const viewport = {' },
      { text: '  themeColor: "#000"', highlight: true },
      { text: '}' },
    ],
  },
  {
    title: 'Wrap body in Suspense',
    color: 'purple',
    snippets: [
      { text: '<Suspense>', highlight: true },
      { text: '  <body>{children}</body>' },
      { text: '</Suspense>', highlight: true },
    ],
  },
  {
    title: 'Allow blocking route',
    color: 'red',
    snippets: [
      { text: 'export const instant = false', highlight: true },
      { text: '' },
      { text: 'export default async function Page() {' },
    ],
  },
]

const viewportDynamicCards: FixCard[] = [
  {
    title: 'Prerender and cache',
    color: 'blue',
    snippets: [
      { text: 'async function generateViewport() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return await db.getViewport(…)' },
      { text: '}' },
    ],
  },
  {
    title: 'Wrap body in Suspense',
    color: 'purple',
    snippets: [
      { text: '<Suspense>', highlight: true },
      { text: '  <body>{children}</body>' },
      { text: '</Suspense>', highlight: true },
    ],
  },
  {
    title: 'Allow blocking route',
    color: 'red',
    snippets: [
      { text: 'export const instant = false', highlight: true },
      { text: '' },
      { text: 'export default async function Page() {' },
    ],
  },
]

// ── Sync IO cards (per API) ───────────────────────

const syncMathCards: FixCard[] = [
  {
    title: 'Render at request time',
    color: 'purple',
    snippets: [
      { text: 'await connection()', highlight: true },
      { text: 'const id = Math.random()' },
      { text: 'return <Item id={id} />' },
    ],
  },
  {
    title: 'Prerender and cache',
    color: 'blue',
    snippets: [
      { text: 'async function RandomId() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return String(Math.random())' },
      { text: '}' },
    ],
  },
  {
    title: 'Render on the client',
    color: 'amber',
    snippets: [
      { text: '"use client"', highlight: true },
      { text: 'export function RandomId() {' },
      { text: '  return String(Math.random())' },
      { text: '}' },
    ],
  },
]

const syncDateCards: FixCard[] = [
  {
    title: 'Render at request time',
    color: 'purple',
    snippets: [
      { text: 'await connection()', highlight: true },
      { text: 'const t = Date.now()' },
      { text: 'return <Banner time={t} />' },
    ],
  },
  {
    title: 'Prerender and cache',
    color: 'blue',
    snippets: [
      { text: 'async function Timestamp() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return <time>{Date.now()}</time>' },
      { text: '}' },
    ],
  },
  {
    title: 'Render on the client',
    color: 'amber',
    snippets: [
      { text: '"use client"', highlight: true },
      { text: 'export function RelativeTime() {' },
      { text: '  return timeAgo(Date.now())' },
      { text: '}' },
    ],
  },
  {
    title: 'Measure elapsed time',
    color: 'teal',
    conditional: true,
    snippets: [
      { text: 'const start = performance.now()', highlight: true },
      { text: 'doWork()' },
      { text: 'const ms = performance.now() - start' },
    ],
  },
]

const syncCryptoCards: FixCard[] = [
  {
    title: 'Render at request time',
    color: 'purple',
    snippets: [
      { text: 'await connection()', highlight: true },
      { text: 'const id = crypto.randomUUID()' },
      { text: 'return <Token id={id} />' },
    ],
  },
  {
    title: 'Prerender and cache',
    color: 'blue',
    snippets: [
      { text: 'async function TokenId() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return crypto.randomUUID()' },
      { text: '}' },
    ],
  },
  {
    title: 'Render on the client',
    color: 'amber',
    snippets: [
      { text: '"use client"', highlight: true },
      { text: 'export function TokenId() {' },
      { text: '  return crypto.randomUUID()' },
      { text: '}' },
    ],
  },
]

// ── Client sync IO cards (no Suspense above) ──────

const syncClientDateCards: FixCard[] = [
  {
    title: 'Wrap in Suspense',
    color: 'purple',
    snippets: [
      { text: '<Suspense fallback={…}>', highlight: true },
      { text: '  <DateDisplay />' },
      { text: '</Suspense>', highlight: true },
    ],
  },
  {
    title: 'Move into effect or event handler',
    color: 'amber',
    snippets: [
      { text: 'useEffect(() => {', highlight: true },
      { text: '  setT(Date.now())' },
      { text: '}, [])' },
    ],
  },
]

const syncClientMathCards: FixCard[] = [
  {
    title: 'Wrap in Suspense',
    color: 'purple',
    snippets: [
      { text: '<Suspense fallback={…}>', highlight: true },
      { text: '  <RandomId />' },
      { text: '</Suspense>', highlight: true },
    ],
  },
  {
    title: 'Move into effect or event handler',
    color: 'amber',
    snippets: [
      { text: 'useEffect(() => {', highlight: true },
      { text: '  setId(String(Math.random()))' },
      { text: '}, [])' },
    ],
  },
]

const syncClientCryptoCards: FixCard[] = [
  {
    title: 'Wrap in Suspense',
    color: 'purple',
    snippets: [
      { text: '<Suspense fallback={…}>', highlight: true },
      { text: '  <TokenId />' },
      { text: '</Suspense>', highlight: true },
    ],
  },
  {
    title: 'Move into effect or event handler',
    color: 'amber',
    snippets: [
      { text: 'useEffect(() => {', highlight: true },
      { text: '  setId(crypto.randomUUID())' },
      { text: '}, [])' },
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

export type GuidanceVariant = 'runtime' | 'navigation'

export const DOCS_URLS: Record<GuidanceKind, string> = {
  'blocking-route': 'https://nextjs.org/docs/messages/blocking-route',
  metadata: 'https://nextjs.org/docs/messages/next-prerender-dynamic-metadata',
  viewport: 'https://nextjs.org/docs/messages/next-prerender-dynamic-viewport',
  'sync-io': '',
  'sync-io-client': '',
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
}

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
      return variant === 'navigation' ? dynamicCards : runtimeCards
    case 'metadata':
      return variant === 'runtime' ? metadataRuntimeCards : metadataDynamicCards
    case 'viewport':
      return variant === 'runtime' ? viewportRuntimeCards : viewportDynamicCards
    case 'sync-io':
      return (cause && syncCardsByCause[cause]) || syncMathCards
    case 'sync-io-client':
      return (cause && syncClientCardsByCause[cause]) || syncClientMathCards
    default:
      return kind satisfies never
  }
}

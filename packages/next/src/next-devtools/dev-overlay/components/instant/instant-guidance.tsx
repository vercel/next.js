import { css } from '../../utils/css'

type CardColor = 'blue' | 'purple' | 'red' | 'amber'

type FixCard = {
  title: string
  color: CardColor
  snippets: Snippet[]
  conditional?: boolean
}

type Snippet = {
  text: string
  highlight?: boolean
}

// ── Blocking-route cards ──────────────────────────

const runtimeCards: FixCard[] = [
  {
    title: 'Move within Suspense',
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
      { text: '  generateStaticParams() {', highlight: true },
      { text: '  return [{ slug: "…" }]' },
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
    title: 'Cache dynamic data',
    color: 'blue',
    snippets: [
      { text: 'async function getData() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return db.query(…)' },
      { text: '}' },
    ],
  },
  {
    title: 'Move within Suspense',
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
    title: 'Allow dynamic page',
    color: 'purple',
    snippets: [
      { text: '// page.tsx' },
      { text: 'async function DynamicMarker() {' },
      { text: '  await connection()', highlight: true },
      { text: '}' },
    ],
  },
]

const metadataDynamicCards: FixCard[] = [
  {
    title: 'Cache the metadata',
    color: 'blue',
    snippets: [
      { text: 'async function generateMetadata() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return await cms.getPageMeta(…)' },
      { text: '}' },
    ],
  },
  {
    title: 'Allow dynamic page',
    color: 'purple',
    snippets: [
      { text: '// page.tsx' },
      { text: 'async function DynamicMarker() {' },
      { text: '  await connection()', highlight: true },
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
]

const viewportDynamicCards: FixCard[] = [
  {
    title: 'Cache viewport data',
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
]

// ── Sync IO cards (per API) ───────────────────────

const syncMathCards: FixCard[] = [
  {
    title: 'Render dynamically',
    color: 'purple',
    snippets: [
      { text: 'await connection()', highlight: true },
      { text: 'const id = Math.random()' },
      { text: 'return <Item id={id} />' },
    ],
  },
  {
    title: 'Render on client',
    color: 'amber',
    snippets: [
      { text: '"use client"', highlight: true },
      { text: 'export function RandomId() {' },
      { text: '  return String(Math.random())' },
      { text: '}' },
    ],
  },
  {
    title: 'Cache the result',
    color: 'blue',
    snippets: [
      { text: 'async function RandomId() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return String(Math.random())' },
      { text: '}' },
    ],
  },
]

const syncDateCards: FixCard[] = [
  {
    title: 'Render dynamically',
    color: 'purple',
    snippets: [
      { text: 'await connection()', highlight: true },
      { text: 'const t = Date.now()' },
      { text: 'return <Banner time={t} />' },
    ],
  },
  {
    title: 'Render on client',
    color: 'amber',
    snippets: [
      { text: '"use client"', highlight: true },
      { text: 'export function RelativeTime() {' },
      { text: '  return timeAgo(Date.now())' },
      { text: '}' },
    ],
  },
  {
    title: 'Cache the result',
    color: 'blue',
    snippets: [
      { text: 'async function Timestamp() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return <time>{Date.now()}</time>' },
      { text: '}' },
    ],
  },
]

const syncCryptoCards: FixCard[] = [
  {
    title: 'Render dynamically',
    color: 'purple',
    snippets: [
      { text: 'await connection()', highlight: true },
      { text: 'const id = crypto.randomUUID()' },
      { text: 'return <Token id={id} />' },
    ],
  },
  {
    title: 'Render on client',
    color: 'amber',
    snippets: [
      { text: '"use client"', highlight: true },
      { text: 'export function TokenId() {' },
      { text: '  return crypto.randomUUID()' },
      { text: '}' },
    ],
  },
  {
    title: 'Cache the result',
    color: 'blue',
    snippets: [
      { text: 'async function TokenId() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return crypto.randomUUID()' },
      { text: '}' },
    ],
  },
]

// ── Card lookup ───────────────────────────────────

export type GuidanceKind =
  | 'blocking-route'
  | 'metadata'
  | 'viewport'
  | 'sync-io'

export type GuidanceVariant = 'runtime' | 'navigation'

const DOCS_URLS: Record<GuidanceKind, string> = {
  'blocking-route': 'https://nextjs.org/docs/messages/blocking-route',
  metadata: 'https://nextjs.org/docs/messages/next-prerender-dynamic-metadata',
  viewport: 'https://nextjs.org/docs/messages/next-prerender-dynamic-viewport',
  'sync-io': '',
}

const SYNC_IO_DOCS: Record<string, string> = {
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

const EXPLANATIONS: Record<GuidanceKind, string> = {
  'blocking-route':
    'This prevents the route from being prerendered, blocking navigation and leading to a slower user experience.',
  metadata:
    'This prevents the page from being prerendered, leading to a slower user experience.',
  viewport:
    'This prevents the page from being prerendered, leading to a slower user experience.',
  'sync-io': '',
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

function getCards(
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
    default:
      return runtimeCards
  }
}

// ── Components ────────────────────────────────────

function CardGrid({ cards }: { cards: FixCard[] }) {
  return (
    <div data-nextjs-card-grid>
      {cards.map((card) => (
        <div
          data-nextjs-fix-card
          data-card-color={card.color}
          data-card-conditional={card.conditional || undefined}
          key={card.title}
        >
          <pre data-nextjs-fix-snippet>
            {card.snippets.map((s, i) => (
              <span
                key={i}
                data-snippet-line
                data-snippet-highlight={s.highlight || undefined}
              >
                {s.text}
                {'\n'}
              </span>
            ))}
          </pre>
          <span data-nextjs-fix-card-title>{card.title}</span>
        </div>
      ))}
    </div>
  )
}

export function InstantGuidance({
  variant,
  kind = 'blocking-route',
  explanation,
  cause,
}: {
  variant: GuidanceVariant
  kind?: GuidanceKind
  explanation?: string
  cause?: string
}) {
  const cards = getCards(kind, variant, cause)
  const docsUrl =
    kind === 'sync-io' && cause
      ? SYNC_IO_DOCS[cause] || DOCS_URLS[kind]
      : DOCS_URLS[kind]
  const defaultExplanation = explanation || EXPLANATIONS[kind]

  return (
    <div data-nextjs-instant-guidance>
      <p data-nextjs-instant-explanation>
        {defaultExplanation ? <>{defaultExplanation} </> : null}
        <a href={docsUrl} target="_blank" rel="noopener noreferrer">
          Learn more
        </a>
      </p>

      <p data-nextjs-instant-fix-heading>Ways to fix this:</p>

      <CardGrid cards={cards} />
    </div>
  )
}

export const INSTANT_GUIDANCE_STYLES = css`
  [data-nextjs-instant-guidance] {
    margin-top: 16px;
    padding: 0 16px 16px;
  }

  [data-nextjs-instant-explanation] {
    font-size: var(--size-14);
    line-height: var(--size-20);
    color: var(--color-gray-900);
    margin: 0 0 16px;
  }

  [data-nextjs-instant-explanation] a {
    color: var(--color-blue-900);
    text-decoration: none;
  }

  [data-nextjs-instant-explanation] a:hover {
    text-decoration: underline;
  }

  [data-nextjs-instant-fix-heading] {
    font-size: var(--size-14);
    font-weight: 400;
    color: var(--color-gray-900);
    margin: 0 0 20px;
    padding-top: 16px;
    border-top: 1px solid var(--color-gray-alpha-400);
  }

  /* ── Grid ───────────────────────────────────── */
  [data-nextjs-card-grid] {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 12px;
  }

  /* ── Card ─────────────────────────────────────── */
  [data-nextjs-fix-card] {
    min-width: 0;
    overflow: hidden;
  }

  [data-nextjs-fix-card-title] {
    display: block;
    margin-top: 10px;
    font-size: var(--size-13);
    color: var(--color-gray-900);
    text-align: center;
  }

  [data-card-conditional] [data-nextjs-fix-snippet] {
    border-style: dashed;
  }

  /* ── Snippet ──────────────────────────────────── */
  [data-nextjs-fix-snippet] {
    font-family: var(--font-stack-monospace);
    font-size: 11.5px;
    line-height: 1.6;
    margin: 0;
    padding: 14px;
    white-space: pre;
    overflow: hidden;
    background: var(--color-background-200);
    border: 1px solid var(--color-gray-alpha-400);
    border-radius: var(--rounded-lg);
    height: 100px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: left;
  }

  /* ── Card colors (border + highlight text only) ── */
  [data-card-color='blue'] [data-nextjs-fix-snippet] {
    border-color: var(--color-instant-border-blue);
  }

  [data-card-color='purple'] [data-nextjs-fix-snippet] {
    border-color: var(--color-instant-border-purple);
  }

  [data-card-color='red'] [data-nextjs-fix-snippet] {
    border-color: var(--color-instant-border-red);
  }

  [data-card-color='amber'] [data-nextjs-fix-snippet] {
    border-color: var(--color-instant-border-amber);
  }

  [data-snippet-line] {
    display: block;
    color: var(--color-gray-800);
  }

  [data-snippet-line][data-snippet-highlight] {
    color: var(--color-gray-1000);
    font-weight: 500;
  }

  [data-card-color='blue'] [data-snippet-line][data-snippet-highlight] {
    color: var(--color-blue-800);
  }

  [data-card-color='purple'] [data-snippet-line][data-snippet-highlight] {
    color: var(--color-instant-text-purple);
  }

  [data-card-color='red'] [data-snippet-line][data-snippet-highlight] {
    color: var(--color-red-800);
  }

  [data-card-color='amber'] [data-snippet-line][data-snippet-highlight] {
    color: var(--color-instant-text-amber);
  }
`

import { css } from '../../utils/css'

const DOCS = 'https://nextjs.org/docs/messages/blocking-route'

type CardColor = 'blue' | 'purple' | 'red'

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
}: {
  variant: 'runtime' | 'navigation'
}) {
  const cards = variant === 'navigation' ? dynamicCards : runtimeCards

  return (
    <div data-nextjs-instant-guidance>
      <p data-nextjs-instant-explanation>
        This blocks navigation, leading to a slower user experience.{' '}
        <a href={DOCS} target="_blank" rel="noopener noreferrer">
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
`

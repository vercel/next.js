import { useRef, useState } from 'react'
import { css } from '../../utils/css'

const DOCS = 'https://nextjs.org/docs/messages/blocking-route'

type CardColor = 'blue' | 'purple' | 'amber' | 'red' | 'gray'

type FixCard = {
  title: string
  color: CardColor
  snippets: Snippet[]
}

type Snippet = {
  text: string
  highlight?: boolean
}

const runtimeCards: FixCard[] = [
  {
    title: 'Move into Suspense',
    color: 'purple',
    snippets: [
      { text: '<Suspense>' },
      { text: '  <DataChild />', highlight: true },
      { text: '</Suspense>' },
    ],
  },
  {
    title: 'Wrap in Suspense',
    color: 'purple',
    snippets: [
      { text: '<Suspense fallback={…}>', highlight: true },
      { text: '  <Component />' },
      { text: '</Suspense>', highlight: true },
    ],
  },
  {
    title: 'Make route params static',
    color: 'blue',
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
    title: 'Move into Suspense',
    color: 'purple',
    snippets: [
      { text: '<Suspense>' },
      { text: '  <DataChild />', highlight: true },
      { text: '</Suspense>' },
    ],
  },
  {
    title: 'Wrap in Suspense',
    color: 'purple',
    snippets: [
      { text: '<Suspense fallback={…}>', highlight: true },
      { text: '  <Component />' },
      { text: '</Suspense>', highlight: true },
    ],
  },
  {
    title: 'Make route params static',
    color: 'blue',
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

const VISIBLE_CARDS = 3

function CardGallery({ cards }: { cards: FixCard[] }) {
  const [activePage, setActivePage] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const pageCount = Math.max(1, cards.length - VISIBLE_CARDS + 1)

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el || pageCount <= 1) return
    const maxScroll = el.scrollWidth - el.clientWidth
    if (maxScroll <= 0) return
    const progress = el.scrollLeft / maxScroll
    setActivePage(Math.round(progress * (pageCount - 1)))
  }

  return (
    <div data-nextjs-card-gallery>
      <div data-nextjs-card-gallery-row ref={scrollRef} onScroll={handleScroll}>
        {cards.map((card) => (
          <div
            data-nextjs-fix-card
            data-card-color={card.color}
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

      {pageCount > 1 && (
        <div data-nextjs-card-gallery-dots>
          {Array.from({ length: pageCount }, (_, i) => (
            <span
              key={i}
              data-nextjs-gallery-dot
              data-active={i === activePage || undefined}
            />
          ))}
        </div>
      )}
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
        This prevents Next.js from prerendering this page.{' '}
        <a href={DOCS} target="_blank" rel="noopener noreferrer">
          Learn more
        </a>
      </p>

      <p data-nextjs-instant-fix-heading>To fix this:</p>

      <CardGallery cards={cards} />
    </div>
  )
}

export const INSTANT_GUIDANCE_STYLES = css`
  [data-nextjs-instant-guidance] {
    margin-top: 16px;
    padding: 0 16px;
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

  /* ── Gallery ──────────────────────────────────── */
  [data-nextjs-card-gallery-row] {
    display: flex;
    gap: 12px;
    align-items: stretch;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    padding: 0 2px;
  }

  [data-nextjs-card-gallery-row]::-webkit-scrollbar {
    display: none;
  }

  /* ── Card ─────────────────────────────────────── */
  [data-nextjs-fix-card] {
    flex: 1 0 30%;
    scroll-snap-align: start;
  }

  [data-nextjs-fix-card-title] {
    display: block;
    margin-top: 10px;
    font-size: var(--size-13);
    color: var(--color-gray-900);
    text-align: center;
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
    border-color: var(--color-blue-400);
  }

  [data-card-color='purple'] [data-nextjs-fix-snippet] {
    border-color: rgba(130, 80, 220, 0.25);
  }

  @media (prefers-color-scheme: dark) {
    [data-card-color='purple'] [data-nextjs-fix-snippet] {
      border-color: rgba(130, 80, 220, 0.5);
    }
  }

  [data-card-color='amber'] [data-nextjs-fix-snippet] {
    border-color: var(--color-amber-400);
  }

  [data-card-color='red'] [data-nextjs-fix-snippet] {
    border-color: var(--color-red-400);
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
    color: rgb(130, 80, 220);
  }

  [data-card-color='amber'] [data-snippet-line][data-snippet-highlight] {
    color: var(--color-amber-900);
  }

  [data-card-color='red'] [data-snippet-line][data-snippet-highlight] {
    color: var(--color-red-800);
  }

  /* ── Dots ─────────────────────────────────────── */
  [data-nextjs-card-gallery-dots] {
    display: flex;
    justify-content: center;
    gap: 6px;
    margin-top: 14px;
  }

  [data-nextjs-gallery-dot] {
    width: 7px;
    height: 7px;
    border-radius: 4px;
    border: none;
    padding: 0;
    background: var(--color-gray-alpha-400);
    transition:
      width 200ms ease,
      background 200ms ease;
  }

  [data-nextjs-gallery-dot][data-active] {
    width: 18px;
    background: var(--color-blue-900);
  }
`

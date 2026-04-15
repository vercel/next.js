import { useEffect, useRef, useState } from 'react'
import { css } from '../../utils/css'

const DOCS = 'https://nextjs.org/docs/messages/blocking-route'

type FixCard = {
  title: string
  snippets: Snippet[]
}

type Snippet = {
  text: string
  highlight?: boolean
}

const runtimeCards: FixCard[] = [
  {
    title: 'Move into Suspense',
    snippets: [
      { text: '<Suspense>' },
      { text: '  <DataChild />', highlight: true },
      { text: '</Suspense>' },
    ],
  },
  {
    title: 'Wrap in Suspense',
    snippets: [
      { text: '<Suspense fallback={…}>', highlight: true },
      { text: '  <Component />' },
      { text: '</Suspense>', highlight: true },
    ],
  },
  {
    title: 'Allow blocking route',
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
    snippets: [
      { text: 'async function getData() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return db.query(…)' },
      { text: '}' },
    ],
  },
  {
    title: 'Move into Suspense',
    snippets: [
      { text: '<Suspense>' },
      { text: '  <DataChild />', highlight: true },
      { text: '</Suspense>' },
    ],
  },
  {
    title: 'Wrap in Suspense',
    snippets: [
      { text: '<Suspense fallback={…}>', highlight: true },
      { text: '  <Component />' },
      { text: '</Suspense>', highlight: true },
    ],
  },
  {
    title: 'Allow blocking route',
    snippets: [
      { text: 'export const instant = false', highlight: true },
      { text: '' },
      { text: 'export default async function Page() {' },
    ],
  },
]

function CardGallery({ cards }: { cards: FixCard[] }) {
  const [activePage, setActivePage] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const update = () => {
      const children = Array.from(el.children) as HTMLElement[]
      if (children.length === 0) return

      const cardWidth = children[0].offsetWidth
      const gap =
        children.length > 1
          ? children[1].offsetLeft - children[0].offsetLeft - cardWidth
          : 0
      const visibleCount = Math.max(
        1,
        Math.floor((el.clientWidth + gap) / (cardWidth + gap))
      )
      const pages = Math.max(1, children.length - visibleCount + 1)
      setPageCount(pages)

      const maxScroll = el.scrollWidth - el.clientWidth
      if (maxScroll <= 0) {
        setActivePage(0)
      } else {
        const progress = el.scrollLeft / maxScroll
        setActivePage(Math.round(progress * (pages - 1)))
      }
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    el.addEventListener('scroll', update, { passive: true })
    return () => {
      observer.disconnect()
      el.removeEventListener('scroll', update)
    }
  }, [])

  const scrollToPage = (page: number) => {
    const el = scrollRef.current
    if (!el) return
    const children = Array.from(el.children) as HTMLElement[]
    if (children.length === 0) return

    const cardWidth = children[0].offsetWidth
    const gap =
      children.length > 1
        ? children[1].offsetLeft - children[0].offsetLeft - cardWidth
        : 0
    el.scrollTo({
      left: page * (cardWidth + gap),
      behavior: 'smooth',
    })
  }

  return (
    <div data-nextjs-card-gallery>
      <div data-nextjs-card-gallery-row ref={scrollRef}>
        {cards.map((card) => (
          <div data-nextjs-fix-card key={card.title}>
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
            <button
              key={i}
              data-nextjs-gallery-dot
              data-active={i === activePage || undefined}
              onClick={() => scrollToPage(i)}
              aria-label={`Page ${i + 1}`}
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

      <p data-nextjs-instant-guide-link>
        A guide on Instant Navigations is coming soon.
      </p>
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

  [data-snippet-line] {
    display: block;
    color: var(--color-gray-800);
  }

  [data-snippet-line][data-snippet-highlight] {
    color: var(--color-green-900);
    font-weight: 500;
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
    cursor: pointer;
    transition:
      width 200ms ease,
      background 200ms ease;
  }

  [data-nextjs-gallery-dot][data-active] {
    width: 18px;
    background: var(--color-blue-900);
  }

  /* ── Guide link ───────────────────────────────── */
  [data-nextjs-instant-guide-link] {
    margin-top: 24px;
    font-size: var(--size-13);
    line-height: var(--size-20);
    color: var(--color-gray-700);
  }
`

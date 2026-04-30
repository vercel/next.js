import { css } from '../../utils/css'
import {
  DOCS_URLS,
  EXPLANATIONS,
  SYNC_IO_DOCS,
  SYNC_IO_CLIENT_DOCS,
  getCards,
  type FixCard,
  type GuidanceKind,
  type GuidanceVariant,
} from './instant-guidance-data'

export type { GuidanceKind, GuidanceVariant } from './instant-guidance-data'

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
                data-snippet-highlight={
                  !s.parts && s.highlight ? '' : undefined
                }
              >
                {s.parts
                  ? s.parts.map((p, j) => (
                      <span
                        key={j}
                        data-snippet-highlight={p.highlight ? '' : undefined}
                      >
                        {p.text}
                      </span>
                    ))
                  : s.text}
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
  let docsUrl: string
  if (kind === 'sync-io' && cause) {
    docsUrl = SYNC_IO_DOCS[cause] || DOCS_URLS[kind]
  } else if (kind === 'sync-io-client' && cause) {
    docsUrl = SYNC_IO_CLIENT_DOCS[cause] || DOCS_URLS[kind]
  } else {
    docsUrl = DOCS_URLS[kind]
  }
  const defaultExplanation = explanation || EXPLANATIONS[kind]

  return (
    <div data-nextjs-instant-guidance>
      {defaultExplanation || docsUrl ? (
        <p data-nextjs-instant-explanation>
          {defaultExplanation ? <>{defaultExplanation} </> : null}
          {docsUrl ? (
            <a href={docsUrl} target="_blank" rel="noopener noreferrer">
              Learn more
            </a>
          ) : null}
        </p>
      ) : null}

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

  [data-card-color='teal'] [data-nextjs-fix-snippet] {
    border-color: var(--color-instant-border-teal);
  }

  [data-snippet-line] {
    display: block;
    color: var(--color-gray-800);
  }

  [data-nextjs-fix-snippet] [data-snippet-highlight] {
    color: var(--color-gray-1000);
    font-weight: 500;
  }

  [data-card-color='blue'] [data-nextjs-fix-snippet] [data-snippet-highlight] {
    color: var(--color-blue-800);
  }

  [data-card-color='purple']
    [data-nextjs-fix-snippet]
    [data-snippet-highlight] {
    color: var(--color-instant-text-purple);
  }

  [data-card-color='red'] [data-nextjs-fix-snippet] [data-snippet-highlight] {
    color: var(--color-red-800);
  }

  [data-card-color='amber'] [data-nextjs-fix-snippet] [data-snippet-highlight] {
    color: var(--color-instant-text-amber);
  }

  [data-card-color='teal'] [data-nextjs-fix-snippet] [data-snippet-highlight] {
    color: var(--color-instant-text-teal);
  }
`

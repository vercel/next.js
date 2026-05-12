import { AlignmentLeftIcon } from '../../icons/alignment-left'
import { ClockRewindIcon } from '../../icons/clock-rewind'
import { StopIcon } from '../../icons/stop'
import { css } from '../../utils/css'
import {
  DOCS_URLS,
  EXPLANATIONS,
  SYNC_IO_CLIENT_DOCS,
  SYNC_IO_DOCS,
  getCards,
  type FixCard,
  type GuidanceKind,
  type GuidanceVariant,
} from './instant-guidance-data'

export {
  DOCS_URLS,
  EXPLANATIONS,
  SYNC_IO_CLIENT_DOCS,
  SYNC_IO_DOCS,
} from './instant-guidance-data'
export type { GuidanceKind, GuidanceVariant } from './instant-guidance-data'

function getCardShortTitle(card: FixCard): string {
  switch (card.title) {
    case 'Show a falback while data loads':
    case 'Wrap in Suspense':
    case 'Wrap body in Suspense':
      return 'Stream'
    case 'Make route params static':
      return 'Prerender'
    case 'Allow blocking route':
      return 'Block'
    case 'Prerender and cache':
      return 'Cache'
    case 'Use static metadata':
    case 'Use static viewport':
      return 'Static'
    case 'Render page at request time':
    case 'Render at request time':
      return 'Dynamic'
    case 'Render on the client':
      return 'Client'
    case 'Move into effect or event handler':
      return 'Defer'
    case 'Measure elapsed time':
      return 'Measure'
    default:
      return card.title
  }
}

function getCardIcon(card: FixCard) {
  switch (card.color) {
    case 'blue':
      return <ClockRewindIcon />
    case 'purple':
      return <AlignmentLeftIcon />
    case 'red':
      return <StopIcon />
    default:
      return null
  }
}

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
          <div data-nextjs-fix-card-header>
            <div data-nextjs-fix-card-icon>{getCardIcon(card)}</div>
            <div data-nextjs-fix-card-header-text>
              <span data-nextjs-fix-card-title>{getCardShortTitle(card)}</span>
              <span data-nextjs-fix-card-description>{card.title}</span>
            </div>
          </div>
          <pre data-nextjs-fix-snippet>
            {card.snippets.map((snippet, i) => (
              <span
                key={i}
                data-snippet-line
                data-snippet-highlight={
                  !snippet.parts && snippet.highlight ? '' : undefined
                }
              >
                {snippet.parts
                  ? snippet.parts.map((part, j) => (
                      <span
                        key={j}
                        data-snippet-highlight={part.highlight ? '' : undefined}
                      >
                        {part.text}
                      </span>
                    ))
                  : snippet.text}
                {'\n'}
              </span>
            ))}
          </pre>
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
  showExplanation = true,
}: {
  variant: GuidanceVariant
  kind?: GuidanceKind
  explanation?: string
  cause?: string
  showExplanation?: boolean
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
      {showExplanation && (defaultExplanation || docsUrl) ? (
        <p data-nextjs-instant-explanation>
          {defaultExplanation ? <>{defaultExplanation} </> : null}
          {docsUrl ? (
            <a href={docsUrl} target="_blank" rel="noopener noreferrer">
              Learn more
            </a>
          ) : null}
        </p>
      ) : null}

      <div
        data-nextjs-instant-fix-heading
        className="nextjs__container_errors_desc nextjs__container_errors_desc_instant"
      >
        Ways to fix this:
      </div>

      <CardGrid cards={cards} />
    </div>
  )
}

export function InstantExplanation() {
  return <InstantHeaderExplanation kind="blocking-route" />
}

export function InstantHeaderExplanation({
  kind,
  explanation,
  docsUrl,
}: {
  kind?: GuidanceKind
  explanation?: string
  docsUrl?: string
}) {
  const resolvedExplanation = explanation || (kind ? EXPLANATIONS[kind] : '')
  const resolvedDocsUrl = docsUrl || (kind ? DOCS_URLS[kind] : '')

  return (
    <p data-nextjs-instant-explanation>
      {resolvedExplanation}{' '}
      <a
        href={resolvedDocsUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Learn more
      </a>
    </p>
  )
}

export const INSTANT_GUIDANCE_STYLES = css`
  [data-nextjs-instant-guidance] {
    margin: 0;
    padding: 0;
  }

  [data-nextjs-instant-explanation] {
    font-size: var(--size-14);
    line-height: var(--size-20);
    color: var(--color-gray-900);
    margin: 0;
  }

  [data-nextjs-instant-explanation] a {
    color: var(--color-blue-900);
    text-decoration: none;
  }

  [data-nextjs-instant-explanation] a:hover {
    text-decoration: underline;
  }

  [data-nextjs-instant-fix-heading] {
    padding: 20px 0;
  }

  [data-nextjs-card-grid] {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 12px;
  }

  [data-nextjs-fix-card] {
    border: 1px solid var(--color-gray-200);
    border-bottom: none;
    border-radius: var(--rounded-xl);
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  [data-nextjs-fix-card]:hover {
    border-color: var(--color-gray-500);
  }

  [data-nextjs-fix-card-header] {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0;
    padding: 14px;
  }

  [data-nextjs-fix-card-icon] {
    width: 36px;
    height: 36px;
    border-radius: var(--rounded-full);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  [data-nextjs-fix-card-icon] svg {
    width: 16px;
    height: 16px;
  }

  [data-nextjs-fix-card-header-text] {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  [data-nextjs-fix-card-title] {
    display: block;
    margin: 0;
    font-size: var(--size-13);
    font-weight: 500;
    line-height: var(--size-16);
    color: var(--color-gray-1000);
    text-align: left;
  }

  [data-nextjs-fix-card-description] {
    display: block;
    margin: 0;
    font-size: var(--size-13);
    line-height: var(--size-16);
    color: var(--color-gray-900);
    text-align: left;
  }

  [data-card-conditional] [data-nextjs-fix-snippet] {
    border-style: dashed;
  }

  [data-nextjs-fix-snippet] {
    flex: 1;
    font-family: var(--font-stack-monospace);
    font-size: 12px;
    line-height: 1.5;
    margin: 0;
    margin-left: -1px;
    padding: 16px;
    width: calc(100% + 2px);
    white-space: pre;
    overflow: hidden;
    background: var(--color-background-200);
    border: 1px solid var(--color-gray-200);
    border-radius: var(--rounded-xl);
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: left;
  }

  [data-nextjs-fix-card]:hover [data-nextjs-fix-snippet] {
    border-color: var(--color-gray-500);
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

  [data-card-color='blue'] [data-nextjs-fix-card-icon] {
    background: var(--color-blue-100);
    color: var(--color-blue-800);
  }

  [data-card-color='purple']
    [data-nextjs-fix-snippet]
    [data-snippet-highlight] {
    color: var(--color-instant-text-purple);
  }

  [data-card-color='purple'] [data-nextjs-fix-card-icon] {
    background: var(--color-purple-100);
    color: var(--color-purple-800);
  }

  [data-card-color='red'] [data-nextjs-fix-snippet] [data-snippet-highlight] {
    color: var(--color-red-800);
  }

  [data-card-color='red'] [data-nextjs-fix-card-icon] {
    background: var(--color-red-100);
    color: var(--color-red-800);
  }

  [data-card-color='amber'] [data-nextjs-fix-snippet] [data-snippet-highlight] {
    color: var(--color-instant-text-amber);
  }

  [data-card-color='amber'] [data-nextjs-fix-card-icon] {
    background: var(--color-amber-100);
    color: var(--color-amber-900);
  }

  [data-card-color='teal'] [data-nextjs-fix-snippet] [data-snippet-highlight] {
    color: var(--color-instant-text-teal);
  }

  [data-card-color='teal'] [data-nextjs-fix-card-icon] {
    background: color-mix(
      in srgb,
      var(--color-instant-text-teal) 14%,
      transparent
    );
    color: var(--color-instant-text-teal);
  }
`

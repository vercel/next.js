import {
  FixCardAlignLeftIcon,
  FixCardDatabaseIcon,
  FixCardHistoryIcon,
  FixCardLayoutIcon,
  FixCardOctagonIcon,
  FixCardPointerClickIcon,
  FixCardServerStackIcon,
  FixCardTimerIcon,
  FixCardZapIcon,
} from '../../icons/fix-card-icons'
import { ExternalIcon } from '../../icons/external'
import { css } from '../../utils/css'
import {
  DOCS_URLS,
  EXPLANATIONS,
  FIX_CARD_GROUPS,
  SYNC_IO_CLIENT_DOCS,
  SYNC_IO_DOCS,
  getCards,
  type FixCard,
  type FixCardIcon,
  type GuidanceKind,
  type GuidanceVariant,
} from './instant-guidance-data'

export { SYNC_IO_CLIENT_DOCS, SYNC_IO_DOCS } from './instant-guidance-data'
export type { GuidanceKind, GuidanceVariant } from './instant-guidance-data'

function getCardIcon(icon: FixCardIcon) {
  switch (icon) {
    case 'align-left':
      return <FixCardAlignLeftIcon />
    case 'server-stack':
      return <FixCardServerStackIcon />
    case 'pointer-click':
      return <FixCardPointerClickIcon />
    case 'history':
      return <FixCardHistoryIcon />
    case 'database':
      return <FixCardDatabaseIcon />
    case 'timer':
      return <FixCardTimerIcon />
    case 'octagon':
      return <FixCardOctagonIcon />
    case 'zap':
      return <FixCardZapIcon />
    case 'layout':
      return <FixCardLayoutIcon />
    default:
      icon satisfies never
      return null
  }
}

function CardGrid({ cards }: { cards: FixCard[] }) {
  return (
    <div data-nextjs-card-grid>
      {cards.map((card) => {
        const groupMeta = FIX_CARD_GROUPS[card.group]
        const inner = (
          <>
            {card.link ? (
              <span data-nextjs-fix-card-link-icon aria-hidden="true">
                <ExternalIcon width={16} height={16} />
              </span>
            ) : null}
            <div data-nextjs-fix-card-header>
              <div data-nextjs-fix-card-icon>{getCardIcon(groupMeta.icon)}</div>
              <div data-nextjs-fix-card-header-text>
                <div data-nextjs-fix-card-title-row>
                  <span data-nextjs-fix-card-title>{groupMeta.label}</span>
                </div>
                <span data-nextjs-fix-card-description>{card.title}</span>
              </div>
            </div>
            <pre data-nextjs-fix-snippet>
              {card.snippets.map((snippet, i) => (
                <span key={i} data-snippet-line>
                  {snippet.parts ? (
                    snippet.parts.map((part, j) => (
                      <span
                        key={j}
                        data-snippet-highlight={part.highlight ? '' : undefined}
                      >
                        {part.text}
                      </span>
                    ))
                  ) : snippet.highlight ? (
                    <span data-snippet-highlight>{snippet.text}</span>
                  ) : (
                    snippet.text
                  )}
                  {'\n'}
                </span>
              ))}
            </pre>
          </>
        )

        const sharedProps = {
          'data-nextjs-fix-card': '',
          'data-card-color': groupMeta.color,
        }

        return card.link ? (
          <a
            {...sharedProps}
            href={card.link}
            target="_blank"
            rel="noopener noreferrer"
            key={card.id}
            aria-label={`Open docs for ${card.title}`}
          >
            {inner}
          </a>
        ) : (
          <div {...sharedProps} key={card.id}>
            {inner}
          </div>
        )
      })}
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
      {resolvedDocsUrl ? (
        <a href={resolvedDocsUrl} target="_blank" rel="noopener noreferrer">
          Learn more
        </a>
      ) : null}
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
    color: inherit;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    position: relative;
    text-decoration: none;
  }

  a[data-nextjs-fix-card],
  a[data-nextjs-fix-card]:hover,
  a[data-nextjs-fix-card]:visited {
    color: inherit;
    text-decoration: none;
  }

  [data-nextjs-fix-card]:hover {
    border-color: var(--color-gray-500);
    background: var(--color-background-200);
  }

  a[data-nextjs-fix-card]:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 2px;
  }

  [data-nextjs-fix-card-header] {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0;
    padding: 14px;
  }

  [data-nextjs-fix-card-icon] {
    width: var(--size-36);
    height: var(--size-36);
    border-radius: var(--rounded-full);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  [data-nextjs-fix-card-icon] svg {
    width: var(--size-16);
    height: var(--size-16);
  }

  [data-nextjs-fix-card-header-text] {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  [data-nextjs-fix-card-title-row] {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--color-gray-1000);
  }

  [data-nextjs-fix-card-link-icon] {
    align-items: center;
    color: var(--color-gray-800);
    display: flex;
    opacity: 1;
    position: absolute;
    right: 14px;
    top: 14px;
    z-index: 1;
  }

  [data-nextjs-fix-card-title] {
    display: block;
    margin: 0;
    font-size: var(--size-13);
    font-weight: 500;
    line-height: var(--size-16);
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

  [data-nextjs-fix-snippet] {
    flex: 1;
    font-family: var(--font-stack-monospace);
    font-size: var(--size-12);
    line-height: 1.5;
    margin: 0;
    margin-left: -1px;
    padding: 14px 16px;
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
    background: var(--color-gray-100);
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

  [data-card-color='gray'] [data-nextjs-fix-snippet] [data-snippet-highlight] {
    color: var(--color-gray-1000);
  }

  [data-card-color='gray'] [data-nextjs-fix-card-icon] {
    background: var(--color-gray-100);
    color: var(--color-gray-800);
  }

  [data-card-color='amber'] [data-nextjs-fix-snippet] [data-snippet-highlight] {
    color: var(--color-instant-text-amber);
  }

  [data-card-color='amber'] [data-nextjs-fix-card-icon] {
    background: var(--color-amber-100);
    color: var(--color-amber-900);
  }
`

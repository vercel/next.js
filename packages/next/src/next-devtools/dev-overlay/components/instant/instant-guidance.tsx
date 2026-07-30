import {
  FixCardAlignLeftIcon,
  FixCardArrowUpIcon,
  FixCardDatabaseIcon,
  FixCardHistoryIcon,
  FixCardLayoutIcon,
  FixCardLoadingIcon,
  FixCardMinusIcon,
  FixCardPointerClickIcon,
  FixCardMinusCircleIcon,
  FixCardServerStackIcon,
  FixCardTimerIcon,
  FixCardZapIcon,
} from '../../icons/fix-card-icons'
import { CopyButton } from '../copy-button'
import { ExternalIcon } from '../../icons/external'
import { CopyPromptIcon } from '../../icons/copy-prompt'
import { css } from '../../utils/css'
import {
  DOCS_URLS,
  EXPLANATIONS,
  FIX_CARD_GROUPS,
  SYNC_IO_CLIENT_DOCS,
  SYNC_IO_DOCS,
  getCards,
  type FixCard,
  type FixCardGroup,
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
    case 'minus-circle':
      return <FixCardMinusCircleIcon />
    case 'loading':
      return <FixCardLoadingIcon />
    case 'zap':
      return <FixCardZapIcon />
    case 'layout':
      return <FixCardLayoutIcon />
    case 'arrow-up':
      return <FixCardArrowUpIcon />
    case 'minus':
      return <FixCardMinusIcon />
    default:
      icon satisfies never
      return null
  }
}

function CopyPromptButton({
  title,
  group,
  link,
  generateErrorInfo,
}: {
  title: string
  group: FixCardGroup
  link: string
  generateErrorInfo?: () => Promise<string>
}) {
  const groupLabel = FIX_CARD_GROUPS[group].label
  const hashIndex = link.indexOf('#')
  const rulePage = hashIndex === -1 ? link : link.slice(0, hashIndex)
  const fixHeader = [
    `Apply the [${groupLabel}] "${title}" fix to the Next.js Insight raised in this project.`,
    '',
    'Steps:',
    '',
    `1. Make sure you can drive a browser before you start. The fix isn't verified until you've reloaded the route and looked at what renders. If you don't already have browser tooling set up, install the next-dev-loop skill (https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop) first.`,
    '',
    "2. Identify the failing code in the error block below. It may be a data-access call, a hook call, a metadata or viewport export, or a component. Keep the fix focused on that code. If you think a related refactor (a sibling component, a shared layout, a wrapping boundary) would make the result meaningfully better, name it and check with the user before doing it — don't expand the scope silently.",
    '',
    `3. Read the rule docs at ${rulePage} for the full Insight explanation, then read the fix section at ${link}. Pick the pattern under "### Patterns" that matches the failing code, then read "### Gotchas" before editing — they list constraints that are easy to miss. Use the canonical imports and code shape from the page; don't improvise variations.`,
    '',
    `4. Apply the chosen pattern to the code identified in step 2. Don't narrate the change with new comments — the code should explain itself. Only leave a comment when the *why* isn't clear (e.g. a deliberate Block with a reason).`,
    '',
    `5. Verify the fix at runtime. The Insight clearing in the dev overlay confirms the build is happy, but not what actually renders. Reload the route in a browser and confirm the static shell still paints first and any new \`<Suspense>\` fallback resolves to its real content.`,
    '',
    "6. Check the shell isn't empty. A `<Suspense>` boundary placed too high (around the whole page body, or with `fallback={null}`) can leave the build reporting a shell while the shell itself contains nothing and everything streams. If that's what you see, pull the boundary down closer to the actual dynamic read.",
    '',
    "7. If the fix touched shared code (a layout, a wrapper, a sidebar), re-check the sibling routes too — a shell-level change can fix one route and break another. A before/after capture of the affected routes is a useful sanity check: the visible UI may look the same (the fix often just changes what's in the shell vs streamed), but if anything regressed visually, you'll see it.",
    '',
    'When you reply to the user, just summarize what you changed and why in plain prose. Don\'t echo this checklist back as headers, sections, or bullet lists labeled "Verification" or "Scope" — those are your internal steps, not the user\'s report.',
  ].join('\n')

  return generateErrorInfo ? (
    <CopyButton
      getContent={async () => {
        const info = await generateErrorInfo()
        return info ? `${fixHeader}\n\n${info}` : fixHeader
      }}
      actionLabel="Copy prompt"
      successLabel="Copied"
      icon={<CopyPromptIcon />}
      showLabel
      data-nextjs-fix-card-copy-button
    />
  ) : (
    <CopyButton
      content={fixHeader}
      actionLabel="Copy prompt"
      successLabel="Copied"
      icon={<CopyPromptIcon />}
      showLabel
      data-nextjs-fix-card-copy-button
    />
  )
}

function CardGrid({
  cards,
  generateErrorInfo,
}: {
  cards: FixCard[]
  generateErrorInfo?: () => Promise<string>
}) {
  return (
    <div data-nextjs-card-grid>
      {cards.map((card) => {
        const groupMeta = FIX_CARD_GROUPS[card.group]
        const inner = (
          <>
            {card.link && !card.copyable ? (
              <span data-nextjs-fix-card-link-icon aria-hidden="true">
                <ExternalIcon width={16} height={16} />
              </span>
            ) : null}
            <div data-nextjs-fix-card-header>
              <div data-nextjs-fix-card-icon>{getCardIcon(groupMeta.icon)}</div>
              <div data-nextjs-fix-card-header-text>
                <div data-nextjs-fix-card-title-row>
                  <span data-nextjs-fix-card-title>{groupMeta.label}</span>
                  {card.copyable && card.link ? (
                    <span
                      data-nextjs-fix-card-title-link-icon
                      aria-hidden="true"
                    >
                      <ExternalIcon width={12} height={12} />
                    </span>
                  ) : null}
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

        const cardElement = card.link ? (
          <a
            {...sharedProps}
            href={card.link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open docs for ${card.title}`}
          >
            {inner}
          </a>
        ) : (
          <div {...sharedProps}>{inner}</div>
        )

        // Render the copy button as a sibling of the card so the <button>
        // isn't nested inside the card's <a>, which would be invalid HTML
        // and break keyboard / focus behavior.
        return card.copyable && card.link ? (
          <div data-nextjs-fix-card-wrapper key={card.id}>
            {cardElement}
            <CopyPromptButton
              title={card.title}
              group={card.group}
              link={card.link}
              generateErrorInfo={generateErrorInfo}
            />
          </div>
        ) : (
          <div data-nextjs-fix-card-wrapper key={card.id}>
            {cardElement}
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
  generateErrorInfo,
}: {
  variant: GuidanceVariant
  kind?: GuidanceKind
  explanation?: string
  cause?: string
  showExplanation?: boolean
  generateErrorInfo?: () => Promise<string>
}) {
  const cards = getCards(kind, variant, cause)
  let docsUrl: string
  if (kind === 'sync-io' && cause) {
    docsUrl = SYNC_IO_DOCS[cause] || DOCS_URLS[kind]
  } else if (kind === 'sync-io-client' && cause) {
    docsUrl = SYNC_IO_CLIENT_DOCS[cause] || DOCS_URLS[kind]
  } else if (kind === 'blocking-route') {
    docsUrl =
      // TODO(app-shells): dedicated docs for link data errors (reuses runtime for now)
      variant === 'link'
        ? 'https://nextjs.org/docs/messages/blocking-prerender-runtime'
        : variant === 'runtime'
          ? 'https://nextjs.org/docs/messages/blocking-prerender-runtime'
          : 'https://nextjs.org/docs/messages/blocking-prerender-dynamic'
  } else if (kind === 'metadata') {
    docsUrl =
      // TODO(app-shells): dedicated docs for link data errors (reuses runtime for now)
      variant === 'link'
        ? 'https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime'
        : variant === 'runtime'
          ? 'https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime'
          : 'https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic'
  } else if (kind === 'viewport') {
    docsUrl =
      // TODO(app-shells): dedicated docs for link data errors (reuses runtime for now)
      variant === 'link'
        ? 'https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime'
        : variant === 'runtime'
          ? 'https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime'
          : 'https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic'
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

      <CardGrid cards={cards} generateErrorInfo={generateErrorInfo} />
    </div>
  )
}

export function InstantHeaderExplanation({
  kind,
  variant,
  explanation,
  docsUrl,
}: {
  kind?: GuidanceKind
  variant?: GuidanceVariant
  explanation?: string
  docsUrl?: string
}) {
  const resolvedExplanation = explanation || (kind ? EXPLANATIONS[kind] : '')
  let resolvedDocsUrl = docsUrl
  if (!resolvedDocsUrl && kind === 'blocking-route') {
    resolvedDocsUrl =
      // TODO(app-shells): dedicated docs for link data errors (reuses runtime for now)
      variant === 'link'
        ? 'https://nextjs.org/docs/messages/blocking-prerender-runtime'
        : variant === 'runtime'
          ? 'https://nextjs.org/docs/messages/blocking-prerender-runtime'
          : 'https://nextjs.org/docs/messages/blocking-prerender-dynamic'
  } else if (!resolvedDocsUrl && kind === 'metadata') {
    resolvedDocsUrl =
      // TODO(app-shells): dedicated docs for link data errors (reuses runtime for now)
      variant === 'link'
        ? 'https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime'
        : variant === 'runtime'
          ? 'https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime'
          : 'https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic'
  } else if (!resolvedDocsUrl && kind === 'viewport') {
    resolvedDocsUrl =
      // TODO(app-shells): dedicated docs for link data errors (reuses runtime for now)
      variant === 'link'
        ? 'https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime'
        : variant === 'runtime'
          ? 'https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime'
          : 'https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic'
  } else if (!resolvedDocsUrl && kind) {
    resolvedDocsUrl = DOCS_URLS[kind]
  }

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
    --copy-prompt-offset: 10px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: calc(12px + var(--copy-prompt-offset)) 12px;
  }

  [data-nextjs-fix-card] {
    border: 1px solid var(--color-gray-200);
    border-bottom: none;
    border-radius: var(--rounded-xl);
    color: inherit;
    display: flex;
    flex-direction: column;
    min-width: 0;
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

  [data-nextjs-fix-card]:hover [data-nextjs-fix-card-link-icon] {
    color: var(--color-gray-1000);
  }

  [data-nextjs-fix-card]:hover [data-nextjs-fix-snippet] {
    border-color: var(--color-gray-500);
    background: var(--color-gray-100);
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
    width: var(--size-28);
    height: var(--size-28);
    border-radius: var(--rounded-full);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.85;
  }

  [data-nextjs-fix-card-icon] svg {
    width: var(--size-14);
    height: var(--size-14);
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
    margin-bottom: -1px;
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

  [data-nextjs-fix-card-title-link-icon] {
    align-items: center;
    color: inherit;
    display: inline-flex;
    flex-shrink: 0;
  }

  [data-nextjs-fix-card]:hover [data-nextjs-fix-card-title-link-icon] {
    color: inherit;
  }

  [data-nextjs-fix-card-wrapper] {
    display: flex;
    position: relative;
  }

  [data-nextjs-fix-card-wrapper] > [data-nextjs-fix-card] {
    flex: 1;
  }

  [data-nextjs-fix-card-copy-button] {
    align-items: center;
    background: var(--color-background-100);
    border: 1px solid var(--color-gray-alpha-300);
    border-radius: 9999px;
    color: var(--color-gray-900);
    cursor: pointer;
    display: inline-flex;
    font-family: var(--font-stack-sans);
    font-size: var(--size-11);
    font-weight: 500;
    gap: 6px;
    height: auto;
    line-height: 1;
    padding: 5px 10px;
    position: absolute;
    right: 10px;
    top: calc(-1 * var(--copy-prompt-offset));
    transition:
      background 120ms ease,
      border-color 120ms ease,
      color 120ms ease;
    z-index: 2;
  }

  [data-nextjs-fix-card-copy-button] svg {
    width: var(--size-12);
    height: var(--size-12);
    flex-shrink: 0;
  }

  [data-nextjs-fix-card-copy-button] span {
    line-height: 1;
  }

  [data-nextjs-fix-card-copy-button]:hover {
    background: var(--color-background-200);
    border-color: var(--color-gray-alpha-500);
    color: var(--color-gray-1000);
  }

  [data-nextjs-fix-card-copy-button]:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 2px;
  }
`

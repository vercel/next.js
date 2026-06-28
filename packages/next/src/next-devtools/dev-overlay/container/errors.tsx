import React, {
  startTransition,
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { DebugInfo } from '../../shared/types'
import { Overlay, OverlayBackdrop } from '../components/overlay'
import { RuntimeError } from './runtime-error'
import { getErrorSource } from '../../../shared/lib/error-source'
import { HotlinkedText } from '../components/hot-linked-text'
import { PseudoHtmlDiff } from './runtime-error/component-stack-pseudo-html'
import {
  ErrorOverlayLayout,
  type ErrorOverlayLayoutProps,
} from '../components/errors/error-overlay-layout/error-overlay-layout'
import {
  getHydrationErrorStackInfo,
  isHydrationError,
  NEXTJS_HYDRATION_ERROR_LINK,
} from '../../shared/react-19-hydration-error'
import type { ReadyRuntimeError } from '../utils/get-error-by-type'
import type { ErrorBaseProps } from '../components/errors/error-overlay/error-overlay'
import type { HydrationErrorState } from '../../shared/hydration-error'
import { useActiveRuntimeError } from '../hooks/use-active-runtime-error'
import { generateErrorInfo as generateErrorInfoHelper } from '../utils/generate-error-info'
import {
  InstantHeaderExplanation,
  InstantGuidance,
  SYNC_IO_CLIENT_DOCS,
  SYNC_IO_DOCS,
  type GuidanceKind,
  type GuidanceVariant,
} from '../components/instant/instant-guidance'
import { BLOCKING_ROUTE_NAVIGATION_EXPLANATION } from '../components/instant/instant-guidance-data'
import { UnrenderedSegmentInfo } from '../components/instant/unrendered-segment-info'
import { CodeFrame } from '../components/code-frame/code-frame'
import { ErrorOverlayCallStack } from '../components/errors/error-overlay-call-stack/error-overlay-call-stack'
import { ErrorCause } from './runtime-error/error-cause'
import { useFrames } from '../utils/get-error-by-type'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import type { ErrorOverlayPaginationControls } from '../components/errors/error-overlay-pagination/error-overlay-pagination'

interface ErrorsProps extends ErrorBaseProps {
  getSquashedHydrationErrorDetails: (error: Error) => HydrationErrorState | null
  runtimeErrors: ReadyRuntimeError[]
  debugInfo: DebugInfo
  onClose: () => void
}

function matchLinkType(text: string): string | null {
  if (text.startsWith('https://nextjs.org')) {
    return 'nextjs-link'
  }
  if (text.startsWith('https://') || text.startsWith('http://')) {
    return 'external-link'
  }
  return null
}

function HydrationErrorDescription({ message }: { message: string }) {
  return <HotlinkedText text={message} matcher={matchLinkType} />
}

function GenericErrorDescription({ error }: { error: Error }) {
  const environmentName =
    'environmentName' in error ? error.environmentName : ''
  const envPrefix = environmentName ? `[ ${environmentName} ] ` : ''

  // The environment name will be displayed as a label, so remove it
  // from the message (e.g. "[ Server ] hello world" -> "hello world").
  let message = error.message
  if (message.startsWith(envPrefix)) {
    message = message.slice(envPrefix.length)
  }

  message = message.trim()
  if (!message) {
    return null
  }

  return (
    <>
      <HotlinkedText text={message} matcher={matchLinkType} />
    </>
  )
}

export function getErrorTypeLabel(
  error: Error,
  type: ReadyRuntimeError['type'],
  errorDetails: ErrorDetails
): ErrorOverlayLayoutProps['errorType'] {
  if (errorDetails.type === 'blocking-route') {
    return errorDetails.inNavigation ? `Instant` : `Blocking Route`
  }
  if (errorDetails.type === 'client-hook') {
    return `Blocking Route`
  }
  if (errorDetails.type === 'dynamic-metadata') {
    return `Blocking Route`
  }
  if (errorDetails.type === 'dynamic-viewport') {
    return `Blocking Route`
  }
  if (errorDetails.type === 'sync-io') {
    return `Blocking Route`
  }
  if (errorDetails.type === 'sync-io-client') {
    return `Blocking Route`
  }
  if (errorDetails.type === 'unrendered-segment') {
    return `Instant`
  }
  if (errorDetails.type === 'link-prefetch-partial') {
    return `Instant`
  }
  if (type === 'recoverable') {
    return `Recoverable ${error.name}`
  }
  if (type === 'console') {
    return `Console ${error.name}`
  }
  return `Runtime ${error.name}`
}

type ErrorDetails =
  | NoErrorDetails
  | HydrationErrorDetails
  | BlockingRouteErrorDetails
  | ClientHookErrorDetails
  | DynamicMetadataErrorDetails
  | DynamicViewportErrorDetails
  | SyncIOErrorDetails
  | SyncIOClientErrorDetails
  | UnrenderedSegmentErrorDetails
  | LinkPrefetchPartialErrorDetails

type NoErrorDetails = {
  type: 'empty'
}

type HydrationErrorDetails = {
  type: 'hydration'
  warning: string | null
  notes: string | null
  reactOutputComponentDiff: string | null
}

type BlockingRouteErrorDetails = {
  type: 'blocking-route'
  variant: 'dynamic' | 'runtime'
  inNavigation: boolean
}

type ClientHookErrorDetails = {
  type: 'client-hook'
  expression: string
}

type DynamicMetadataErrorDetails = {
  type: 'dynamic-metadata'
  variant: 'dynamic' | 'runtime'
}

type DynamicViewportErrorDetails = {
  type: 'dynamic-viewport'
  variant: 'dynamic' | 'runtime'
}

type SyncIOErrorDetails = {
  type: 'sync-io'
  cause: string
}

type SyncIOClientErrorDetails = {
  type: 'sync-io-client'
  cause: string
}

type UnrenderedSegmentErrorDetails = {
  type: 'unrendered-segment'
  route: string
  files: string[]
}

type LinkPrefetchPartialErrorDetails = {
  type: 'link-prefetch-partial'
  pathname: string
}

const noErrorDetails: ErrorDetails = {
  type: 'empty',
}

export function useErrorDetails(
  error: Error | undefined,
  getSquashedHydrationErrorDetails: (error: Error) => HydrationErrorState | null
): ErrorDetails {
  return useMemo(() => {
    if (error === undefined) {
      return noErrorDetails
    }

    const hydrationErrorDetails = getHydrationErrorDetails(
      error,
      getSquashedHydrationErrorDetails
    )
    if (hydrationErrorDetails) {
      return hydrationErrorDetails
    }

    const blockingRouteErrorDetails = getBlockingRouteErrorDetails(error)
    if (blockingRouteErrorDetails) {
      return blockingRouteErrorDetails
    }

    const unrenderedSegmentDetails = getUnrenderedSegmentErrorDetails(error)
    if (unrenderedSegmentDetails) {
      return unrenderedSegmentDetails
    }

    const linkPrefetchPartialDetails = getLinkPrefetchPartialErrorDetails(error)
    if (linkPrefetchPartialDetails) {
      return linkPrefetchPartialDetails
    }

    return noErrorDetails
  }, [error, getSquashedHydrationErrorDetails])
}

function getHydrationErrorDetails(
  error: Error,
  getSquashedHydrationErrorDetails: (error: Error) => HydrationErrorState | null
): null | HydrationErrorDetails {
  const pagesRouterErrorDetails = getSquashedHydrationErrorDetails(error)
  if (pagesRouterErrorDetails !== null) {
    return {
      type: 'hydration',
      warning: pagesRouterErrorDetails.warning ?? null,
      notes: null,
      reactOutputComponentDiff:
        pagesRouterErrorDetails.reactOutputComponentDiff ?? null,
    }
  }

  if (!isHydrationError(error)) {
    return null
  }

  const { message, notes, diff } = getHydrationErrorStackInfo(error)
  if (message === null) {
    return null
  }

  return {
    type: 'hydration',
    warning: message,
    notes,
    reactOutputComponentDiff: diff,
  }
}

// Detect `connection()` as the trigger by sniffing the highlighted line of the code frame.
export function deriveCauseFromCodeFrame(
  kind: GuidanceKind,
  variant: GuidanceVariant,
  codeFrame: string | null | undefined
): 'connection' | undefined {
  if (variant !== 'dynamic') return undefined
  if (kind !== 'blocking-route' && kind !== 'metadata' && kind !== 'viewport')
    return undefined
  if (!codeFrame) return undefined
  for (const line of stripAnsi(codeFrame).split('\n')) {
    if (/^\s*>/.test(line) && /\bconnection\s*\(/.test(line)) {
      return 'connection'
    }
  }
  return undefined
}

function InstantRuntimeError({
  error,
  variant,
  kind = 'blocking-route',
  explanation,
  cause,
  showExplanation = true,
  dialogResizerRef,
  generateErrorInfo,
}: {
  error: ReadyRuntimeError
  variant: GuidanceVariant
  kind?: GuidanceKind
  explanation?: string
  cause?: string
  showExplanation?: boolean
  dialogResizerRef: React.RefObject<HTMLDivElement | null>
  generateErrorInfo: () => Promise<string>
}) {
  const frames = useFrames(error)

  const firstFrame = useMemo(() => {
    const idx = frames.findIndex(
      (entry) =>
        !entry.ignored &&
        Boolean(entry.originalCodeFrame) &&
        Boolean(entry.originalStackFrame)
    )
    return frames[idx] ?? null
  }, [frames])

  const derivedCause =
    cause ??
    deriveCauseFromCodeFrame(kind, variant, firstFrame?.originalCodeFrame)

  return (
    <>
      {firstFrame && (
        <CodeFrame
          stackFrame={firstFrame.originalStackFrame!}
          codeFrame={firstFrame.originalCodeFrame!}
        />
      )}
      <InstantGuidance
        variant={variant}
        kind={kind}
        explanation={explanation}
        cause={derivedCause}
        showExplanation={showExplanation}
        generateErrorInfo={generateErrorInfo}
      />
      {frames.length > 0 && (
        <ErrorOverlayCallStack
          dialogResizerRef={dialogResizerRef}
          frames={frames}
        />
      )}

      {/* Instant errors are always single errors, never AggregateError.
          Each blocking data access is tracked individually via
          dynamicValidation.dynamicErrors and surfaced one at a time. */}
      {error.cause && (
        <ErrorCause cause={error.cause} dialogResizerRef={dialogResizerRef} />
      )}
    </>
  )
}

export function isRuntimeVariant(message: string): boolean {
  // Discriminates between `createRuntimeBodyError` and `createDynamicBodyError`
  return (
    message.includes('encountered runtime data') &&
    !message.includes('encountered uncached data')
  )
}

const SYNC_IO_APIS = [
  // Math
  'Math.random()',
  // Date/Time — `new Date()` before `Date()` (substring false positive) and
  // both before `Date.now()` (the `elapsedTimeBullet` text always contains
  // `Date.now()` regardless of which API the user actually called).
  'new Date()',
  'Date()',
  'Date.now()',
  // Node Crypto — longer strings first to avoid substring false positives
  "require('node:crypto').generateKeyPairSync(...)",
  "require('node:crypto').generateKeySync(...)",
  "require('node:crypto').generatePrimeSync(...)",
  "require('node:crypto').randomFillSync(...)",
  "require('node:crypto').randomBytes(size)",
  "require('node:crypto').randomInt(min, max)",
  "require('node:crypto').randomUUID()",
  // Web Crypto
  'crypto.getRandomValues()',
  'crypto.randomUUID()',
]

const SYNC_IO_DOCS_PATTERN =
  /https:\/\/nextjs\.org\/docs\/messages\/blocking-prerender-(random|current-time|crypto)(-client)?/

// Discriminate sync IO errors via the docs URL embedded in the user-facing
// message by `createSyncIOError`, `createSyncIORuntimeError`, and
// `createSyncIOClientError`.
export function isSyncIOError(message: string): boolean {
  return SYNC_IO_DOCS_PATTERN.test(message)
}

export function isSyncIOClientError(message: string): boolean {
  const match = SYNC_IO_DOCS_PATTERN.exec(message)
  return match !== null && match[2] === '-client'
}

// Detects errors emitted during navigation-phase instant validation: body
// errors from `createRuntimeBodyErrorInNavigation` /
// `createDynamicBodyErrorInNavigation` (SSR factories instead say "during
// prerendering"), and validation errors from
// `trackDynamicHoleInNavigation` / `getNavigationDisallowedDynamicReasons`.
export function isBlockingRouteInNavError(message: string): boolean {
  return (
    message.includes('or a navigation') ||
    message.includes('Could not validate `instant`') ||
    message.includes(
      'Could not validate that a segment in your UI has instant navigation'
    )
  )
}

export function getBlockingRouteErrorDetails(
  error: Error
): null | ErrorDetails {
  const message = error.message
  const inNavigation = isBlockingRouteInNavError(message)

  const clientHookMatch =
    /Next\.js encountered URL data `([^`]+)` in a Client Component outside of `<Suspense>`\./.exec(
      message
    )
  if (clientHookMatch) {
    return {
      type: 'client-hook',
      expression: clientHookMatch[1],
    }
  }

  const isBlockingPageLoadError =
    message.includes('/blocking-prerender-runtime#') ||
    message.includes('/blocking-prerender-dynamic#')
  if (isBlockingPageLoadError) {
    return {
      type: 'blocking-route',
      variant: isRuntimeVariant(message) ? 'runtime' : 'dynamic',
      inNavigation,
    }
  }

  const isDynamicMetadataError =
    message.includes('/blocking-prerender-metadata-dynamic') ||
    message.includes('/blocking-prerender-metadata-runtime')
  if (isDynamicMetadataError) {
    return {
      type: 'dynamic-metadata',
      variant: isRuntimeVariant(message) ? 'runtime' : 'dynamic',
    }
  }

  const isBlockingViewportError =
    message.includes('/blocking-prerender-viewport-dynamic') ||
    message.includes('/blocking-prerender-viewport-runtime')
  if (isBlockingViewportError) {
    return {
      type: 'dynamic-viewport',
      variant: isRuntimeVariant(message) ? 'runtime' : 'dynamic',
    }
  }

  if (isSyncIOError(message)) {
    const isClient = isSyncIOClientError(message)
    for (const api of SYNC_IO_APIS) {
      if (message.includes(api)) {
        return {
          type: isClient ? 'sync-io-client' : 'sync-io',
          cause: api,
        }
      }
    }
  }

  return null
}

export function getUnrenderedSegmentErrorDetails(
  error: Error
): UnrenderedSegmentErrorDetails | null {
  const message = error.message
  if (typeof message !== 'string') return null
  if (
    !message.includes(
      'Could not validate that a segment in your UI has instant navigation'
    )
  ) {
    return null
  }
  const routeMatch = /^Route "([^"]+)":/.exec(message)
  if (!routeMatch) return null
  const route = routeMatch[1]

  // The body lists `Dropped segment:` or `Dropped segments:` followed
  // by indented file paths on subsequent lines until the next blank line.
  const files: string[] = []
  const filesBlockMatch = /\nDropped segments?:\n([^]*?)(?:\n\n|$)/.exec(
    message
  )
  if (filesBlockMatch) {
    for (const rawLine of filesBlockMatch[1].split('\n')) {
      const trimmed = rawLine.replace(/^\s+/, '')
      if (trimmed) files.push(trimmed)
    }
  }

  return {
    type: 'unrendered-segment',
    route,
    files,
  }
}

export function getLinkPrefetchPartialErrorDetails(
  error: Error
): LinkPrefetchPartialErrorDetails | null {
  const message = error.message
  if (typeof message !== 'string') return null
  const match =
    /^Next\.js encountered dynamic data during prefetching for "([^"]+)"\./.exec(
      message
    )
  if (!match) return null
  return {
    type: 'link-prefetch-partial',
    pathname: match[1],
  }
}

export function isInstantNavigationError(error: Error): boolean {
  // Unrendered-segment errors are always instant-only
  if (getUnrenderedSegmentErrorDetails(error)) return true
  if (getLinkPrefetchPartialErrorDetails(error)) return true
  const details = getBlockingRouteErrorDetails(error)
  return details?.type === 'blocking-route' && details.inNavigation
}

export type ErrorTab = 'errors' | 'instant'

export function ErrorTabBar({
  activeTab,
  onTabChange,
  errorCount,
  instantCount,
  errorActiveIdx,
  instantActiveIdx,
  previousButton,
  nextButton,
  createCount,
}: {
  activeTab: ErrorTab
  onTabChange: (tab: ErrorTab) => void
  errorCount: number
  instantCount: number
  errorActiveIdx: number
  instantActiveIdx: number
  previousButton: React.ReactNode
  nextButton: React.ReactNode
  createCount: (
    activeIdx: number,
    total: number,
    isActive?: boolean
  ) => React.ReactNode
}) {
  return (
    <div className="error-overlay-tab-bar" data-nextjs-error-overlay-tab-bar>
      {previousButton}
      <button
        type="button"
        className="error-overlay-tab"
        data-active={activeTab === 'errors'}
        disabled={errorCount === 0}
        aria-disabled={errorCount === 0}
        onClick={() => onTabChange('errors')}
      >
        {errorCount === 0 ? (
          'No issues'
        ) : (
          <>
            Issues
            <span
              className="error-overlay-tab-count"
              data-active={activeTab === 'errors'}
            >
              {createCount(errorActiveIdx, errorCount, activeTab === 'errors')}
            </span>
          </>
        )}
      </button>
      {instantCount > 0 && (
        <button
          type="button"
          className="error-overlay-tab"
          data-active={activeTab === 'instant'}
          onClick={() => onTabChange('instant')}
        >
          Insights
          <span
            className="error-overlay-tab-count"
            data-active={activeTab === 'instant'}
          >
            {createCount(
              instantActiveIdx,
              instantCount,
              activeTab === 'instant'
            )}
          </span>
        </button>
      )}
      {nextButton}
    </div>
  )
}

export function Errors({
  getSquashedHydrationErrorDetails,
  runtimeErrors,
  debugInfo,
  onClose,
  ...props
}: ErrorsProps) {
  const dialogResizerRef = useRef<HTMLDivElement | null>(null)

  const { normalErrors, instantErrors } = useMemo(() => {
    const normal: ReadyRuntimeError[] = []
    const instant: ReadyRuntimeError[] = []
    for (const err of runtimeErrors) {
      if (isInstantNavigationError(err.error)) {
        instant.push(err)
      } else {
        normal.push(err)
      }
    }
    return { normalErrors: normal, instantErrors: instant }
  }, [runtimeErrors])

  const [activeTab, setActiveTab] = useState<ErrorTab>(() =>
    normalErrors.length > 0 ? 'errors' : 'instant'
  )
  const [activeIndices, setActiveIndices] = useState<Record<ErrorTab, number>>({
    errors: 0,
    instant: 0,
  })
  const effectiveActiveTab =
    activeTab === 'errors'
      ? normalErrors.length > 0
        ? 'errors'
        : 'instant'
      : instantErrors.length > 0
        ? 'instant'
        : 'errors'
  const activeErrors =
    effectiveActiveTab === 'instant' ? instantErrors : normalErrors
  const errorActiveIdx = Math.max(
    0,
    Math.min(activeIndices.errors, Math.max(0, normalErrors.length - 1))
  )
  const instantActiveIdx = Math.max(
    0,
    Math.min(activeIndices.instant, Math.max(0, instantErrors.length - 1))
  )
  const activeIdxForTab =
    effectiveActiveTab === 'instant' ? instantActiveIdx : errorActiveIdx

  const {
    isLoading,
    errorCode,
    errorType,
    activeIdx,
    errorDetails,
    activeError,
    setActiveIndex,
  } = useActiveRuntimeError({
    runtimeErrors: activeErrors,
    getSquashedHydrationErrorDetails,
    activeIdx: activeIdxForTab,
    setActiveIndex: (index) => {
      setActiveIndices((previous) => ({
        ...previous,
        [effectiveActiveTab]: index,
      }))
    },
  })

  const generateErrorInfo = useCallback(
    () =>
      generateErrorInfoHelper({
        activeError,
        errorType,
        versionInfo: props.versionInfo.installed,
        bundler: process.env.__NEXT_BUNDLER as string,
      }),
    [activeError, errorType, props.versionInfo]
  )

  if (isLoading) {
    // TODO: better loading state
    return (
      <Overlay>
        <OverlayBackdrop />
      </Overlay>
    )
  }

  if (!activeError) {
    return null
  }

  const error = activeError.error
  const isServerError = ['server', 'edge-server'].includes(
    getErrorSource(error) || ''
  )

  // Show the tab bar only when at least one Insight is present. When the only
  // bucket with content is Issues, the red pill already conveys the count and a
  // single-tab bar would be redundant. When Insights exist (alone or alongside
  // Issues), the bar is shown so the user can switch between buckets.
  const showTabBar = instantErrors.length > 0
  const renderTabBar = showTabBar
    ? ({
        previousButton,
        createCount,
        nextButton,
      }: ErrorOverlayPaginationControls) => (
        <ErrorTabBar
          activeTab={effectiveActiveTab}
          onTabChange={(tab) => {
            startTransition(() => {
              setActiveTab(tab)
            })
          }}
          errorCount={normalErrors.length}
          instantCount={instantErrors.length}
          errorActiveIdx={errorActiveIdx}
          instantActiveIdx={instantActiveIdx}
          previousButton={previousButton}
          nextButton={nextButton}
          createCount={createCount}
        />
      )
    : undefined

  const canGoPrevious = showTabBar
    ? effectiveActiveTab === 'errors'
      ? errorActiveIdx > 0
      : instantActiveIdx > 0 || normalErrors.length > 0
    : activeIdx > 0
  const canGoNext = showTabBar
    ? effectiveActiveTab === 'errors'
      ? errorActiveIdx < normalErrors.length - 1 || instantErrors.length > 0
      : instantActiveIdx < instantErrors.length - 1
    : activeIdx < activeErrors.length - 1

  const handlePrevious = showTabBar
    ? () => {
        startTransition(() => {
          if (effectiveActiveTab === 'errors') {
            if (errorActiveIdx > 0) {
              setActiveIndex(errorActiveIdx - 1)
            }
            return
          }

          if (instantActiveIdx > 0) {
            setActiveIndex(instantActiveIdx - 1)
            return
          }

          if (normalErrors.length > 0) {
            setActiveTab('errors')
            setActiveIndices((previous) => ({
              ...previous,
              errors: Math.max(0, normalErrors.length - 1),
            }))
          }
        })
      }
    : undefined

  const handleNext = showTabBar
    ? () => {
        startTransition(() => {
          if (effectiveActiveTab === 'errors') {
            if (errorActiveIdx < normalErrors.length - 1) {
              setActiveIndex(errorActiveIdx + 1)
              return
            }

            if (instantErrors.length > 0) {
              setActiveTab('instant')
              setActiveIndices((previous) => ({
                ...previous,
                instant: 0,
              }))
            }
            return
          }

          if (instantActiveIdx < instantErrors.length - 1) {
            setActiveIndex(instantActiveIdx + 1)
          }
        })
      }
    : undefined

  let errorMessage: React.ReactNode
  let maybeNotes: React.ReactNode = null
  let maybeDiff: React.ReactNode = null
  switch (errorDetails.type) {
    case 'hydration':
      errorMessage = errorDetails.warning ? (
        <HydrationErrorDescription message={errorDetails.warning} />
      ) : (
        <GenericErrorDescription error={error} />
      )
      maybeNotes = (
        <div className="error-overlay-notes-container">
          {errorDetails.notes ? (
            <>
              <p
                id="nextjs__container_errors__notes"
                className="nextjs__container_errors__notes"
              >
                {errorDetails.notes}
              </p>
            </>
          ) : null}
          {errorDetails.warning ? (
            <p
              id="nextjs__container_errors__link"
              className="nextjs__container_errors__link"
            >
              <HotlinkedText
                text={`See more info here: ${NEXTJS_HYDRATION_ERROR_LINK}`}
              />
            </p>
          ) : null}
        </div>
      )
      if (errorDetails.reactOutputComponentDiff) {
        maybeDiff = (
          <PseudoHtmlDiff
            reactOutputComponentDiff={
              errorDetails.reactOutputComponentDiff || ''
            }
          />
        )
      }
      break
    case 'blocking-route':
      return (
        <ErrorOverlayLayout
          errorCode={errorCode}
          errorType={errorType}
          errorMessage={
            errorDetails.variant === 'runtime'
              ? errorDetails.inNavigation
                ? 'Next.js encountered runtime data during a navigation.'
                : 'Next.js encountered runtime data during prerendering.'
              : errorDetails.inNavigation
                ? 'Next.js encountered uncached data during a navigation.'
                : 'Next.js encountered uncached data during prerendering.'
          }
          headerChildren={
            <InstantHeaderExplanation
              kind="blocking-route"
              variant={errorDetails.variant}
              explanation={
                errorDetails.inNavigation
                  ? BLOCKING_ROUTE_NAVIGATION_EXPLANATION
                  : undefined
              }
            />
          }
          renderTabBar={renderTabBar}
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onClose={isServerError ? undefined : onClose}
          debugInfo={debugInfo}
          error={error}
          runtimeErrors={activeErrors}
          activeIdx={activeIdx}
          setActiveIndex={setActiveIndex}
          dialogResizerRef={dialogResizerRef}
          generateErrorInfo={generateErrorInfo}
          {...props}
        >
          <Suspense fallback={<div data-nextjs-error-suspended />}>
            <InstantRuntimeError
              key={activeError.id.toString()}
              error={activeError}
              variant={errorDetails.variant}
              showExplanation={false}
              dialogResizerRef={dialogResizerRef}
              generateErrorInfo={generateErrorInfo}
            />
          </Suspense>
        </ErrorOverlayLayout>
      )
    case 'client-hook':
      return (
        <ErrorOverlayLayout
          errorCode={errorCode}
          errorType={errorType}
          errorMessage={
            <>
              Next.js encountered URL data{' '}
              <code>{errorDetails.expression}</code> in a Client Component
              outside of Suspense.
            </>
          }
          headerChildren={<InstantHeaderExplanation kind="client-hook" />}
          renderTabBar={renderTabBar}
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onClose={isServerError ? undefined : onClose}
          debugInfo={debugInfo}
          error={error}
          runtimeErrors={activeErrors}
          activeIdx={activeIdx}
          setActiveIndex={setActiveIndex}
          dialogResizerRef={dialogResizerRef}
          generateErrorInfo={generateErrorInfo}
          {...props}
        >
          <Suspense fallback={<div data-nextjs-error-suspended />}>
            <InstantRuntimeError
              key={activeError.id.toString()}
              error={activeError}
              variant="runtime"
              kind="client-hook"
              cause={errorDetails.expression}
              showExplanation={false}
              dialogResizerRef={dialogResizerRef}
              generateErrorInfo={generateErrorInfo}
            />
          </Suspense>
        </ErrorOverlayLayout>
      )
    case 'dynamic-metadata':
      return (
        <ErrorOverlayLayout
          errorCode={errorCode}
          errorType={errorType}
          errorMessage={
            errorDetails.variant === 'runtime' ? (
              <>
                Next.js encountered runtime data in{' '}
                <code>generateMetadata()</code>.
              </>
            ) : (
              <>
                Next.js encountered uncached data in{' '}
                <code>generateMetadata()</code>.
              </>
            )
          }
          headerChildren={
            <InstantHeaderExplanation
              kind="metadata"
              variant={errorDetails.variant}
            />
          }
          renderTabBar={renderTabBar}
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onClose={isServerError ? undefined : onClose}
          debugInfo={debugInfo}
          error={error}
          runtimeErrors={activeErrors}
          activeIdx={activeIdx}
          setActiveIndex={setActiveIndex}
          dialogResizerRef={dialogResizerRef}
          generateErrorInfo={generateErrorInfo}
          {...props}
        >
          <Suspense fallback={<div data-nextjs-error-suspended />}>
            <InstantRuntimeError
              key={activeError.id.toString()}
              error={activeError}
              variant={errorDetails.variant}
              kind="metadata"
              showExplanation={false}
              dialogResizerRef={dialogResizerRef}
              generateErrorInfo={generateErrorInfo}
            />
          </Suspense>
        </ErrorOverlayLayout>
      )
    case 'dynamic-viewport':
      return (
        <ErrorOverlayLayout
          errorCode={errorCode}
          errorType={errorType}
          errorMessage={
            errorDetails.variant === 'runtime' ? (
              <>
                Next.js encountered runtime data in{' '}
                <code>generateViewport()</code>.
              </>
            ) : (
              <>
                Next.js encountered uncached data in{' '}
                <code>generateViewport()</code>.
              </>
            )
          }
          headerChildren={
            <InstantHeaderExplanation
              kind="viewport"
              variant={errorDetails.variant}
            />
          }
          renderTabBar={renderTabBar}
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onClose={isServerError ? undefined : onClose}
          debugInfo={debugInfo}
          error={error}
          runtimeErrors={activeErrors}
          activeIdx={activeIdx}
          setActiveIndex={setActiveIndex}
          dialogResizerRef={dialogResizerRef}
          generateErrorInfo={generateErrorInfo}
          {...props}
        >
          <Suspense fallback={<div data-nextjs-error-suspended />}>
            <InstantRuntimeError
              key={activeError.id.toString()}
              error={activeError}
              variant={errorDetails.variant}
              kind="viewport"
              showExplanation={false}
              dialogResizerRef={dialogResizerRef}
              generateErrorInfo={generateErrorInfo}
            />
          </Suspense>
        </ErrorOverlayLayout>
      )
    case 'sync-io':
      return (
        <ErrorOverlayLayout
          errorCode={errorCode}
          errorType={errorType}
          errorMessage={
            <>
              Next.js encountered the unstable value{' '}
              <code>{errorDetails.cause}</code> while prerendering.
            </>
          }
          headerChildren={
            <InstantHeaderExplanation
              explanation="This value can change between renders, so it must be either prerendered or computed later."
              docsUrl={SYNC_IO_DOCS[errorDetails.cause]}
            />
          }
          renderTabBar={renderTabBar}
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onClose={isServerError ? undefined : onClose}
          debugInfo={debugInfo}
          error={error}
          runtimeErrors={activeErrors}
          activeIdx={activeIdx}
          setActiveIndex={setActiveIndex}
          dialogResizerRef={dialogResizerRef}
          generateErrorInfo={generateErrorInfo}
          {...props}
        >
          <Suspense fallback={<div data-nextjs-error-suspended />}>
            <InstantRuntimeError
              key={activeError.id.toString()}
              error={activeError}
              variant="runtime"
              kind="sync-io"
              cause={errorDetails.cause}
              showExplanation={false}
              dialogResizerRef={dialogResizerRef}
              generateErrorInfo={generateErrorInfo}
            />
          </Suspense>
        </ErrorOverlayLayout>
      )
    case 'sync-io-client':
      return (
        <ErrorOverlayLayout
          errorCode={errorCode}
          errorType={errorType}
          errorMessage={
            <>
              Next.js encountered the unstable value{' '}
              <code>{errorDetails.cause}</code> in a Client Component.
            </>
          }
          headerChildren={
            <InstantHeaderExplanation
              explanation="This value would be evaluated during the prerender, instead of recomputed on each visit."
              docsUrl={SYNC_IO_CLIENT_DOCS[errorDetails.cause]}
            />
          }
          renderTabBar={renderTabBar}
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onClose={isServerError ? undefined : onClose}
          debugInfo={debugInfo}
          error={error}
          runtimeErrors={activeErrors}
          activeIdx={activeIdx}
          setActiveIndex={setActiveIndex}
          dialogResizerRef={dialogResizerRef}
          generateErrorInfo={generateErrorInfo}
          {...props}
        >
          <Suspense fallback={<div data-nextjs-error-suspended />}>
            <InstantRuntimeError
              key={activeError.id.toString()}
              error={activeError}
              variant="runtime"
              kind="sync-io-client"
              cause={errorDetails.cause}
              showExplanation={false}
              dialogResizerRef={dialogResizerRef}
              generateErrorInfo={generateErrorInfo}
            />
          </Suspense>
        </ErrorOverlayLayout>
      )
    case 'unrendered-segment':
      return (
        <ErrorOverlayLayout
          errorCode={errorCode}
          errorType={errorType}
          errorMessage="Next.js could not validate that a segment in your UI has instant navigation."
          headerChildren={
            <InstantHeaderExplanation kind="unrendered-segment" />
          }
          renderTabBar={renderTabBar}
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onClose={isServerError ? undefined : onClose}
          debugInfo={debugInfo}
          error={error}
          runtimeErrors={activeErrors}
          activeIdx={activeIdx}
          setActiveIndex={setActiveIndex}
          dialogResizerRef={dialogResizerRef}
          generateErrorInfo={generateErrorInfo}
          {...props}
        >
          <UnrenderedSegmentInfo
            route={errorDetails.route}
            files={errorDetails.files}
          />
          <InstantGuidance
            kind="unrendered-segment"
            variant="dynamic"
            showExplanation={false}
          />
        </ErrorOverlayLayout>
      )
    case 'link-prefetch-partial':
      return (
        <ErrorOverlayLayout
          errorCode={errorCode}
          errorType={errorType}
          errorMessage="Next.js encountered dynamic data during prefetching."
          headerChildren={
            <InstantHeaderExplanation kind="link-prefetch-partial" />
          }
          renderTabBar={renderTabBar}
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onClose={isServerError ? undefined : onClose}
          debugInfo={debugInfo}
          error={error}
          runtimeErrors={activeErrors}
          activeIdx={activeIdx}
          setActiveIndex={setActiveIndex}
          dialogResizerRef={dialogResizerRef}
          generateErrorInfo={generateErrorInfo}
          {...props}
        >
          <Suspense fallback={<div data-nextjs-error-suspended />}>
            <InstantRuntimeError
              key={activeError.id.toString()}
              error={activeError}
              variant="runtime"
              kind="link-prefetch-partial"
              showExplanation={false}
              dialogResizerRef={dialogResizerRef}
              generateErrorInfo={generateErrorInfo}
            />
          </Suspense>
        </ErrorOverlayLayout>
      )
    case 'empty':
      errorMessage = <GenericErrorDescription error={error} />
      break
    default:
      errorDetails satisfies never
  }

  return (
    <ErrorOverlayLayout
      errorCode={errorCode}
      errorType={errorType}
      errorMessage={errorMessage}
      renderTabBar={renderTabBar}
      canGoPrevious={canGoPrevious}
      canGoNext={canGoNext}
      onPrevious={handlePrevious}
      onNext={handleNext}
      onClose={isServerError ? undefined : onClose}
      debugInfo={debugInfo}
      error={error}
      runtimeErrors={activeErrors}
      activeIdx={activeIdx}
      setActiveIndex={setActiveIndex}
      dialogResizerRef={dialogResizerRef}
      generateErrorInfo={generateErrorInfo}
      {...props}
    >
      {maybeNotes}
      {maybeDiff}
      <Suspense fallback={<div data-nextjs-error-suspended />}>
        <RuntimeError
          key={activeError.id.toString()}
          error={activeError}
          dialogResizerRef={dialogResizerRef}
        />
      </Suspense>
    </ErrorOverlayLayout>
  )
}

export const styles = `
  .nextjs-error-with-static {
    bottom: calc(16px * 4.5);
  }
  p.nextjs__container_errors__link {
    font-size: var(--size-14);
  }
  p.nextjs__container_errors__notes {
    color: var(--color-stack-notes);
    font-size: var(--size-14);
    line-height: 1.5;
  }
  .nextjs-container-errors-body > h2:not(:first-child) {
    margin-top: calc(16px + 8px);
  }
  .nextjs-container-errors-body > h2 {
    color: var(--color-title-color);
    margin-bottom: 8px;
    font-size: var(--size-20);
  }
  .nextjs-toast-errors-parent {
    cursor: pointer;
    transition: transform 0.2s ease;
  }
  .nextjs-toast-errors-parent:hover {
    transform: scale(1.1);
  }
  .nextjs-toast-errors {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }
  .nextjs-toast-errors > svg {
    margin-right: 8px;
  }
  .nextjs-toast-hide-button {
    margin-left: 24px;
    border: none;
    background: none;
    color: var(--color-ansi-bright-white);
    padding: 0;
    transition: opacity 0.25s ease;
    opacity: 0.7;
  }
  .nextjs-toast-hide-button:hover {
    opacity: 1;
  }
  .nextjs__container_errors__error_title {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    position: relative;
  }
  .nextjs__container_errors__error_title__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    width: 100%;
  }
  .error-overlay-notes-container {
    margin: 8px 2px;
  }
  .error-overlay-notes-container p {
    white-space: pre-wrap;
  }
  .external-link, .external-link:hover {
    color:inherit;
  }

  .error-overlay-tab-bar {
    display: flex;
    gap: 6px;
    translate: var(--next-dialog-border-width) 0;
    max-width: var(--next-dialog-max-width);
    width: 100%;
    position: relative;
    z-index: 1;
  }

  .error-overlay-tab {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 4px;
    border: none;
    background: none;
    color: var(--color-gray-800);
    font-size: var(--size-13);
    font-family: var(--font-stack-sans);
    cursor: pointer;
    position: relative;
    transition: color 0.15s ease;
    border-radius: var(--rounded-md);

    &:hover:not(:disabled) {
      color: var(--color-gray-1000);
    }

    &[data-active='true'] {
      color: var(--color-gray-1000);
      font-weight: 500;
    }

    &:disabled {
      opacity: 0.4;
      cursor: default;
    }

    &:focus-visible {
      outline: var(--focus-ring);
      outline-offset: 2px;
    }
  }

  .error-overlay-tab-count {
    display: flex;
    align-items: center;
    color: inherit;

    &[data-active='true'] {
      .error-overlay-pagination-count {
        font-weight: 500;
      }
    }
  }

`

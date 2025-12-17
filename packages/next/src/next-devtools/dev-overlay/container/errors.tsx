import React, { useMemo, useRef, Suspense, useCallback } from 'react'
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
import { useFrames } from '../utils/get-error-by-type'
import type { ErrorBaseProps } from '../components/errors/error-overlay/error-overlay'
import type { HydrationErrorState } from '../../shared/hydration-error'
import { useActiveRuntimeError } from '../hooks/use-active-runtime-error'
import { formatCodeFrame } from '../components/code-frame/parse-code-frame'
import stripAnsi from 'next/dist/compiled/strip-ansi'

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

  return (
    <>
      <HotlinkedText text={message} matcher={matchLinkType} />
    </>
  )
}

function DynamicMetadataErrorDescription({
  variant,
}: {
  variant: 'navigation' | 'runtime'
}) {
  if (variant === 'navigation') {
    return (
      <div className="nextjs__blocking_page_load_error_description">
        <h3 className="nextjs__blocking_page_load_error_description_title">
          Data that blocks navigation was accessed inside{' '}
          <code>generateMetadata()</code> in an otherwise prerenderable page
        </h3>
        <p>
          When Document metadata is the only part of a page that cannot be
          prerendered Next.js expects you to either make it prerenderable or
          make some other part of the page non-prerenderable to avoid
          unintentional partially dynamic pages. Uncached data such as{' '}
          <code>fetch(...)</code>, cached data with a low expire time, or{' '}
          <code>connection()</code> are all examples of data that only resolve
          on navigation.
        </p>
        <h4>To fix this:</h4>
        <p className="nextjs__blocking_page_load_error_fix_option">
          <strong>
            Move the asynchronous await into a Cache Component (
            <code>"use cache"</code>)
          </strong>
          . This allows Next.js to statically prerender{' '}
          <code>generateMetadata()</code> as part of the HTML document, so it's
          instantly visible to the user.
        </p>
        <h4 className="nextjs__blocking_page_load_error_fix_option_separator">
          or
        </h4>
        <p className="nextjs__blocking_page_load_error_fix_option">
          <strong>
            add <code>connection()</code> inside a <code>{'<Suspense>'}</code>
          </strong>{' '}
          somewhere in a Page or Layout. This tells Next.js that the page is
          intended to have some non-prerenderable parts.
        </p>
        <p>
          Learn more:{' '}
          <a href="https://nextjs.org/docs/messages/next-prerender-dynamic-metadata">
            https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
          </a>
        </p>
      </div>
    )
  } else {
    return (
      <div className="nextjs__blocking_page_load_error_description">
        <h3 className="nextjs__blocking_page_load_error_description_title">
          Runtime data was accessed inside <code>generateMetadata()</code> or
          file-based metadata
        </h3>
        <p>
          When Document metadata is the only part of a page that cannot be
          prerendered Next.js expects you to either make it prerenderable or
          make some other part of the page non-prerenderable to avoid
          unintentional partially dynamic pages.
        </p>
        <h4>To fix this:</h4>
        <p className="nextjs__blocking_page_load_error_fix_option">
          <strong>
            Remove the Runtime data access from <code>generateMetadata()</code>
          </strong>
          . This allows Next.js to statically prerender{' '}
          <code>generateMetadata()</code> as part of the HTML document, so it's
          instantly visible to the user.
        </p>
        <h4 className="nextjs__blocking_page_load_error_fix_option_separator">
          or
        </h4>
        <p className="nextjs__blocking_page_load_error_fix_option">
          <strong>
            add <code>connection()</code> inside a <code>{'<Suspense>'}</code>
          </strong>{' '}
          somewhere in a Page or Layout. This tells Next.js that the page is
          intended to have some non-prerenderable parts.
        </p>
        <p>
          Note that if you are using file-based metadata, such as icons, inside
          a route with dynamic params then the only recourse is to make some
          other part of the page non-prerenderable.
        </p>
        <p>
          Learn more:{' '}
          <a href="https://nextjs.org/docs/messages/next-prerender-dynamic-metadata">
            https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
          </a>
        </p>
      </div>
    )
  }
}

function BlockingPageLoadErrorDescription({
  variant,
  refinement,
}: {
  variant: 'navigation' | 'runtime'
  refinement: '' | 'generateViewport' | 'generateMetadata'
}) {
  if (refinement === 'generateViewport') {
    if (variant === 'navigation') {
      return (
        <div className="nextjs__blocking_page_load_error_description">
          <h3 className="nextjs__blocking_page_load_error_description_title">
            Data that blocks navigation was accessed inside{' '}
            <code>generateViewport()</code>
          </h3>
          <p>
            Viewport metadata needs to be available on page load so accessing
            data that waits for a user navigation while producing it prevents
            Next.js from prerendering an initial UI. Uncached data such as{' '}
            <code>fetch(...)</code>, cached data with a low expire time, or{' '}
            <code>connection()</code> are all examples of data that only resolve
            on navigation.
          </p>
          <h4>To fix this:</h4>
          <p className="nextjs__blocking_page_load_error_fix_option">
            <strong>
              Move the asynchronous await into a Cache Component (
              <code>"use cache"</code>)
            </strong>
            . This allows Next.js to statically prerender{' '}
            <code>generateViewport()</code> as part of the HTML document, so
            it's instantly visible to the user.
          </p>
          <h4 className="nextjs__blocking_page_load_error_fix_option_separator">
            or
          </h4>
          <p className="nextjs__blocking_page_load_error_fix_option">
            <strong>
              Put a <code>{'<Suspense>'}</code> around your document{' '}
              <code>{'<body>'}</code>.
            </strong>
            This indicate to Next.js that you are opting into allowing blocking
            navigations for any page.
          </p>
          <p>
            Learn more:{' '}
            <a href="https://nextjs.org/docs/messages/next-prerender-dynamic-viewport">
              https://nextjs.org/docs/messages/next-prerender-dynamic-viewport
            </a>
          </p>
        </div>
      )
    } else {
      return (
        <div className="nextjs__blocking_page_load_error_description">
          <h3 className="nextjs__blocking_page_load_error_description_title">
            Runtime data was accessed inside <code>generateViewport()</code>
          </h3>
          <p>
            Viewport metadata needs to be available on page load so accessing
            data that comes from a user Request while producing it prevents
            Next.js from prerendering an initial UI.
            <code>cookies()</code>, <code>headers()</code>, and{' '}
            <code>searchParams</code>, are examples of Runtime data that can
            only come from a user request.
          </p>
          <h4>To fix this:</h4>
          <p className="nextjs__blocking_page_load_error_fix_option">
            <strong>Remove the Runtime data requirement</strong> from{' '}
            <code>generateViewport</code>. This allows Next.js to statically
            prerender <code>generateViewport()</code> as part of the HTML
            document, so it's instantly visible to the user.
          </p>
          <h4 className="nextjs__blocking_page_load_error_fix_option_separator">
            or
          </h4>
          <p className="nextjs__blocking_page_load_error_fix_option">
            <strong>
              Put a <code>{'<Suspense>'}</code> around your document{' '}
              <code>{'<body>'}</code>.
            </strong>
            This indicate to Next.js that you are opting into allowing blocking
            navigations for any page.
          </p>
          <p>
            <code>params</code> are usually considered Runtime data but if all
            params are provided a value using <code>generateStaticParams</code>{' '}
            they can be statically prerendered.
          </p>
          <p>
            Learn more:{' '}
            <a href="https://nextjs.org/docs/messages/next-prerender-dynamic-viewport">
              https://nextjs.org/docs/messages/next-prerender-dynamic-viewport
            </a>
          </p>
        </div>
      )
    }
  } else if (refinement === 'generateMetadata') {
    if (variant === 'navigation') {
      return (
        <div className="nextjs__blocking_page_load_error_description">
          <h3 className="nextjs__blocking_page_load_error_description_title">
            Data that blocks navigation was accessed inside{' '}
            <code>generateMetadata()</code> in an otherwise prerenderable page
          </h3>
          <p>
            When Document metadata is the only part of a page that cannot be
            prerendered Next.js expects you to either make it prerenderable or
            make some other part of the page non-prerenderable to avoid
            unintentional partially dynamic pages. Uncached data such as{' '}
            <code>fetch(...)</code>, cached data with a low expire time, or{' '}
            <code>connection()</code> are all examples of data that only resolve
            on navigation.
          </p>
          <h4>To fix this:</h4>
          <p className="nextjs__blocking_page_load_error_fix_option">
            <strong>
              Move the asynchronous await into a Cache Component (
              <code>"use cache"</code>)
            </strong>
            . This allows Next.js to statically prerender{' '}
            <code>generateMetadata()</code> as part of the HTML document, so
            it's instantly visible to the user.
          </p>
          <h4 className="nextjs__blocking_page_load_error_fix_option_separator">
            or
          </h4>
          <p className="nextjs__blocking_page_load_error_fix_option">
            <strong>
              add <code>connection()</code> inside a <code>{'<Suspense>'}</code>
            </strong>{' '}
            somewhere in a Page or Layout. This tells Next.js that the page is
            intended to have some non-prerenderable parts.
          </p>
          <p>
            Learn more:{' '}
            <a href="https://nextjs.org/docs/messages/next-prerender-dynamic-metadata">
              https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
            </a>
          </p>
        </div>
      )
    } else {
      return (
        <div className="nextjs__blocking_page_load_error_description">
          <h3 className="nextjs__blocking_page_load_error_description_title">
            Runtime data was accessed inside <code>generateMetadata()</code> or
            file-based metadata
          </h3>
          <p>
            When Document metadata is the only part of a page that cannot be
            prerendered Next.js expects you to either make it prerenderable or
            make some other part of the page non-prerenderable to avoid
            unintentional partially dynamic pages.
          </p>
          <h4>To fix this:</h4>
          <p className="nextjs__blocking_page_load_error_fix_option">
            <strong>
              Remove the Runtime data access from{' '}
              <code>generateMetadata()</code>
            </strong>
            . This allows Next.js to statically prerender{' '}
            <code>generateMetadata()</code> as part of the HTML document, so
            it's instantly visible to the user.
          </p>
          <h4 className="nextjs__blocking_page_load_error_fix_option_separator">
            or
          </h4>
          <p className="nextjs__blocking_page_load_error_fix_option">
            <strong>
              add <code>connection()</code> inside a <code>{'<Suspense>'}</code>
            </strong>{' '}
            somewhere in a Page or Layout. This tells Next.js that the page is
            intended to have some non-prerenderable parts.
          </p>
          <p>
            Note that if you are using file-based metadata, such as icons,
            inside a route with dynamic params then the only recourse is to make
            some other part of the page non-prerenderable.
          </p>
          <p>
            Learn more:{' '}
            <a href="https://nextjs.org/docs/messages/next-prerender-dynamic-metadata">
              https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
            </a>
          </p>
        </div>
      )
    }
  }

  if (variant === 'runtime') {
    return (
      <div className="nextjs__blocking_page_load_error_description">
        <h3 className="nextjs__blocking_page_load_error_description_title">
          Runtime data was accessed outside of {'<Suspense>'}
        </h3>
        <p>
          This delays the entire page from rendering, resulting in a slow user
          experience. Next.js uses this error to ensure your app loads instantly
          on every navigation. <code>cookies()</code>, <code>headers()</code>,
          and <code>searchParams</code>, are examples of Runtime data that can
          only come from a user request.
        </p>
        <h4>To fix this:</h4>
        <p className="nextjs__blocking_page_load_error_fix_option">
          <strong>Provide a fallback UI using {'<Suspense>'}</strong> around
          this component.
        </p>
        <h4 className="nextjs__blocking_page_load_error_fix_option_separator">
          or
        </h4>
        <p className="nextjs__blocking_page_load_error_fix_option">
          <strong>
            Move the Runtime data access into a deeper component wrapped in{' '}
            {'<Suspense>'}.
          </strong>
        </p>
        <p>
          In either case this allows Next.js to stream its contents to the user
          when they request the page, while still providing an initial UI that
          is prerendered and prefetchable for instant navigations.
        </p>
        <p>
          Learn more:{' '}
          <a href="https://nextjs.org/docs/messages/blocking-route">
            https://nextjs.org/docs/messages/blocking-route
          </a>
        </p>
      </div>
    )
  } else {
    return (
      <div className="nextjs__blocking_page_load_error_description">
        <h3 className="nextjs__blocking_page_load_error_description_title">
          Data that blocks navigation was accessed outside of {'<Suspense>'}
        </h3>
        <p>
          This delays the entire page from rendering, resulting in a slow user
          experience. Next.js uses this error to ensure your app loads instantly
          on every navigation. Uncached data such as <code>fetch(...)</code>,
          cached data with a low expire time, or <code>connection()</code> are
          all examples of data that only resolve on navigation.
        </p>
        <h4>To fix this, you can either:</h4>
        <p className="nextjs__blocking_page_load_error_fix_option">
          <strong>Provide a fallback UI using {'<Suspense>'}</strong> around
          this component. This allows Next.js to stream its contents to the user
          as soon as it's ready, without blocking the rest of the app.
        </p>
        <h4 className="nextjs__blocking_page_load_error_fix_option_separator">
          or
        </h4>
        <p className="nextjs__blocking_page_load_error_fix_option">
          <strong>
            Move the asynchronous await into a Cache Component (
            <code>"use cache"</code>)
          </strong>
          . This allows Next.js to statically prerender the component as part of
          the HTML document, so it's instantly visible to the user.
        </p>
        <p>
          Learn more:{' '}
          <a href="https://nextjs.org/docs/messages/blocking-route">
            https://nextjs.org/docs/messages/blocking-route
          </a>
        </p>
      </div>
    )
  }
}

export function getErrorTypeLabel(
  error: Error,
  type: ReadyRuntimeError['type'],
  errorDetails: ErrorDetails
): ErrorOverlayLayoutProps['errorType'] {
  if (errorDetails.type === 'blocking-route') {
    return `Blocking Route`
  }
  if (errorDetails.type === 'dynamic-metadata') {
    return `Ambiguous Metadata`
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
  | DynamicMetadataErrorDetails

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
  variant: 'navigation' | 'runtime'
  refinement: '' | 'generateViewport'
}

type DynamicMetadataErrorDetails = {
  type: 'dynamic-metadata'
  variant: 'navigation' | 'runtime'
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

function getBlockingRouteErrorDetails(error: Error): null | ErrorDetails {
  const isBlockingPageLoadError = error.message.includes('/blocking-route')

  if (isBlockingPageLoadError) {
    const isRuntimeData = error.message.includes('cookies()')

    return {
      type: 'blocking-route',
      variant: isRuntimeData ? 'runtime' : 'navigation',
      refinement: '',
    }
  }

  const isDynamicMetadataError = error.message.includes(
    '/next-prerender-dynamic-metadata'
  )
  if (isDynamicMetadataError) {
    const isRuntimeData = error.message.includes('cookies()')
    return {
      type: 'dynamic-metadata',
      variant: isRuntimeData ? 'runtime' : 'navigation',
    }
  }

  const isBlockingViewportError = error.message.includes(
    '/next-prerender-dynamic-viewport'
  )
  if (isBlockingViewportError) {
    const isRuntimeData = error.message.includes('cookies()')
    return {
      type: 'blocking-route',
      variant: isRuntimeData ? 'runtime' : 'navigation',
      refinement: 'generateViewport',
    }
  }

  return null
}

export function Errors({
  getSquashedHydrationErrorDetails,
  runtimeErrors,
  debugInfo,
  onClose,
  ...props
}: ErrorsProps) {
  const dialogResizerRef = useRef<HTMLDivElement | null>(null)

  const {
    isLoading,
    errorCode,
    errorType,
    activeIdx,
    errorDetails,
    activeError,
    setActiveIndex,
  } = useActiveRuntimeError({ runtimeErrors, getSquashedHydrationErrorDetails })

  // Get parsed frames data
  const frames = useFrames(activeError)

  const firstFrame = useMemo(() => {
    const firstFirstPartyFrameIndex = frames.findIndex(
      (entry) =>
        !entry.ignored &&
        Boolean(entry.originalCodeFrame) &&
        Boolean(entry.originalStackFrame)
    )

    return frames[firstFirstPartyFrameIndex] ?? null
  }, [frames])

  const generateErrorInfo = useCallback(() => {
    if (!activeError) return ''

    const parts: string[] = []

    // 1. Error Type
    if (errorType) {
      parts.push(`## Error Type\n${errorType}`)
    }

    // 2. Error Message
    const error = activeError.error
    let message = error.message
    if ('environmentName' in error && error.environmentName) {
      const envPrefix = `[ ${error.environmentName} ] `
      if (message.startsWith(envPrefix)) {
        message = message.slice(envPrefix.length)
      }
    }
    if (message) {
      parts.push(`## Error Message\n${message}`)
    }
    // Append call stack
    if (frames.length > 0) {
      const visibleFrames = frames.filter((frame) => !frame.ignored)
      if (visibleFrames.length > 0) {
        const stackLines = visibleFrames
          .map((frame) => {
            if (frame.originalStackFrame) {
              const { methodName, file, line1, column1 } =
                frame.originalStackFrame
              return `    at ${methodName} (${file}:${line1}:${column1})`
            } else if (frame.sourceStackFrame) {
              const { methodName, file, line1, column1 } =
                frame.sourceStackFrame
              return `    at ${methodName} (${file}:${line1}:${column1})`
            }
            return ''
          })
          .filter(Boolean)

        if (stackLines.length > 0) {
          parts.push(`\n${stackLines.join('\n')}`)
        }
      }
    }

    // 3. Code Frame (decoded)
    if (firstFrame?.originalCodeFrame) {
      const decodedCodeFrame = stripAnsi(
        formatCodeFrame(firstFrame.originalCodeFrame)
      )
      parts.push(`## Code Frame\n${decodedCodeFrame}`)
    }

    // Format as markdown error info
    const errorInfo = `${parts.join('\n\n')}

Next.js version: ${props.versionInfo.installed} (${process.env.__NEXT_BUNDLER})\n`

    return errorInfo
  }, [activeError, errorType, firstFrame, frames, props.versionInfo])

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
      errorMessage = (
        <BlockingPageLoadErrorDescription
          variant={errorDetails.variant}
          refinement={errorDetails.refinement}
        />
      )
      break
    case 'dynamic-metadata':
      errorMessage = (
        <DynamicMetadataErrorDescription variant={errorDetails.variant} />
      )
      break
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
      onClose={isServerError ? undefined : onClose}
      debugInfo={debugInfo}
      error={error}
      runtimeErrors={runtimeErrors}
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
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .error-overlay-notes-container {
    margin: 8px 2px;
  }
  .error-overlay-notes-container p {
    white-space: pre-wrap;
  }
  .nextjs__blocking_page_load_error_description {
    color: var(--color-stack-notes);
  }
  .nextjs__blocking_page_load_error_description_title {
    color: var(--color-title-color);
  }
  .nextjs__blocking_page_load_error_fix_option {
    background-color: var(--color-background-200);
    padding: 14px;
    border-radius: var(--rounded-md-2);
    border: 1px solid var(--color-gray-alpha-400);
  }
  .external-link, .external-link:hover {
    color:inherit;
  }
`

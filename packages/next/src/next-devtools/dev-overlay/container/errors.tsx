import { useMemo, useRef, Suspense, useCallback } from 'react'
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

function isNextjsLink(text: string): boolean {
  return text.startsWith('https://nextjs.org')
}

function HydrationErrorDescription({ message }: { message: string }) {
  return <HotlinkedText text={message} matcher={isNextjsLink} />
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
      <HotlinkedText text={message} matcher={isNextjsLink} />
    </>
  )
}

export function getErrorTypeLabel(
  error: Error,
  type: ReadyRuntimeError['type']
): ErrorOverlayLayoutProps['errorType'] {
  if (type === 'recoverable') {
    return `Recoverable ${error.name}`
  }
  if (type === 'console') {
    return `Console ${error.name}`
  }
  return `Runtime ${error.name}`
}

const noErrorDetails = {
  hydrationWarning: null,
  notes: null,
  reactOutputComponentDiff: null,
}
export function useErrorDetails(
  error: Error | undefined,
  getSquashedHydrationErrorDetails: (error: Error) => HydrationErrorState | null
): {
  hydrationWarning: string | null
  notes: string | null
  reactOutputComponentDiff: string | null
} {
  return useMemo(() => {
    if (error === undefined) {
      return noErrorDetails
    }

    const pagesRouterErrorDetails = getSquashedHydrationErrorDetails(error)
    if (pagesRouterErrorDetails !== null) {
      return {
        hydrationWarning: pagesRouterErrorDetails.warning ?? null,
        notes: null,
        reactOutputComponentDiff:
          pagesRouterErrorDetails.reactOutputComponentDiff ?? null,
      }
    }

    if (!isHydrationError(error)) {
      return noErrorDetails
    }

    const { message, notes, diff } = getHydrationErrorStackInfo(error)
    if (message === null) {
      return noErrorDetails
    }

    return {
      hydrationWarning: message,
      notes,
      reactOutputComponentDiff: diff,
    }
  }, [error, getSquashedHydrationErrorDetails])
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
    notes,
    hydrationWarning,
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

  return (
    <ErrorOverlayLayout
      errorCode={errorCode}
      errorType={errorType}
      errorMessage={
        hydrationWarning ? (
          <HydrationErrorDescription message={hydrationWarning} />
        ) : (
          <GenericErrorDescription error={error} />
        )
      }
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
      <div className="error-overlay-notes-container">
        {notes ? (
          <>
            <p
              id="nextjs__container_errors__notes"
              className="nextjs__container_errors__notes"
            >
              {notes}
            </p>
          </>
        ) : null}
        {hydrationWarning ? (
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

      {errorDetails.reactOutputComponentDiff ? (
        <PseudoHtmlDiff
          reactOutputComponentDiff={errorDetails.reactOutputComponentDiff || ''}
        />
      ) : null}
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
`

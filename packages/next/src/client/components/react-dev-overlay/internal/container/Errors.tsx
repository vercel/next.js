import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ACTION_UNHANDLED_ERROR,
  ACTION_UNHANDLED_REJECTION,
} from '../../app/error-overlay-reducer'
import type {
  UnhandledErrorAction,
  UnhandledRejectionAction,
} from '../../app/error-overlay-reducer'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
} from '../components/Dialog'
import { LeftRightDialogHeader } from '../components/LeftRightDialogHeader'
import { Overlay } from '../components/Overlay'
import { Toast } from '../components/Toast'
import { getErrorByType } from '../helpers/getErrorByType'
import type { ReadyRuntimeError } from '../helpers/getErrorByType'
import { noop as css } from '../helpers/noop-template'
import { CloseIcon } from '../icons/CloseIcon'
import { RuntimeError } from './RuntimeError'
import { VersionStalenessInfo } from '../components/VersionStalenessInfo'
import type { VersionInfo } from '../../../../../server/dev/parse-version-info'
import { getErrorSource } from '../../../../../shared/lib/error-source'
import { HotlinkedText } from '../components/hot-linked-text'
import { PseudoHtmlDiff } from './RuntimeError/component-stack-pseudo-html'
import {
  isHtmlTagsWarning,
  type HydrationErrorState,
} from '../helpers/hydration-error-info'

export type SupportedErrorEvent = {
  id: number
  event: UnhandledErrorAction | UnhandledRejectionAction
}
export type ErrorsProps = {
  isAppDir: boolean
  errors: SupportedErrorEvent[]
  initialDisplayState: DisplayState
  versionInfo?: VersionInfo
}

type ReadyErrorEvent = ReadyRuntimeError

type DisplayState = 'minimized' | 'fullscreen' | 'hidden'

function getErrorSignature(ev: SupportedErrorEvent): string {
  const { event } = ev
  switch (event.type) {
    case ACTION_UNHANDLED_ERROR:
    case ACTION_UNHANDLED_REJECTION: {
      return `${event.reason.name}::${event.reason.message}::${event.reason.stack}`
    }
    default: {
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _: never = event
  return ''
}

export function Errors({
  isAppDir,
  errors,
  initialDisplayState,
  versionInfo,
}: ErrorsProps) {
  const [lookups, setLookups] = useState(
    {} as { [eventId: string]: ReadyErrorEvent }
  )

  const [readyErrors, nextError] = useMemo<
    [ReadyErrorEvent[], SupportedErrorEvent | null]
  >(() => {
    let ready: ReadyErrorEvent[] = []
    let next: SupportedErrorEvent | null = null

    // Ensure errors are displayed in the order they occurred in:
    for (let idx = 0; idx < errors.length; ++idx) {
      const e = errors[idx]
      const { id } = e
      if (id in lookups) {
        ready.push(lookups[id])
        continue
      }

      // Check for duplicate errors
      if (idx > 0) {
        const prev = errors[idx - 1]
        if (getErrorSignature(prev) === getErrorSignature(e)) {
          continue
        }
      }

      next = e
      break
    }

    return [ready, next]
  }, [errors, lookups])

  const isLoading = useMemo<boolean>(() => {
    return readyErrors.length < 1 && Boolean(errors.length)
  }, [errors.length, readyErrors.length])

  useEffect(() => {
    if (nextError == null) {
      return
    }
    let mounted = true

    getErrorByType(nextError, isAppDir).then(
      (resolved) => {
        // We don't care if the desired error changed while we were resolving,
        // thus we're not tracking it using a ref. Once the work has been done,
        // we'll store it.
        if (mounted) {
          setLookups((m) => ({ ...m, [resolved.id]: resolved }))
        }
      },
      () => {
        // TODO: handle this, though an edge case
      }
    )

    return () => {
      mounted = false
    }
  }, [nextError, isAppDir])

  const [displayState, setDisplayState] =
    useState<DisplayState>(initialDisplayState)
  const [activeIdx, setActiveIndex] = useState<number>(0)
  const previous = useCallback(
    () => setActiveIndex((v) => Math.max(0, v - 1)),
    []
  )
  const next = useCallback(
    () =>
      setActiveIndex((v) =>
        Math.max(0, Math.min(readyErrors.length - 1, v + 1))
      ),
    [readyErrors.length]
  )

  const activeError = useMemo<ReadyErrorEvent | null>(
    () => readyErrors[activeIdx] ?? null,
    [activeIdx, readyErrors]
  )

  // Reset component state when there are no errors to be displayed.
  // This should never happen, but lets handle it.
  useEffect(() => {
    if (errors.length < 1) {
      setLookups({})
      setDisplayState('hidden')
      setActiveIndex(0)
    }
  }, [errors.length])

  const minimize = useCallback(() => setDisplayState('minimized'), [])
  const hide = useCallback(() => setDisplayState('hidden'), [])
  const fullscreen = useCallback(() => setDisplayState('fullscreen'), [])

  // This component shouldn't be rendered with no errors, but if it is, let's
  // handle it gracefully by rendering nothing.
  if (errors.length < 1 || activeError == null) {
    return null
  }

  if (isLoading) {
    // TODO: better loading state
    return <Overlay />
  }

  if (displayState === 'hidden') {
    return null
  }

  if (displayState === 'minimized') {
    return (
      <Toast className="nextjs-toast-errors-parent" onClick={fullscreen}>
        <div className="nextjs-toast-errors">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>
            {readyErrors.length} error{readyErrors.length > 1 ? 's' : ''}
          </span>
          <button
            data-nextjs-toast-errors-hide-button
            className="nextjs-toast-errors-hide-button"
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              hide()
            }}
            aria-label="Hide Errors"
          >
            <CloseIcon />
          </button>
        </div>
      </Toast>
    )
  }

  const error = activeError.error
  const isServerError = ['server', 'edge-server'].includes(
    getErrorSource(error) || ''
  )

  const errorDetails: HydrationErrorState = (error as any).details || {}
  const [warningTemplate, serverContent, clientContent] =
    errorDetails.warning || [null, '', '']

  const isHtmlTagsWarningTemplate = isHtmlTagsWarning(warningTemplate)
  const hydrationWarning = warningTemplate
    ? warningTemplate
        .replace('%s', serverContent)
        .replace('%s', clientContent)
        .replace('%s', '') // remove the last %s for stack
        .replace(/^Warning: /, '')
    : null

  return (
    <Overlay>
      <Dialog
        type="error"
        aria-labelledby="nextjs__container_errors_label"
        aria-describedby="nextjs__container_errors_desc"
        onClose={isServerError ? undefined : minimize}
      >
        <DialogContent>
          <DialogHeader className="nextjs-container-errors-header">
            <LeftRightDialogHeader
              previous={activeIdx > 0 ? previous : null}
              next={activeIdx < readyErrors.length - 1 ? next : null}
              close={isServerError ? undefined : minimize}
            >
              <small>
                <span>{activeIdx + 1}</span> of{' '}
                <span data-nextjs-dialog-header-total-count>
                  {readyErrors.length}
                </span>{' '}
                unhandled error
                {readyErrors.length < 2 ? '' : 's'}
              </small>
              {versionInfo ? <VersionStalenessInfo {...versionInfo} /> : null}
            </LeftRightDialogHeader>
            <h1 id="nextjs__container_errors_label">
              {isServerError ? 'Server Error' : 'Unhandled Runtime Error'}
            </h1>
            <p
              id="nextjs__container_errors_desc"
              className="nextjs__container_errors_desc nextjs__container_errors_desc--error"
            >
              {error.name}: <HotlinkedText text={error.message} />
            </p>
            {hydrationWarning && activeError.componentStackFrames && (
              <>
                <p id="nextjs__container_errors__extra">{hydrationWarning}</p>
                <PseudoHtmlDiff
                  className="nextjs__container_errors__extra_code"
                  hydrationMismatchType={
                    isHtmlTagsWarningTemplate ? 'tag' : 'text'
                  }
                  componentStackFrames={activeError.componentStackFrames}
                  serverContent={serverContent}
                  clientContent={clientContent}
                />
              </>
            )}
            {isServerError ? (
              <div>
                <small>
                  This error happened while generating the page. Any console
                  logs will be displayed in the terminal window.
                </small>
              </div>
            ) : undefined}
          </DialogHeader>
          <DialogBody className="nextjs-container-errors-body">
            <RuntimeError key={activeError.id.toString()} error={activeError} />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </Overlay>
  )
}

export const styles = css`
  .nextjs-container-errors-header > h1 {
    font-size: var(--size-font-big);
    line-height: var(--size-font-bigger);
    font-weight: bold;
    margin: 0;
    margin-top: calc(var(--size-gap-double) + var(--size-gap-half));
  }
  .nextjs-container-errors-header small {
    font-size: var(--size-font-small);
    color: var(--color-accents-1);
    margin-left: var(--size-gap-double);
  }
  .nextjs-container-errors-header small > span {
    font-family: var(--font-stack-monospace);
  }
  .nextjs-container-errors-header p {
    font-family: var(--font-stack-monospace);
    font-size: var(--size-font-small);
    line-height: var(--size-font-big);
    font-weight: bold;
    margin: 0;
    margin-top: var(--size-gap-half);
    white-space: pre-wrap;
  }
  .nextjs__container_errors_desc--error {
    color: var(--color-ansi-red);
  }
  .nextjs__container_errors__extra {
    margin: 20px 0;
  }
  nextjs__container_errors__extra__code {
    margin: 10px 0;
  }
  .nextjs-container-errors-header > div > small {
    margin: 0;
    margin-top: var(--size-gap-half);
  }
  .nextjs-container-errors-header > p > a {
    color: var(--color-ansi-red);
  }

  .nextjs-container-errors-body > h2:not(:first-child) {
    margin-top: calc(var(--size-gap-double) + var(--size-gap));
  }
  .nextjs-container-errors-body > h2 {
    margin-bottom: var(--size-gap);
    font-size: var(--size-font-big);
  }
  .nextjs__container_errors__extra_code {
    margin: 20px 0;
    padding: 12px 32px;
    color: var(--color-ansi-fg);
    background: var(--color-ansi-bg);
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
    margin-right: var(--size-gap);
  }
  .nextjs-toast-errors-hide-button {
    margin-left: var(--size-gap-triple);
    border: none;
    background: none;
    color: var(--color-ansi-bright-white);
    padding: 0;
    transition: opacity 0.25s ease;
    opacity: 0.7;
  }
  .nextjs-toast-errors-hide-button:hover {
    opacity: 1;
  }
`

import * as React from 'react'
import { noop as css } from '../../helpers/noop-template'

function useCopyLegacy(content: string) {
  type CopyState =
    | {
        state: 'initial'
      }
    | {
        state: 'error'
        error: unknown
      }
    | { state: 'success' }
    | { state: 'pending' }

  // This would be simpler with useActionState but we need to support React 18 here.
  // React 18 also doesn't have async transitions.
  const [copyState, dispatch] = React.useReducer(
    (
      state: CopyState,
      action:
        | { type: 'reset' | 'copied' | 'copying' }
        | { type: 'error'; error: unknown }
    ): CopyState => {
      if (action.type === 'reset') {
        return { state: 'initial' }
      }
      if (action.type === 'copied') {
        return { state: 'success' }
      }
      if (action.type === 'copying') {
        return { state: 'pending' }
      }
      if (action.type === 'error') {
        return { state: 'error', error: action.error }
      }
      return state
    },
    {
      state: 'initial',
    }
  )
  function copy() {
    if (isPending) {
      return
    }

    if (!navigator.clipboard) {
      dispatch({
        type: 'error',
        error: new Error('Copy to clipboard is not supported in this browser'),
      })
    } else {
      dispatch({ type: 'copying' })
      navigator.clipboard.writeText(content).then(
        () => {
          dispatch({ type: 'copied' })
        },
        (error) => {
          dispatch({ type: 'error', error })
        }
      )
    }
  }
  const reset = React.useCallback(() => {
    dispatch({ type: 'reset' })
  }, [])

  const isPending = copyState.state === 'pending'

  return [copyState, copy, reset, isPending] as const
}

function useCopyModern(content: string) {
  type CopyState =
    | {
        state: 'initial'
      }
    | {
        state: 'error'
        error: unknown
      }
    | { state: 'success' }

  const [copyState, dispatch, isPending] = React.useActionState(
    (
      state: CopyState,
      action: 'reset' | 'copy'
    ): CopyState | Promise<CopyState> => {
      if (action === 'reset') {
        return { state: 'initial' }
      }
      if (action === 'copy') {
        if (!navigator.clipboard) {
          return {
            state: 'error',
            error: new Error(
              'Copy to clipboard is not supported in this browser'
            ),
          }
        }
        return navigator.clipboard.writeText(content).then(
          () => {
            return { state: 'success' }
          },
          (error) => {
            return { state: 'error', error }
          }
        )
      }
      return state
    },
    {
      state: 'initial',
    }
  )

  function copy() {
    React.startTransition(() => {
      dispatch('copy')
    })
  }

  const reset = React.useCallback(() => {
    dispatch('reset')
  }, [
    // TODO: `dispatch` from `useActionState` is not reactive.
    // Remove from dependencies once https://github.com/facebook/react/pull/29665 is released.
    dispatch,
  ])

  return [copyState, copy, reset, isPending] as const
}

const useCopy =
  typeof React.useActionState === 'function' ? useCopyModern : useCopyLegacy

export function CopyButton({
  actionLabel,
  successLabel,
  content,
  icon,
  disabled,
  ...props
}: React.HTMLProps<HTMLButtonElement> & {
  actionLabel: string
  successLabel: string
  content: string
  icon?: React.ReactNode
}) {
  const [copyState, copy, reset, isPending] = useCopy(content)

  const error = copyState.state === 'error' ? copyState.error : null
  React.useEffect(() => {
    if (error !== null) {
      // Additional console.error to get the stack.
      console.error(error)
    }
  }, [error])
  React.useEffect(() => {
    if (copyState.state === 'success') {
      const timeoutId = setTimeout(() => {
        reset()
      }, 2000)

      return () => {
        clearTimeout(timeoutId)
      }
    }
  }, [isPending, copyState.state, reset])
  const isDisabled = isPending || disabled
  const label = copyState.state === 'success' ? successLabel : actionLabel

  // Assign default icon
  const renderedIcon =
    copyState.state === 'success' ? <CopySuccessIcon /> : icon || <CopyIcon />

  return (
    <button
      {...props}
      type="button"
      title={label}
      aria-label={label}
      aria-disabled={isDisabled}
      disabled={isDisabled}
      data-nextjs-data-runtime-error-copy-button
      className={`${props.className || ''} nextjs-data-runtime-error-copy-button nextjs-data-runtime-error-copy-button--${copyState.state}`}
      onClick={() => {
        if (!isDisabled) {
          copy()
        }
      }}
    >
      {renderedIcon}
      {copyState.state === 'error' ? ` ${copyState.error}` : null}
    </button>
  )
}

function CopyIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="error-overlay-toolbar-button-icon"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.75 0.5C1.7835 0.5 1 1.2835 1 2.25V9.75C1 10.7165 1.7835 11.5 2.75 11.5H3.75H4.5V10H3.75H2.75C2.61193 10 2.5 9.88807 2.5 9.75V2.25C2.5 2.11193 2.61193 2 2.75 2H8.25C8.38807 2 8.5 2.11193 8.5 2.25V3H10V2.25C10 1.2835 9.2165 0.5 8.25 0.5H2.75ZM7.75 4.5C6.7835 4.5 6 5.2835 6 6.25V13.75C6 14.7165 6.7835 15.5 7.75 15.5H13.25C14.2165 15.5 15 14.7165 15 13.75V6.25C15 5.2835 14.2165 4.5 13.25 4.5H7.75ZM7.5 6.25C7.5 6.11193 7.61193 6 7.75 6H13.25C13.3881 6 13.5 6.11193 13.5 6.25V13.75C13.5 13.8881 13.3881 14 13.25 14H7.75C7.61193 14 7.5 13.8881 7.5 13.75V6.25Z"
        fill="currentColor"
      />
    </svg>
  )
}

function CopySuccessIcon() {
  return (
    <svg
      height="16"
      xlinkTitle="copied"
      viewBox="0 0 16 16"
      width="16"
      stroke="currentColor"
      fill="currentColor"
    >
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
    </svg>
  )
}

// TODO(jiwon): Is not used anymore, should we decouple the styles?
export const COPY_BUTTON_STYLES = css`
  [data-nextjs-data-runtime-error-copy-button],
  [data-nextjs-data-runtime-error-copy-button]:focus:not(:focus-visible) {
    position: relative;
    margin-left: var(--size-gap);
    padding: 0;
    border: none;
    background: none;
    outline: none;
  }
  [data-nextjs-data-runtime-error-copy-button] > svg {
    vertical-align: middle;
  }
  .nextjs-data-runtime-error-copy-button {
    color: inherit;
  }
  .nextjs-data-runtime-error-copy-button--initial:hover {
    cursor: pointer;
  }
  .nextjs-data-runtime-error-copy-button[aria-disabled='true'] {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .nextjs-data-runtime-error-copy-button--error,
  .nextjs-data-runtime-error-copy-button--error:hover {
    color: var(--color-ansi-red);
  }
  .nextjs-data-runtime-error-copy-button--success {
    color: var(--color-ansi-green);
  }
`

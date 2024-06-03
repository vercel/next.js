import * as React from 'react'

type CopyState =
  | {
      state: 'initial'
    }
  | {
      state: 'error'
      error: unknown
    }
  | { state: 'success' }

export function CopyButton({
  actionLabel,
  successLabel,
  content,
  ...props
}: React.HTMLProps<HTMLButtonElement> & {
  actionLabel: string
  successLabel: string
  content: string
}) {
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
        dispatch('reset')
      }, 2000)

      return () => {
        clearTimeout(timeoutId)
      }
    }
  }, [
    isPending,
    copyState.state,
    // TODO: `dispatch` from `useActionState` is not reactive.
    // Remove from dependencies once https://github.com/facebook/react/pull/29665 is released.
    dispatch,
  ])
  const isDisabled = isPending
  const label = copyState.state === 'success' ? successLabel : actionLabel
  const title = label
  const icon =
    copyState.state === 'success' ? <CopySuccessIcon /> : <CopyIcon />

  return (
    <button
      {...props}
      type="button"
      title={title}
      aria-label={label}
      aria-disabled={isDisabled}
      data-nextjs-data-runtime-error-copy-stack
      className={`nextjs-data-runtime-error-copy-stack nextjs-data-runtime-error-copy-stack--${copyState.state}`}
      onClick={() => {
        if (!isDisabled) {
          React.startTransition(() => {
            dispatch('copy')
          })
        }
      }}
    >
      {icon}
      {copyState.state === 'error' ? ` ${copyState.error}` : null}
    </button>
  )
}

function CopyIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="transparent"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
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

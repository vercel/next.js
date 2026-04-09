import * as React from 'react'
import { cx } from '../../utils/cx'

function useCopy(getContent: () => Promise<string>) {
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
            error: 'Copy to clipboard is not supported in this browser',
          }
        }
        return getContent().then((content) => {
          return navigator.clipboard.writeText(content).then(
            () => {
              return { state: 'success' }
            },
            (error) => {
              return { state: 'error', error }
            }
          )
        })
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

type CopyButtonProps = React.HTMLProps<HTMLButtonElement> & {
  actionLabel: string
  successLabel: string
  icon?: React.ReactNode
}

export function CopyButton(
  props: CopyButtonProps & {
    content?: string
    getContent?: () => Promise<string>
  }
) {
  const {
    content,
    getContent,
    actionLabel,
    successLabel,
    icon,
    disabled,
    ...rest
  } = props
  const getContentString = (): Promise<string> => {
    if (content) {
      return Promise.resolve(content)
    }
    if (getContent) {
      return getContent()
    }
    return Promise.resolve('')
  }
  const [copyState, copy, reset, isPending] = useCopy(getContentString)

  const error = copyState.state === 'error' ? copyState.error : null
  React.useEffect(() => {
    if (error !== null) {
      // Only log warning in terminal to avoid showing in the error overlay.
      // When it's errored, the copy button will be disabled.
      console.warn(error)
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
  const isDisabled = !navigator.clipboard || isPending || disabled || !!error
  const label = copyState.state === 'success' ? successLabel : actionLabel

  // Assign default icon
  const renderedIcon =
    copyState.state === 'success' ? (
      <CopySuccessIcon />
    ) : (
      icon || (
        <CopyIcon
          width={14}
          height={14}
          className="error-overlay-toolbar-button-icon"
        />
      )
    )

  return (
    <>
      <button
        {...rest}
        type="button"
        title={label}
        aria-label={label}
        aria-disabled={isDisabled}
        data-nextjs-copy-button
        data-pending={isPending}
        className={cx(
          props.className,
          'nextjs-data-copy-button',
          `nextjs-data-copy-button--${copyState.state}`
        )}
        onClick={() => {
          if (!isDisabled) {
            copy()
          }
        }}
      >
        {renderedIcon}
        {copyState.state === 'error' ? ` ${copyState.error}` : null}
      </button>
      <button
        type="button"
        className="cursor-fix-button"
        title="Fix in Cursor"
        aria-label="Fix in Cursor"
        onClick={() => {
          getContentString().then((text) => {
            window.location.href =
              'cursor://anysphere.cursor-deeplink/prompt?text=' +
              encodeURIComponent('Fix this Next.js error. Look at the relevant source files and fix the root cause:\n\n' + text)
          })
        }}
      >
        <CursorIcon />
      </button>
    </>
  )
}

function CopyIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.406.438c-.845 0-1.531.685-1.531 1.53v6.563c0 .846.686 1.531 1.531 1.531H3.937V8.75H2.406a.219.219 0 0 1-.219-.219V1.97c0-.121.098-.219.22-.219h4.812c.12 0 .218.098.218.219v.656H8.75v-.656c0-.846-.686-1.532-1.531-1.532H2.406zm4.375 3.5c-.845 0-1.531.685-1.531 1.53v6.563c0 .846.686 1.531 1.531 1.531h4.813c.845 0 1.531-.685 1.531-1.53V5.468c0-.846-.686-1.532-1.531-1.532H6.78zm-.218 1.53c0-.12.097-.218.218-.218h4.813c.12 0 .219.098.219.219v6.562c0 .121-.098.219-.22.219H6.782a.219.219 0 0 1-.218-.219V5.47z"
        fill="currentColor"
      />
    </svg>
  )
}

function CursorIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 466.73 533.32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path fill="#72716d" d="M233.37,266.66l231.16,133.46c-1.42,2.46-3.48,4.56-6.03,6.03l-216.06,124.74c-5.61,3.24-12.53,3.24-18.14,0L8.24,406.15c-2.55-1.47-4.61-3.57-6.03-6.03l231.16-133.46h0Z" />
      <path fill="#55544f" d="M233.37,0v266.66L2.21,400.12c-1.42-2.46-2.21-5.3-2.21-8.24v-250.44c0-5.89,3.14-11.32,8.24-14.27L224.29,2.43c2.81-1.62,5.94-2.43,9.07-2.43h.01Z" />
      <path fill="#43413c" d="M464.52,133.2c-1.42-2.46-3.48-4.56-6.03-6.03L242.43,2.43c-2.8-1.62-5.93-2.43-9.06-2.43v266.66l231.16,133.46c1.42-2.46,2.21-5.3,2.21-8.24v-250.44c0-2.95-.78-5.77-2.21-8.24h-.01Z" />
      <path fill="#d6d5d2" d="M448.35,142.54c1.31,2.26,1.49,5.16,0,7.74l-209.83,363.42c-1.41,2.46-5.16,1.45-5.16-1.38v-239.48c0-1.91-.51-3.75-1.44-5.36l216.42-124.95h.01Z" />
      <path fill="#ffffff" d="M448.35,142.54l-216.42,124.95c-.92-1.6-2.26-2.96-3.92-3.92L20.62,143.83c-2.46-1.41-1.45-5.16,1.38-5.16h419.65c2.98,0,5.4,1.61,6.7,3.87Z" />
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

export const COPY_BUTTON_STYLES = `
  .nextjs-data-copy-button {
    color: inherit;

    svg {
      width: var(--size-16);
      height: var(--size-16);
    }
  }
  .nextjs-data-copy-button[aria-disabled="true"] {
    background-color: var(--color-gray-100);
    cursor: not-allowed;
  }
  .nextjs-data-copy-button[data-pending="true"] {
    cursor: wait;
  }
  .nextjs-data-copy-button--initial:hover:not([aria-disabled="true"]) {
    cursor: pointer;
  }
  .nextjs-data-copy-button--error:not([aria-disabled="true"]),
  .nextjs-data-copy-button--error:hover:not([aria-disabled="true"]) {
    color: var(--color-ansi-red);
  }
  .nextjs-data-copy-button--success:not([aria-disabled="true"]) {
    color: var(--color-ansi-green);
  }
`

export const CURSOR_FIX_BUTTON_STYLES = `
  .cursor-fix-button {
    display: flex;
    justify-content: center;
    align-items: center;
    width: var(--size-28);
    height: var(--size-28);
    background: var(--color-background-100);
    background-clip: padding-box;
    border: 1px solid var(--color-gray-alpha-400);
    box-shadow: var(--shadow-small);
    border-radius: var(--rounded-full);

    svg {
      width: var(--size-14);
      height: var(--size-14);
    }

    &:focus {
      outline: var(--focus-ring);
    }

    &:hover {
      background: var(--color-gray-alpha-100);
      cursor: pointer;
    }

    &:active {
      background: var(--color-gray-alpha-200);
    }
  }
`

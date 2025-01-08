import type { ReadyRuntimeError } from '../../helpers/get-error-by-type'

import { useMemo } from 'react'
import { CodeFrame } from '../../components/CodeFrame'
import { CallStack } from '../../components/Errors/call-stack/call-stack'
import { noop as css } from '../../helpers/noop-template'

export type RuntimeErrorProps = { error: ReadyRuntimeError }

export function RuntimeError({ error }: RuntimeErrorProps) {
  const { firstFrame } = useMemo(() => {
    const firstFirstPartyFrameIndex = error.frames.findIndex(
      (entry) =>
        !entry.ignored &&
        Boolean(entry.originalCodeFrame) &&
        Boolean(entry.originalStackFrame)
    )

    return {
      firstFrame: error.frames[firstFirstPartyFrameIndex] ?? null,
    }
  }, [error.frames])

  return (
    <>
      {firstFrame && (
        <CodeFrame
          stackFrame={firstFrame.originalStackFrame!}
          codeFrame={firstFrame.originalCodeFrame!}
        />
      )}

      <CallStack frames={error.frames} />
    </>
  )
}

export const styles = css`
  [data-nextjs-call-stack-frame]:not(:last-child),
  [data-nextjs-component-stack-frame]:not(:last-child) {
    margin-bottom: var(--size-gap-double);
  }

  [data-expand-ignore-button]:focus:not(:focus-visible),
  [data-expand-ignore-button] {
    background: none;
    border: none;
    color: var(--color-font);
    cursor: pointer;
    font-size: var(--size-font);
    margin: var(--size-gap) 0;
    padding: 0;
    text-decoration: underline;
    outline: none;
  }

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

  [data-nextjs-call-stack-frame] > h3,
  [data-nextjs-component-stack-frame] > h3 {
    margin-top: 0;
    margin-bottom: 0;
    font-family: var(--font-stack-monospace);
    font-size: var(--size-font);
  }
  [data-nextjs-call-stack-frame] > h3[data-nextjs-frame-expanded='false'] {
    color: #666;
    display: inline-block;
  }
  [data-nextjs-call-stack-frame] > div,
  [data-nextjs-component-stack-frame] > div {
    display: flex;
    align-items: center;
    padding-left: calc(var(--size-gap) + var(--size-gap-half));
    font-size: var(--size-font-small);
    color: #999;
  }
  [data-nextjs-call-stack-frame] > div > svg,
  [data-nextjs-component-stack-frame] > [role='link'] > svg {
    width: auto;
    height: var(--size-font-small);
    margin-left: var(--size-gap);
    flex-shrink: 0;
    display: none;
  }

  [data-nextjs-call-stack-frame] > div[data-has-source],
  [data-nextjs-component-stack-frame] > [role='link'] {
    cursor: pointer;
  }
  [data-nextjs-call-stack-frame] > div[data-has-source]:hover,
  [data-nextjs-component-stack-frame] > [role='link']:hover {
    text-decoration: underline dotted;
  }
  [data-nextjs-call-stack-frame] > div[data-has-source] > svg,
  [data-nextjs-component-stack-frame] > [role='link'] > svg {
    display: unset;
  }

  [data-nextjs-call-stack-framework-icon] {
    margin-right: var(--size-gap);
  }
  [data-nextjs-call-stack-framework-icon='next'] > mask {
    mask-type: alpha;
  }
  [data-nextjs-call-stack-framework-icon='react'] {
    color: rgb(20, 158, 202);
  }
  [data-nextjs-collapsed-call-stack-details][open]
    [data-nextjs-call-stack-chevron-icon] {
    transform: rotate(90deg);
  }
  [data-nextjs-collapsed-call-stack-details] summary {
    display: flex;
    align-items: center;
    margin-bottom: var(--size-gap);
    list-style: none;
  }
  [data-nextjs-collapsed-call-stack-details] summary::-webkit-details-marker {
    display: none;
  }

  [data-nextjs-collapsed-call-stack-details] h3 {
    color: #666;
  }
  [data-nextjs-collapsed-call-stack-details] [data-nextjs-call-stack-frame] {
    margin-bottom: var(--size-gap-double);
  }

  [data-nextjs-container-errors-pseudo-html] {
    position: relative;
  }
  [data-nextjs-container-errors-pseudo-html-collapse] {
    position: absolute;
    left: 10px;
    top: 10px;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
  }
  [data-nextjs-container-errors-pseudo-html--diff='add'] {
    color: var(--color-ansi-green);
  }
  [data-nextjs-container-errors-pseudo-html--diff='remove'] {
    color: var(--color-ansi-red);
  }
  [data-nextjs-container-errors-pseudo-html--tag-error] {
    color: var(--color-ansi-red);
    font-weight: bold;
  }
  /* hide but text are still accessible in DOM */
  [data-nextjs-container-errors-pseudo-html--hint] {
    display: inline-block;
    font-size: 0;
  }
  [data-nextjs-container-errors-pseudo-html--tag-adjacent='false'] {
    color: var(--color-accents-1);
  }
`

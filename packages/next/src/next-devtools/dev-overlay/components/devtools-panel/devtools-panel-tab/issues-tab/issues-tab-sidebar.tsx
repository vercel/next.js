import type { ReadyRuntimeError } from '../../../../utils/get-error-by-type'

import { Suspense, useMemo, memo } from 'react'

import { css } from '../../../../utils/css'
import { getFrameSource } from '../../../../../shared/stack-frame'
import { useFrames } from '../../../../utils/get-error-by-type'
import { getErrorTypeLabel } from '../../../../container/errors'
import { IssuesTabSidebarFrameSkeleton } from './issues-tab-sidebar-frame-skeleton'

export function IssuesTabSidebar({
  runtimeErrors,
  activeIdx,
  setActiveIndex,
}: {
  runtimeErrors: ReadyRuntimeError[]
  errorType: string | null
  activeIdx: number
  setActiveIndex: (idx: number) => void
}) {
  if (runtimeErrors.length === 0) {
    return null
  }

  return (
    <aside data-nextjs-devtools-panel-tab-issues-sidebar>
      {runtimeErrors.map((runtimeError, idx) => {
        const isActive = idx === activeIdx
        return (
          <IssuesTabSidebarFrame
            key={idx}
            runtimeError={runtimeError}
            idx={idx}
            isActive={isActive}
            setActiveIndex={setActiveIndex}
          />
        )
      })}
    </aside>
  )
}

const IssuesTabSidebarFrameItem = memo(function IssuesTabSidebarFrameItem({
  runtimeError,
}: {
  runtimeError: ReadyRuntimeError
}) {
  const frames = useFrames(runtimeError)

  const firstFrame = useMemo(() => {
    const firstFirstPartyFrameIndex = frames.findIndex(
      (entry) =>
        !entry.ignored &&
        Boolean(entry.originalCodeFrame) &&
        Boolean(entry.originalStackFrame)
    )

    return frames[firstFirstPartyFrameIndex] ?? null
  }, [frames])

  if (!firstFrame?.originalStackFrame) {
    return null
  }

  const errorType = getErrorTypeLabel(runtimeError.error, runtimeError.type)
  const frameSource = getFrameSource(firstFrame.originalStackFrame)

  return (
    <>
      <span data-nextjs-devtools-panel-tab-issues-sidebar-frame-error-type>
        {errorType}
      </span>
      <span data-nextjs-devtools-panel-tab-issues-sidebar-frame-source>
        {frameSource}
      </span>
    </>
  )
})

const IssuesTabSidebarFrame = memo(function IssuesTabSidebarFrame({
  runtimeError,
  idx,
  isActive,
  setActiveIndex,
}: {
  runtimeError: ReadyRuntimeError
  idx: number
  isActive: boolean
  setActiveIndex: (idx: number) => void
}) {
  return (
    <button
      data-nextjs-devtools-panel-tab-issues-sidebar-frame
      data-nextjs-devtools-panel-tab-issues-sidebar-frame-active={isActive}
      onClick={() => setActiveIndex(idx)}
    >
      <Suspense fallback={<IssuesTabSidebarFrameSkeleton />}>
        <IssuesTabSidebarFrameItem runtimeError={runtimeError} />
      </Suspense>
    </button>
  )
})

export const DEVTOOLS_PANEL_TAB_ISSUES_SIDEBAR_STYLES = css`
  [data-nextjs-devtools-panel-tab-issues-sidebar] {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    border-right: 1px solid var(--color-gray-400);
    overflow-y: auto;
    min-height: 0;

    @media (max-width: 575px) {
      max-width: 112px;
    }

    @media (min-width: 576px) {
      max-width: 138px;
      width: 100%;
    }

    @media (min-width: 768px) {
      max-width: 172.5px;
      width: 100%;
    }

    @media (min-width: 992px) {
      max-width: 230px;
      width: 100%;
    }
  }

  [data-nextjs-devtools-panel-tab-issues-sidebar-frame] {
    display: flex;
    flex-direction: column;
    padding: 10px 8px;
    border-radius: var(--rounded-lg);
    transition: background-color 0.2s ease-in-out;

    &:hover {
      background-color: var(--color-gray-200);
    }

    &:active {
      background-color: var(--color-gray-300);
    }
  }

  [data-nextjs-devtools-panel-tab-issues-sidebar-frame-active='true'] {
    background-color: var(--color-gray-100);
  }

  [data-nextjs-devtools-panel-tab-issues-sidebar-frame-error-type] {
    display: inline-block;
    align-self: flex-start;
    color: var(--color-gray-1000);
    font-size: var(--size-14);
    font-weight: 500;
    line-height: var(--size-20);
  }

  [data-nextjs-devtools-panel-tab-issues-sidebar-frame-source] {
    display: inline-block;
    align-self: flex-start;
    color: var(--color-gray-900);
    font-size: var(--size-13);
    line-height: var(--size-18);
  }

  /* Ellipsis for long stack frame source or small devices. */
  [data-nextjs-devtools-panel-tab-issues-sidebar-frame-error-type],
  [data-nextjs-devtools-panel-tab-issues-sidebar-frame-source] {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
`

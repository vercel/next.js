'use client'

import type { ReactNode } from 'react'
import {
  useState,
  createContext,
  useContext,
  use,
  useMemo,
  useCallback,
} from 'react'
import { useLayoutEffect } from 'react'
import { dispatcher } from 'next/dist/compiled/next-devtools'
import {
  MARKDOWN_INTERNAL_COMPONENT_BEHAVIOR_OMIT,
  MARKDOWN_INTERNAL_COMPONENT_BEHAVIOR_PROP,
} from '../../../lib/constants'
import { notFound } from '../../../client/components/not-found'

export type SegmentBoundaryType =
  | 'not-found'
  | 'error'
  | 'loading'
  | 'global-error'

export const SEGMENT_EXPLORER_SIMULATED_ERROR_MESSAGE =
  'NEXT_DEVTOOLS_SIMULATED_ERROR'

export type SegmentNodeState = {
  type: string
  pagePath: string
  boundaryType: string | null
  setBoundaryType: (type: SegmentBoundaryType | null) => void
}

type MarkdownInternalBehaviorProps = {
  __nextMarkdownBehavior?: 'omit' | 'passthrough'
}

function SegmentTrieNode({
  type,
  pagePath,
}: {
  type: string
  pagePath: string
} & MarkdownInternalBehaviorProps): React.ReactNode {
  const { boundaryType, setBoundaryType } = useSegmentState()
  const nodeState: SegmentNodeState = useMemo(() => {
    return {
      type,
      pagePath,
      boundaryType,
      setBoundaryType,
    }
  }, [type, pagePath, boundaryType, setBoundaryType])

  // Use `useLayoutEffect` to ensure the state is updated during suspense.
  // `useEffect` won't work as the state is preserved during suspense.
  useLayoutEffect(() => {
    dispatcher.segmentExplorerNodeAdd(nodeState)
    return () => {
      dispatcher.segmentExplorerNodeRemove(nodeState)
    }
  }, [nodeState])

  return null
}

function NotFoundSegmentNode(): React.ReactNode {
  notFound()
}

function ErrorSegmentNode(): React.ReactNode {
  throw new Error(SEGMENT_EXPLORER_SIMULATED_ERROR_MESSAGE)
}

const forever = new Promise(() => {})
function LoadingSegmentNode(): React.ReactNode {
  use(forever)
  return null
}

export function SegmentViewStateNode({
  page,
}: { page: string } & MarkdownInternalBehaviorProps) {
  useLayoutEffect(() => {
    dispatcher.segmentExplorerUpdateRouteState(page)
    return () => {
      dispatcher.segmentExplorerUpdateRouteState('')
    }
  }, [page])
  return null
}

export function SegmentBoundaryTriggerNode(
  _props: MarkdownInternalBehaviorProps
) {
  const { boundaryType } = useSegmentState()
  let segmentNode: React.ReactNode = null
  if (boundaryType === 'loading') {
    segmentNode = <LoadingSegmentNode />
  } else if (boundaryType === 'not-found') {
    segmentNode = <NotFoundSegmentNode />
  } else if (boundaryType === 'error') {
    segmentNode = <ErrorSegmentNode />
  }
  return segmentNode
}

export function SegmentViewNode({
  type,
  pagePath,
  children,
}: {
  type: string
  pagePath: string
  children?: ReactNode
} & MarkdownInternalBehaviorProps): React.ReactNode {
  const segmentNode = (
    <SegmentTrieNode
      key={type}
      type={type}
      pagePath={pagePath}
      {...{
        [MARKDOWN_INTERNAL_COMPONENT_BEHAVIOR_PROP]:
          MARKDOWN_INTERNAL_COMPONENT_BEHAVIOR_OMIT,
      }}
    />
  )

  return (
    <>
      {segmentNode}
      {children}
    </>
  )
}

const SegmentStateContext = createContext<{
  boundaryType: SegmentBoundaryType | null
  setBoundaryType: (type: SegmentBoundaryType | null) => void
}>({
  boundaryType: null,
  setBoundaryType: () => {},
})

export function SegmentStateProvider({
  children,
}: { children: ReactNode } & MarkdownInternalBehaviorProps) {
  const [boundaryType, setBoundaryType] = useState<SegmentBoundaryType | null>(
    null
  )

  const [errorBoundaryKey, setErrorBoundaryKey] = useState(0)
  const reloadBoundary = useCallback(
    () => setErrorBoundaryKey((prev) => prev + 1),
    []
  )

  const setBoundaryTypeAndReload = useCallback(
    (type: SegmentBoundaryType | null) => {
      if (type === null) {
        reloadBoundary()
      }
      setBoundaryType(type)
    },
    [reloadBoundary]
  )

  return (
    <SegmentStateContext.Provider
      key={errorBoundaryKey}
      value={{
        boundaryType,
        setBoundaryType: setBoundaryTypeAndReload,
      }}
    >
      {children}
    </SegmentStateContext.Provider>
  )
}

export function useSegmentState() {
  return useContext(SegmentStateContext)
}

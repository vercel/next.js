'use client'

import type { ReactNode } from 'react'
import { useState, createContext, useContext, use, useMemo } from 'react'
import { useLayoutEffect } from 'react'
import { dispatcher } from 'next/dist/compiled/next-devtools'
import { notFound } from '../../../client/components/not-found'

export const SEGMENT_EXPLORER_SIMULATED_ERROR_MESSAGE =
  'NEXT_DEVTOOLS_SIMULATED_ERROR'

export type SegmentNodeState = {
  type: string
  pagePath: string
  boundaryType: string | null
  setBoundaryType: (type: 'error' | 'not-found' | 'loading' | null) => void
}

function SegmentTrieNode({
  type,
  pagePath,
}: {
  type: string
  pagePath: string
}): React.ReactNode {
  const { boundaryType, setBoundaryType } = useSegmentState()
  const nodeState: SegmentNodeState = useMemo(
    () => ({
      type,
      pagePath,
      boundaryType,
      setBoundaryType,
    }),
    [type, pagePath, boundaryType, setBoundaryType]
  )

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

export function SegmentViewNode({
  type,
  pagePath,
  children,
}: {
  type: string
  pagePath: string
  children?: ReactNode
}): React.ReactNode {
  const { boundaryType } = useSegmentState()

  const isChildBoundary = type !== 'layout' && type !== 'template'

  let segmentNode = (
    <SegmentTrieNode key={type} type={type} pagePath={pagePath} />
  )
  if (boundaryType && boundaryType !== type && isChildBoundary) {
    if (boundaryType === 'loading') {
      segmentNode = <LoadingSegmentNode />
    } else if (boundaryType === 'not-found') {
      segmentNode = <NotFoundSegmentNode />
    } else if (boundaryType === 'error') {
      segmentNode = <ErrorSegmentNode />
    }
  }

  return (
    <>
      {segmentNode}
      {children}
    </>
  )
}

const SegmentStateContext = createContext<{
  boundaryType: 'not-found' | 'error' | 'loading' | null
  setBoundaryType: (type: 'not-found' | 'error' | 'loading' | null) => void
}>({
  boundaryType: null,
  setBoundaryType: () => {},
})

export function SegmentStateProvider({ children }: { children: ReactNode }) {
  const [boundaryType, setBoundaryType] = useState<
    'not-found' | 'error' | 'loading' | null
  >(null)

  return (
    <SegmentStateContext.Provider value={{ boundaryType, setBoundaryType }}>
      {children}
    </SegmentStateContext.Provider>
  )
}

export function useSegmentState() {
  return useContext(SegmentStateContext)
}

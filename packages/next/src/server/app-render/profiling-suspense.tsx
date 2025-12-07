import type { ComponentProps, ReactNode, ComponentType } from 'react'
import {
  registerSuspenseBoundary,
  pushSuspenseBoundary,
  popSuspenseBoundary,
  type SuspenseBoundarySource,
} from './suspense-boundary-collector'

type SuspenseProps = ComponentProps<typeof import('react').Suspense>

interface ProfilingSuspenseProps extends SuspenseProps {
  __source?: SuspenseBoundarySource
}

// Wrapper component to track boundary nesting
function SuspenseBoundaryTracker({
  boundaryId,
  children,
}: {
  boundaryId: string
  children: ReactNode
}) {
  // Push this boundary onto the stack when rendering children
  // This allows us to track parent-child relationships
  pushSuspenseBoundary(boundaryId)

  // The pop happens after children render due to React's depth-first rendering
  // We use a trick: wrap children in a component that pops on render
  return (
    <>
      {children}
      <SuspenseBoundaryTrackerEnd boundaryId={boundaryId} />
    </>
  )
}

// This component renders at the end of the boundary's children
// and pops the boundary from the stack
function SuspenseBoundaryTrackerEnd({
  boundaryId: _boundaryId,
}: {
  boundaryId: string
}) {
  popSuspenseBoundary()
  return null
}

export function createProfilingSuspense(
  OriginalSuspense: ComponentType<SuspenseProps>
): ComponentType<ProfilingSuspenseProps> {
  function ProfilingSuspense(props: ProfilingSuspenseProps): ReactNode {
    const { children, fallback, __source, ...rest } = props

    // Register this boundary and get its unique ID
    const boundaryId = registerSuspenseBoundary(__source || null)

    // If no boundary ID (collector not active), render original
    if (!boundaryId) {
      return (
        <OriginalSuspense fallback={fallback} {...rest}>
          {children}
        </OriginalSuspense>
      )
    }

    // Wrap children to track nesting
    const trackedChildren = (
      <SuspenseBoundaryTracker boundaryId={boundaryId}>
        {children}
      </SuspenseBoundaryTracker>
    )

    return (
      <OriginalSuspense
        fallback={
          <>
            {/* Hidden marker for fallback state */}
            <span
              data-suspense-boundary={boundaryId}
              data-suspense-state="fallback"
              hidden
            />
            {fallback}
          </>
        }
        {...rest}
      >
        {/* Hidden marker for content state */}
        <span
          data-suspense-boundary={boundaryId}
          data-suspense-state="content"
          hidden
        />
        {trackedChildren}
      </OriginalSuspense>
    )
  }

  // Preserve display name for debugging
  ProfilingSuspense.displayName = 'Suspense'

  return ProfilingSuspense as ComponentType<ProfilingSuspenseProps>
}

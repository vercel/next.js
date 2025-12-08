import type { ComponentProps, ReactNode, ComponentType } from 'react'
import { registerSuspenseBoundary } from './suspense-boundary-collector'

type SuspenseProps = ComponentProps<typeof import('react').Suspense>

interface ReactWithOwnerStack {
  captureOwnerStack?: () => string | null
}

export function createProfilingSuspense(
  OriginalSuspense: ComponentType<SuspenseProps>,
  React: ReactWithOwnerStack
): ComponentType<SuspenseProps> {
  function ProfilingSuspense(props: SuspenseProps): ReactNode {
    const { children, fallback, ...rest } = props

    // Capture owner stack in dev mode
    const ownerStack =
      process.env.NODE_ENV !== 'production' &&
      typeof React?.captureOwnerStack === 'function'
        ? React.captureOwnerStack()
        : null

    // Register this boundary and get its unique ID
    const boundaryId = registerSuspenseBoundary(ownerStack)

    // If no boundary ID (collector not active), render original
    if (!boundaryId) {
      return (
        <OriginalSuspense fallback={fallback} {...rest}>
          {children}
        </OriginalSuspense>
      )
    }

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
        {children}
      </OriginalSuspense>
    )
  }

  // Preserve display name for debugging
  ProfilingSuspense.displayName = 'Suspense'

  return ProfilingSuspense
}

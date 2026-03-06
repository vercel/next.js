import {
  Suspense,
  Fragment,
  lazy,
  createContext,
  useContext,
  useMemo,
} from 'react'
import { BailoutToCSR } from './dynamic-bailout-to-csr'
import type { ComponentModule } from './types'
import { PreloadChunks } from './preload-chunks'

// Context to track whether a parent Suspense boundary exists in the tree.
// When a parent Suspense is present, dynamic() components without an explicit
// loading prop should delegate their suspended state to the parent boundary
// instead of wrapping themselves in their own Suspense with a null fallback.
// This prevents layout flicker caused by the inner Suspense swallowing the
// suspension and rendering nothing while the parent Suspense could show a
// meaningful loading state.
const SuspenseTrackerContext = createContext<boolean>(false)

/**
 * Wraps children with a context marker so that nested dynamic() calls know
 * a parent Suspense exists. This should be rendered inside user-defined
 * Suspense boundaries so that dynamic components can detect them and
 * delegate their suspended state upward instead of creating their own
 * Suspense boundary with a null fallback.
 */
export function SuspenseTrackerProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SuspenseTrackerContext.Provider value={true}>
      {children}
    </SuspenseTrackerContext.Provider>
  )
}

/**
 * Hook to check whether there is a parent Suspense boundary tracked by
 * the SuspenseTrackerContext. Returns true when a parent Suspense exists.
 */
export function useHasParentSuspense(): boolean {
  return useContext(SuspenseTrackerContext)
}

// Normalize loader to return the module as form { default: Component } for `React.lazy()`.
// Also for backward compatible since next/dynamic allows to resolve a component directly with loader
// Client component reference proxy need to be converted to a module.
function convertModule<P>(
  mod: React.ComponentType<P> | ComponentModule<P> | undefined
): {
  default: React.ComponentType<P>
} {
  // Check "default" prop before accessing it, as it could be client reference proxy that could break it reference.
  // Cases:
  // mod: { default: Component }
  // mod: Component
  // mod: { default: proxy(Component) }
  // mod: proxy(Component)
  const hasDefault = mod && 'default' in mod
  return {
    default: hasDefault
      ? (mod as ComponentModule<P>).default
      : (mod as React.ComponentType<P>),
  }
}

const defaultOptions = {
  loader: () => Promise.resolve(convertModule(() => null)),
  loading: null,
  ssr: true,
}

interface LoadableOptions {
  loader?: () => Promise<React.ComponentType<any> | ComponentModule<any>>
  loading?: React.ComponentType<any> | null
  ssr?: boolean
  modules?: string[]
}

function Loadable(options: LoadableOptions) {
  const opts = { ...defaultOptions, ...options }
  const Lazy = lazy(() => opts.loader().then(convertModule))
  const Loading = opts.loading

  // Track whether the user explicitly provided a loading component.
  // This is distinct from checking opts.loading because defaultOptions sets
  // loading to null. We need to know whether the caller of dynamic() actually
  // passed a loading prop, because only then should we force our own Suspense
  // boundary regardless of parent Suspense boundaries.
  const hasExplicitLoading =
    options.loading !== undefined && options.loading !== null

  function LoadableComponent(props: any) {
    const hasParentSuspense = useHasParentSuspense()

    const fallbackElement = Loading ? (
      <Loading isLoading={true} pastDelay={true} error={null} />
    ) : null

    // Determine whether this dynamic component should create its own
    // Suspense boundary or delegate to a parent one.
    //
    // The rules are:
    // 1. If an explicit loading component was provided to dynamic(), always
    //    use our own Suspense boundary with that loading component as fallback.
    //    The user explicitly wanted this specific loading UI.
    //
    // 2. If ssr is false (client-only component), we need a Suspense boundary
    //    to catch the BailoutToCSR error. However, if a parent Suspense exists
    //    and no explicit loading was provided, delegate to the parent boundary
    //    so it can show its own fallback instead of our null fallback.
    //
    // 3. If a parent Suspense boundary exists and no explicit loading was
    //    provided, let React.lazy()'s suspension propagate up to the parent
    //    Suspense boundary. This avoids layout flicker from our own Suspense
    //    swallowing the suspension and rendering null.
    //
    // 4. If no parent Suspense exists and no explicit loading was provided,
    //    we still need our own Suspense boundary to prevent an unhandled
    //    suspension from crashing the app. We use null as fallback in this
    //    case (preserving existing behavior).
    const shouldCreateOwnBoundary = useMemo(() => {
      // Rule 1: Explicit loading always gets its own boundary
      if (hasExplicitLoading) {
        return true
      }

      // Rule 2 & 3: If parent Suspense exists and no explicit loading,
      // delegate to parent (don't create own boundary)
      if (hasParentSuspense) {
        return false
      }

      // Rule 4: No parent Suspense and ssr=false needs a boundary to
      // catch the suspension from BailoutToCSR / React.lazy
      if (!opts.ssr) {
        return true
      }

      // Default: no explicit loading, no parent Suspense, ssr=true
      // No boundary needed - React.lazy will suspend and if there's
      // no ancestor Suspense React will handle it
      return false
    }, [hasParentSuspense])

    const Wrap = shouldCreateOwnBoundary ? Suspense : Fragment
    const wrapProps = shouldCreateOwnBoundary
      ? { fallback: fallbackElement }
      : {}
    const children = opts.ssr ? (
      <>
        {/* During SSR, we need to preload the CSS from the dynamic component to avoid flash of unstyled content */}
        {typeof window === 'undefined' ? (
          <PreloadChunks moduleIds={opts.modules} />
        ) : null}
        <Lazy {...props} />
      </>
    ) : (
      <BailoutToCSR reason="next/dynamic">
        <Lazy {...props} />
      </BailoutToCSR>
    )

    return <Wrap {...wrapProps}>{children}</Wrap>
  }

  LoadableComponent.displayName = 'LoadableComponent'

  return LoadableComponent
}

export default Loadable

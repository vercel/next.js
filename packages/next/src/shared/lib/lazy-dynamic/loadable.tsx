import { Suspense, Fragment, lazy } from 'react'
import { BailoutToCSR } from './dynamic-bailout-to-csr'
import type { ComponentModule } from './types'
import { PreloadChunks } from './preload-chunks'

// Normalize loader to return the module as form { default: Component } for `React.lazy`.
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

  function LoadableComponent(props: any) {
    const fallbackElement = Loading ? (
      <Loading isLoading={true} pastDelay={true} error={null} />
    ) : null

    // If it's non-SSR or provided a loading component, wrap it in a suspense boundary
    const hasSuspenseBoundary = !opts.ssr || !!opts.loading
    const Wrap = hasSuspenseBoundary ? Suspense : Fragment
    const wrapProps = hasSuspenseBoundary ? { fallback: fallbackElement } : {}
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

import { Suspense, lazy } from 'react'
import { BailoutToCSR } from './dynamic-bailout-to-csr'
import type { ComponentModule } from './types'
import { isClientReference } from '../../../lib/client-reference'

// Normalize loader to return the module as form { default: Component } for `React.lazy`.
// Also for backward compatible since next/dynamic allows to resolve a component directly with loader
// Client component reference proxy need to be converted to a module.
function convertModule<P>(mod: React.ComponentType<P> | ComponentModule<P>): {
  default: React.ComponentType<P>
} {
  // If it's client component, it's already a component type. We don't access the default property into the module,
  // client module proxy can manage it and map to the right property.
  const isClientComponentModule = isClientReference(mod)
  return {
    default: isClientComponentModule
      ? (mod as React.ComponentType<P>)
      : (mod as ComponentModule<P>)?.default ?? mod,
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
}

function Loadable(options: LoadableOptions) {
  const opts = { ...defaultOptions, ...options }
  const Lazy = lazy(() => opts.loader().then(convertModule))
  const Loading = opts.loading

  function LoadableComponent(props: any) {
    const fallbackElement = Loading ? (
      <Loading isLoading={true} pastDelay={true} error={null} />
    ) : null

    const children = opts.ssr ? (
      <Lazy {...props} />
    ) : (
      <BailoutToCSR reason="next/dynamic">
        <Lazy {...props} />
      </BailoutToCSR>
    )

    return <Suspense fallback={fallbackElement}>{children}</Suspense>
  }

  LoadableComponent.displayName = 'LoadableComponent'

  return LoadableComponent
}

export default Loadable

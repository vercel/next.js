import { Suspense, lazy, Fragment } from 'react'
import { NoSSR } from './dynamic-no-ssr'
import type { ComponentModule } from './types'

// Normalize loader to return the module as form { default: Component } for `React.lazy`.
// Also for backward compatible since next/dynamic allows to resolve a component directly with loader
// Client component reference proxy need to be converted to a module.
function convertModule<P>(mod: React.ComponentType<P> | ComponentModule<P>) {
  return { default: (mod as ComponentModule<P>)?.default || mod }
}

function Loadable(options: any) {
  const opts = {
    loader: null,
    loading: null,
    ssr: true,
    ...options,
  }

  const loader = () =>
    opts.loader != null
      ? opts.loader().then(convertModule)
      : Promise.resolve(convertModule(() => null))

  const Lazy = lazy(loader)
  const Loading = opts.loading
  const Wrap = opts.ssr ? Fragment : NoSSR

  function LoadableComponent(props: any) {
    const fallbackElement = Loading ? (
      <Loading isLoading={true} pastDelay={true} error={null} />
    ) : null

    return (
      <Suspense fallback={fallbackElement}>
        <Wrap>
          <Lazy {...props} />
        </Wrap>
      </Suspense>
    )
  }

  LoadableComponent.displayName = 'LoadableComponent'

  return LoadableComponent
}

export default Loadable

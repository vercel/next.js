import React from 'react'
import { NoSSR } from './dynamic-no-ssr'

function Loadable(options: any) {
  const opts = Object.assign(
    {
      loader: null,
      loading: null,
      ssr: true,
    },
    options
  )

  opts.lazy = React.lazy(opts.loader)

  function LoadableComponent(props: any) {
    const Loading = opts.loading
    const fallbackElement = (
      <Loading isLoading={true} pastDelay={true} error={null} />
    )

    const Wrap = opts.ssr ? React.Fragment : NoSSR
    const Lazy = opts.lazy

    return (
      <React.Suspense fallback={fallbackElement}>
        <Wrap>
          <Lazy {...props} />
        </Wrap>
      </React.Suspense>
    )
  }

  LoadableComponent.displayName = 'LoadableComponent'

  return LoadableComponent
}

export default Loadable

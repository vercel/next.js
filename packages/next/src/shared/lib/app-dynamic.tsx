import React from 'react'
import Loadable from './lazy-dynamic/loadable'

import type {
  LoadableGeneratedOptions,
  DynamicOptionsLoadingProps,
  Loader,
  LoaderComponent,
} from './lazy-dynamic/types'

export {
  type LoadableGeneratedOptions,
  type DynamicOptionsLoadingProps,
  type Loader,
  type LoaderComponent,
}

export type DynamicOptions<P = {}> = LoadableGeneratedOptions & {
  loading?: (loadingProps: DynamicOptionsLoadingProps) => JSX.Element | null
  loader?: Loader<P>
  loadableGenerated?: LoadableGeneratedOptions
  ssr?: boolean
}

export type LoadableOptions<P = {}> = DynamicOptions<P>

export type LoadableFn<P = {}> = (
  opts: LoadableOptions<P>
) => React.ComponentType<P>

export type LoadableComponent<P = {}> = React.ComponentType<P>

export default function dynamic<P = {}>(
  dynamicOptions: DynamicOptions<P> | Loader<P>,
  options?: DynamicOptions<P>
): React.ComponentType<P> {
  const loadableOptions: LoadableOptions<P> = {
    // A loading component is not required, so we default it
    loading: ({ error, isLoading, pastDelay }) => {
      if (!pastDelay) return null
      if (process.env.NODE_ENV !== 'production') {
        if (isLoading) {
          return null
        }
        if (error) {
          return (
            <p>
              {error.message}
              <br />
              {error.stack}
            </p>
          )
        }
      }
      return null
    },
  }

  if (typeof dynamicOptions === 'function') {
    loadableOptions.loader = dynamicOptions
  }

  return Loadable({ ...loadableOptions, ...options })
}

import React from 'react'
import Loadable from './lazy-dynamic/loadable'

type ComponentModule<P = {}> = { default: React.ComponentType<P> }

export declare type LoaderComponent<P = {}> = Promise<
  React.ComponentType<P> | ComponentModule<P>
>

export declare type Loader<P = {}> = () => LoaderComponent<P>

export type LoaderMap = { [module: string]: () => Loader<any> }

export type LoadableGeneratedOptions = {
  webpack?(): any
  modules?(): LoaderMap
}

export type DynamicOptionsLoadingProps = {
  error?: Error | null
  isLoading?: boolean
  pastDelay?: boolean
  retry?: () => void
  timedOut?: boolean
}

// Normalize loader to return the module as form { default: Component } for `React.lazy`.
// Also for backward compatible since next/dynamic allows to resolve a component directly with loader
// Client component reference proxy need to be converted to a module.
function convertModule<P>(mod: React.ComponentType<P> | ComponentModule<P>) {
  return { default: (mod as ComponentModule<P>)?.default || mod }
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
  const loadableFn: LoadableFn<P> = Loadable

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

  Object.assign(loadableOptions, options)

  const loaderFn = loadableOptions.loader as () => LoaderComponent<P>
  const loader = () =>
    loaderFn != null
      ? loaderFn().then(convertModule)
      : Promise.resolve(convertModule(() => null))

  return loadableFn({ ...loadableOptions, loader: loader as Loader<P> })
}

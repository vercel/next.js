import React from 'react'
import Loadable from './loadable'

const isServerSide = typeof window === 'undefined'

export type LoaderComponent<P = {}> = Promise<
  React.ComponentType<P> | { default: React.ComponentType<P> }
>

export type Loader<P = {}> = (() => LoaderComponent<P>) | LoaderComponent<P>

export type LoaderMap = { [mdule: string]: () => Loader<any> }

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

export type DynamicOptions<P = {}> = LoadableGeneratedOptions & {
  loading?: (loadingProps: DynamicOptionsLoadingProps) => JSX.Element | null
  loader?: Loader<P> | LoaderMap
  loadableGenerated?: LoadableGeneratedOptions
  ssr?: boolean
  suspense?: boolean
}

export type LoadableOptions<P = {}> = DynamicOptions<P>

export type LoadableFn<P = {}> = (
  opts: LoadableOptions<P>
) => React.ComponentType<P>

export type LoadableComponent<P = {}> = React.ComponentType<P>

export function noSSR<P = {}>(
  LoadableInitializer: LoadableFn<P>,
  loadableOptions: DynamicOptions<P>
): React.ComponentType<P> {
  // Removing webpack and modules means react-loadable won't try preloading
  delete loadableOptions.webpack
  delete loadableOptions.modules

  // This check is necessary to prevent react-loadable from initializing on the server
  if (!isServerSide) {
    return LoadableInitializer(loadableOptions)
  }

  const Loading = loadableOptions.loading!
  // This will only be rendered on the server side
  return () => (
    <Loading error={null} isLoading pastDelay={false} timedOut={false} />
  )
}

export default function dynamic<P = {}>(
  dynamicOptions: DynamicOptions<P> | Loader<P>,
  options?: DynamicOptions<P>
): React.ComponentType<P> {
  let loadableFn: LoadableFn<P> = Loadable

  let loadableOptions: LoadableOptions<P> = options?.suspense
    ? {}
    : // only provide a default loading component when suspense is disabled
      {
        // A loading component is not required, so we default it
        loading: ({ error, isLoading, pastDelay }) => {
          if (!pastDelay) return null
          if (process.env.NODE_ENV === 'development') {
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

  // Support for direct import(), eg: dynamic(import('../hello-world'))
  // Note that this is only kept for the edge case where someone is passing in a promise as first argument
  // The react-loadable babel plugin will turn dynamic(import('../hello-world')) into dynamic(() => import('../hello-world'))
  // To make sure we don't execute the import without rendering first
  if (dynamicOptions instanceof Promise) {
    loadableOptions.loader = () => dynamicOptions
    // Support for having import as a function, eg: dynamic(() => import('../hello-world'))
  } else if (typeof dynamicOptions === 'function') {
    loadableOptions.loader = dynamicOptions
    // Support for having first argument being options, eg: dynamic({loader: import('../hello-world')})
  } else if (typeof dynamicOptions === 'object') {
    loadableOptions = { ...loadableOptions, ...dynamicOptions }
  }

  // Support for passing options, eg: dynamic(import('../hello-world'), {loading: () => <p>Loading something</p>})
  loadableOptions = { ...loadableOptions, ...options }

  // Error if Fizz rendering is not enabled and `suspense` option is set to true
  if (!process.env.__NEXT_REACT_ROOT && loadableOptions.suspense) {
    throw new Error(
      `Invalid suspense option usage in next/dynamic. Read more: https://nextjs.org/docs/messages/invalid-dynamic-suspense`
    )
  }

  if (loadableOptions.suspense) {
    if (process.env.NODE_ENV !== 'production') {
      /**
       * TODO: Currently, next/dynamic will opt-in to React.lazy if { suspense: true } is used
       * React 18 will always resolve the Suspense boundary on the server-side, effectively ignoring the ssr option
       *
       * In the future, when React Suspense with third-party libraries is stable, we can implement a custom version of
       * React.lazy that can suspense on the server-side while only loading the component on the client-side
       */
      if (loadableOptions.ssr === false) {
        console.warn(
          `"ssr: false" is ignored by next/dynamic because you can not enable "suspense" while disabling "ssr" at the same time. Read more: https://nextjs.org/docs/messages/invalid-dynamic-suspense`
        )
      }

      if (loadableOptions.loading != null) {
        console.warn(
          `"loading" is ignored by next/dynamic because you have enabled "suspense". Place your loading element in your suspense boundary's "fallback" prop instead. Read more: https://nextjs.org/docs/messages/invalid-dynamic-suspense`
        )
      }
    }

    delete loadableOptions.ssr
    delete loadableOptions.loading
  }

  // coming from build/babel/plugins/react-loadable-plugin.js
  if (loadableOptions.loadableGenerated) {
    loadableOptions = {
      ...loadableOptions,
      ...loadableOptions.loadableGenerated,
    }
    delete loadableOptions.loadableGenerated
  }

  // support for disabling server side rendering, eg: dynamic(import('../hello-world'), {ssr: false}).
  // skip `ssr` for suspense mode and opt-in React.lazy directly
  if (typeof loadableOptions.ssr === 'boolean' && !loadableOptions.suspense) {
    if (!loadableOptions.ssr) {
      delete loadableOptions.ssr
      return noSSR(loadableFn, loadableOptions)
    }
    delete loadableOptions.ssr
  }

  return loadableFn(loadableOptions)
}

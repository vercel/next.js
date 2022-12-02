import React, { Suspense } from 'react'
import Loadable from './loadable'
import DynamicBoundary from './dynamic-error-boundary'

import { NEXT_DYNAMIC_NO_SSR_CODE } from './no-ssr-error'

export { NEXT_DYNAMIC_NO_SSR_CODE }

export type LoaderComponent<P = {}> = Promise<{
  default: React.ComponentType<P>
}>

export type Loader<P = {}> = () => LoaderComponent<P>

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

export type DynamicOptions<P = {}> = LoadableGeneratedOptions & {
  loading?: (loadingProps: DynamicOptionsLoadingProps) => JSX.Element | null
  loader?: Loader<P> | LoaderMap
  loadableGenerated?: LoadableGeneratedOptions
  ssr?: boolean
  /**
   * @deprecated `suspense` prop is not required any more
   */
  suspense?: boolean
}

export type LoadableOptions<P = {}> = DynamicOptions<P>

export type LoadableFn<P = {}> = (
  opts: LoadableOptions<P>
) => React.ComponentType<P>

export type LoadableComponent<P = {}> = React.ComponentType<P>

function DynamicThrownOnServer() {
  const error = new Error(NEXT_DYNAMIC_NO_SSR_CODE)
  ;(error as any).digest = NEXT_DYNAMIC_NO_SSR_CODE
  throw error
}

export function noSSR<P = {}>(
  _LoadableInitializer: LoadableFn<P>,
  loadableOptions: DynamicOptions<P>
): React.ComponentType<P> {
  // Removing webpack and modules means react-loadable won't try preloading
  delete loadableOptions.webpack
  delete loadableOptions.modules

  const loader =
    typeof window === 'undefined'
      ? async () => ({ default: DynamicThrownOnServer })
      : loadableOptions.loader

  const NoSSRComponent = React.lazy<React.ComponentType>(loader as Loader)

  const Loading = loadableOptions.loading!
  const fallback = (
    <Loading error={null} isLoading pastDelay={false} timedOut={false} />
  )

  return () => (
    <Suspense fallback={fallback}>
      <NoSSRComponent />
      {/* <DynamicBoundary>
      </DynamicBoundary> */}
    </Suspense>
  )
}

export default function dynamic<P = {}>(
  dynamicOptions: DynamicOptions<P> | Loader<P>,
  options?: DynamicOptions<P>
): React.ComponentType<P> {
  let loadableFn: LoadableFn<P> = Loadable

  let loadableOptions: LoadableOptions<P> = {
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

  // coming from build/babel/plugins/react-loadable-plugin.js
  if (loadableOptions.loadableGenerated) {
    loadableOptions = {
      ...loadableOptions,
      ...loadableOptions.loadableGenerated,
    }
    delete loadableOptions.loadableGenerated
  }

  // support for disabling server side rendering, eg: dynamic(() => import('../hello-world'), {ssr: false}).
  if (typeof loadableOptions.ssr === 'boolean') {
    if (!loadableOptions.ssr) {
      delete loadableOptions.ssr
      return noSSR(loadableFn, loadableOptions)
    }
    delete loadableOptions.ssr
  }

  return loadableFn(loadableOptions)
}

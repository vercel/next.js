import React from 'react'
import Loadable from './loadable'

const isServerSide = typeof window === 'undefined'

export function noSSR(LoadableInitializer, loadableOptions) {
  // Removing webpack and modules means react-loadable won't try preloading
  delete loadableOptions.webpack
  delete loadableOptions.modules

  // This check is neccesary to prevent react-loadable from initializing on the server
  if (!isServerSide) {
    return LoadableInitializer(loadableOptions)
  }

  // This will only be rendered on the server side
  return () => <loadableOptions.loading error={null} isLoading pastDelay={false} timedOut={false} />
}

function DefaultLoading() {
  return <p>loading...</p>
}

function loading({ error, isLoading, pastDelay }: loadingOptions) {
  if (!pastDelay) return null
  if (process.env.NODE_ENV === 'development') {
    if (isLoading) {
      return <DefaultLoading />
    }
    if (error) {
      return <p>{error.message}<br />{error.stack}</p>
    }
  }

  return <DefaultLoading />
}

interface InterfaceLoadableComponent {
  preload(): void;
}
type DynamicComponent<P> = React.ComponentType<P> & InterfaceLoadableComponent

type AsyncComponent<P> = Promise<React.ComponentType<P> | { default: React.ComponentType<P> }>
type Component<P> = AsyncComponent<P> | (() => AsyncComponent<P>)

type loadingOptions = {
  isLoading: boolean,
  pastDelay: boolean,
  timedOut: boolean,
  error: any,
  retry: () => void,
}
type options = {
  loading?: React.ComponentType<loadingOptions> | (() => null),
  ssr?: boolean,
  loadableGenerated?: {
    webpack?: any,
    modules?: any,
  },
}

function dynamic<
  T extends { [k: string]: {}},
  K extends keyof T,
  P extends {},
  O extends options & {
    modules: () => Record<K, Component<T[K]>>,
    render: (props: P, loaded: Record<K, DynamicComponent<T[K]>>) => React.ReactNode,
  }
>(options: O): DynamicComponent<P>

function dynamic<
  P extends {},
  O extends options & {
    loader?: () => AsyncComponent<P>,
  }
>(options: O): DynamicComponent<P>

function dynamic<
  P extends {},
  O extends options
>(component: Component<P>, options?: O): DynamicComponent<P>

function dynamic(componentOrOptions: any, options?: any) {
  if (componentOrOptions.modules) {
    const loadModules: { [key: string]: any } = {}
    const modules = componentOrOptions.modules()
    Object.keys(modules).forEach((key) => {
      const value = modules[key]
      if (typeof value.then === 'function') {
        loadModules[key] = () => value.then((mod) => mod.default || mod)
        return
      }
      loadModules[key] = value
    })
    return new MapLoader({
      // Support for `render` when using a mapping, eg: `dynamic({ modules: () => {return {HelloWorld: import('../hello-world')}, render(props, loaded) {} } })
      render: (loaded, props) => componentOrOptions.render(props, loaded),
      // Support for `modules` when using a mapping, eg: `dynamic({ modules: () => {return {HelloWorld: import('../hello-world')}, render(props, loaded) {} } })
      loader: loadModules,
      // A loading component is not required, so we default it
      loading: componentOrOptions.loading ? componentOrOptions.loading : loading,
    })
  } else {
    const Loader = Loader
    if (options) {

    } else {
      // Support for direct import(), eg: dynamic(import('../hello-world'))
      // Note that this is only kept for the edge case where someone is passing in a promise as first argument
      // The react-loadable babel plugin will turn dynamic(import('../hello-world')) into dynamic(() => import('../hello-world'))
      // To make sure we don't execute the import without rendering first
      if (typeof componentOrOptions.then === 'function') {
        opt.loader = () => componentOrOptions
      // Support for having import as a function, eg: dynamic(() => import('../hello-world'))
      } else if (typeof componentOrOptions === 'function') {
        opt.loader = componentOrOptions
      // Support for having first argument being options, eg: dynamic({loader: import('../hello-world')})
      } else if (typeof componentOrOptions === 'object') {
        opt = { ...loadableOptions, ...dynamicOptions }
      }
    }
  }

  // Support for passing options, eg: dynamic(import('../hello-world'), {loading: () => <p>Loading something</p>})
  loadableOptions = { ...loadableOptions, ...options }

  // coming from build/babel/plugins/react-loadable-plugin.js
  if (loadableOptions.loadableGenerated) {
    loadableOptions = { ...loadableOptions, ...loadableOptions.loadableGenerated }
    delete loadableOptions.loadableGenerated
  }

  // support for disabling server side rendering, eg: dynamic(import('../hello-world'), {ssr: false})
  if (typeof loadableOptions.ssr === 'boolean') {
    if (!loadableOptions.ssr) {
      delete loadableOptions.ssr
      return noSSR(loadableFn, loadableOptions)
    }
    delete loadableOptions.ssr
  }

  return loadableFn(loadableOptions)
}

export default dynamic

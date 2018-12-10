import React from 'react'
import Loadable from './loadable'

const isServerSide = typeof window === 'undefined'

export function noSSR (LoadableInitializer, loadableOptions) {
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

function DefaultLoading () {
  return <p>loading...</p>
}

export default function dynamic (dynamicOptions, options) {
  let loadableFn = Loadable
  let loadableOptions = {
    // A loading component is not required, so we default it
    loading: ({error, isLoading}) => {
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
  }

  // Support for direct import(), eg: dynamic(import('../hello-world'))
  // Note that this is only kept for the edge case where someone is passing in a promise as first argument
  // The react-loadable babel plugin will turn dynamic(import('../hello-world')) into dynamic(() => import('../hello-world'))
  // To make sure we don't execute the import without rendering first
  if (typeof dynamicOptions.then === 'function') {
    loadableOptions.loader = () => dynamicOptions
  // Support for having import as a function, eg: dynamic(() => import('../hello-world'))
  } else if (typeof dynamicOptions === 'function') {
    loadableOptions.loader = dynamicOptions
  // Support for having first argument being options, eg: dynamic({loader: import('../hello-world')})
  } else if (typeof dynamicOptions === 'object') {
    loadableOptions = {...loadableOptions, ...dynamicOptions}
  }

  // Support for passing options, eg: dynamic(import('../hello-world'), {loading: () => <p>Loading something</p>})
  loadableOptions = {...loadableOptions, ...options}

  // Support for `render` when using a mapping, eg: `dynamic({ modules: () => {return {HelloWorld: import('../hello-world')}, render(props, loaded) {} } })
  if (dynamicOptions.render) {
    loadableOptions.render = (loaded, props) => dynamicOptions.render(props, loaded)
  }
  // Support for `modules` when using a mapping, eg: `dynamic({ modules: () => {return {HelloWorld: import('../hello-world')}, render(props, loaded) {} } })
  if (dynamicOptions.modules) {
    loadableFn = Loadable.Map
    const loadModules = {}
    const modules = dynamicOptions.modules()
    Object.keys(modules).forEach(key => {
      const value = modules[key]
      if (typeof value.then === 'function') {
        loadModules[key] = () => value.then(mod => mod.default || mod)
        return
      }
      loadModules[key] = value
    })
    loadableOptions.loader = loadModules
  }

  // coming from build/babel/plugins/react-loadable-plugin.js
  if (loadableOptions.loadableGenerated) {
    loadableOptions = {...loadableOptions, ...loadableOptions.loadableGenerated}
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

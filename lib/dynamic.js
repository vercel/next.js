// @flow
import type {ElementType} from 'react'

import React from 'react'
import Loadable from 'react-loadable'

type ImportedComponent = Promise<null|ElementType>

type ComponentMapping = {[componentName: string]: ImportedComponent}

type NextDynamicOptions = {
  loader?: ComponentMapping | () => ImportedComponent,
  loading: ElementType,
  timeout?: number,
  delay?: number,
  ssr?: boolean,
  render?: (props: any, loaded: {[componentName: string]: ElementType}) => ElementType,
  modules?: () => ComponentMapping,
  loadableGenerated?: {
    webpack?: any,
    modules?: any
  }
}

type LoadableOptions = {
  loader?: ComponentMapping | () => ImportedComponent,
  loading: ElementType,
  timeout?: number,
  delay?: number,
  render?: (props: any, loaded: {[componentName: string]: ElementType}) => ElementType,
  webpack?: any,
  modules?: any
}

const isServerSide = typeof window === 'undefined'

export function noSSR (LoadableInitializer: (loadableOptions: LoadableOptions) => ElementType, loadableOptions: LoadableOptions) {
  let LoadableComponent

  // Removing webpack and modules means react-loadable won't try preloading
  delete loadableOptions.webpack
  delete loadableOptions.modules

  // This check is neccesary to prevent react-loadable from initializing on the server
  if (!isServerSide) {
    LoadableComponent = LoadableInitializer(loadableOptions)
  }

  return class NoSSR extends React.Component<any, {mounted: boolean}> {
    state = { mounted: false }

    componentDidMount () {
      this.setState({mounted: true})
    }

    render () {
      const {mounted} = this.state

      if (mounted && LoadableComponent) {
        return <LoadableComponent {...this.props} />
      }

      // Run loading component on the server and when mounting, when mounted we load the LoadableComponent
      return <loadableOptions.loading error={null} isLoading pastDelay={false} timedOut={false} />
    }
  }
}

export default function dynamic (dynamicOptions: any, options: NextDynamicOptions) {
  let loadableFn = Loadable
  let loadableOptions: NextDynamicOptions = {
    // A loading component is not required, so we default it
    loading: ({error, isLoading}) => {
      if (process.env.NODE_ENV === 'development') {
        if (isLoading) {
          return <p>loading...</p>
        }
        if (error) {
          return <p>{error.message}<br />{error.stack}</p>
        }
      }

      return <p>loading...</p>
    }
  }

  // Support for direct import(), eg: dynamic(import('../hello-world'))
  if (typeof dynamicOptions.then === 'function') {
    loadableOptions.loader = () => dynamicOptions
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

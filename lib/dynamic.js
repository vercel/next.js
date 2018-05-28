import React from 'react'
import { getDisplayName } from './utils'

let currentChunks = new Set()

export default function dynamicComponent (p, o) {
  let promise
  let options

  if (p instanceof SameLoopPromise) {
    promise = p
    options = o || {}
  } else {
    // Now we are trying to use the modules and render fields in options to load modules.
    if (!p.modules || !p.render) {
      const errorMessage = '`next/dynamic` options should contain `modules` and `render` fields'
      throw new Error(errorMessage)
    }

    if (o) {
      const errorMessage = 'Add additional `next/dynamic` options to the first argument containing the `modules` and `render` fields'
      throw new Error(errorMessage)
    }

    options = p
  }

  return class DynamicComponent extends React.Component {
    constructor (...args) {
      super(...args)

      this.LoadingComponent = options.loading ? options.loading : () => (<p>loading...</p>)
      this.ssr = options.ssr === false ? options.ssr : true

      this.state = { AsyncComponent: null, asyncElement: null }
      this.isServer = typeof window === 'undefined'

      // This flag is used to load the bundle again, if needed
      this.loadBundleAgain = null
      // This flag keeps track of the whether we are loading a bundle or not.
      this.loadingBundle = false

      if (this.ssr) {
        this.load()
      }
    }

    load () {
      if (promise) {
        this.loadComponent()
      } else {
        this.loadBundle(this.props)
      }
    }

    loadComponent () {
      promise.then((m) => {
        const AsyncComponent = m.default || m
        // Set a readable displayName for the wrapper component
        const asyncCompName = getDisplayName(AsyncComponent)
        if (asyncCompName) {
          DynamicComponent.displayName = `DynamicComponent for ${asyncCompName}`
        }

        if (this.mounted) {
          this.setState({ AsyncComponent })
        } else {
          if (this.isServer) {
            registerChunk(m.__webpackChunkName)
          }
          this.state.AsyncComponent = AsyncComponent
        }
      })
    }

    loadBundle (props) {
      this.loadBundleAgain = null
      this.loadingBundle = true

      // Run this for prop changes as well.
      const modulePromiseMap = options.modules(props)
      const moduleNames = Object.keys(modulePromiseMap)
      let remainingPromises = moduleNames.length
      const moduleMap = {}

      const renderModules = () => {
        if (this.loadBundleAgain) {
          this.loadBundle(this.loadBundleAgain)
          return
        }

        this.loadingBundle = false
        DynamicComponent.displayName = 'DynamicBundle'
        const asyncElement = options.render(props, moduleMap)
        if (this.mounted) {
          this.setState({ asyncElement })
        } else {
          this.state.asyncElement = asyncElement
        }
      }

      const loadModule = (name) => {
        const promise = modulePromiseMap[name]
        promise.then((m) => {
          const Component = m.default || m
          if (this.isServer) {
            registerChunk(m.__webpackChunkName)
          }
          moduleMap[name] = Component
          remainingPromises--
          if (remainingPromises === 0) {
            renderModules()
          }
        })
      }

      moduleNames.forEach(loadModule)
    }

    componentDidMount () {
      this.mounted = true
      if (!this.ssr) {
        this.load()
      }
    }

    componentWillReceiveProps (nextProps) {
      if (promise) return

      this.setState({ asyncElement: null })

      if (this.loadingBundle) {
        this.loadBundleAgain = nextProps
        return
      }

      this.loadBundle(nextProps)
    }

    componentWillUnmount () {
      this.mounted = false
    }

    render () {
      const { AsyncComponent, asyncElement } = this.state
      const { LoadingComponent } = this

      if (asyncElement) return asyncElement
      if (AsyncComponent) return (<AsyncComponent {...this.props} />)

      return (<LoadingComponent {...this.props} />)
    }
  }
}

export function registerChunk (chunk) {
  currentChunks.add(chunk)
}

export function flushChunks () {
  const chunks = Array.from(currentChunks)
  currentChunks.clear()
  return chunks
}

export class SameLoopPromise {
  static resolve (value) {
    const promise = new SameLoopPromise((done) => done(value))
    return promise
  }

  constructor (cb) {
    this.onResultCallbacks = []
    this.onErrorCallbacks = []
    this.cb = cb
  }

  setResult (result) {
    this.gotResult = true
    this.result = result
    this.onResultCallbacks.forEach((cb) => cb(result))
    this.onResultCallbacks = []
  }

  setError (error) {
    this.gotError = true
    this.error = error
    this.onErrorCallbacks.forEach((cb) => cb(error))
    this.onErrorCallbacks = []
  }

  then (onResult, onError) {
    this.runIfNeeded()
    const promise = new SameLoopPromise()

    const handleError = () => {
      if (onError) {
        promise.setResult(onError(this.error))
      } else {
        promise.setError(this.error)
      }
    }

    const handleResult = () => {
      promise.setResult(onResult(this.result))
    }

    if (this.gotResult) {
      handleResult()
      return promise
    }

    if (this.gotError) {
      handleError()
      return promise
    }

    this.onResultCallbacks.push(handleResult)
    this.onErrorCallbacks.push(handleError)

    return promise
  }

  catch (onError) {
    this.runIfNeeded()
    const promise = new SameLoopPromise()

    const handleError = () => {
      promise.setResult(onError(this.error))
    }

    const handleResult = () => {
      promise.setResult(this.result)
    }

    if (this.gotResult) {
      handleResult()
      return promise
    }

    if (this.gotError) {
      handleError()
      return promise
    }

    this.onErrorCallbacks.push(handleError)
    this.onResultCallbacks.push(handleResult)

    return promise
  }

  runIfNeeded () {
    if (!this.cb) return
    if (this.ran) return

    this.ran = true
    this.cb(
      (result) => this.setResult(result),
      (error) => this.setError(error)
    )
  }
}

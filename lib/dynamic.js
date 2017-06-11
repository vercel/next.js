import React from 'react'

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
      const errorMessage = 'Options to `next/dynamic` should contains `modules` and `render` fields.'
      throw new Error(errorMessage)
    }

    if (o) {
      const errorMessage = 'Include options in the first argument which contains `modules` and `render` fields.'
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

      if (this.ssr) {
        this.load()
      }
    }

    load () {
      if (promise) {
        this.loadComponent()
      } else {
        this.loadBundle()
      }
    }

    loadComponent () {
      promise.then((AsyncComponent) => {
        // Set a readable displayName for the wrapper component
        const asyncCompName = AsyncComponent.displayName || AsyncComponent.name
        if (asyncCompName) {
          DynamicComponent.displayName = `DynamicComponent for ${asyncCompName}`
        }

        if (this.mounted) {
          this.setState({ AsyncComponent })
        } else {
          if (this.isServer) {
            registerChunk(AsyncComponent.__webpackChunkName)
          }
          this.state.AsyncComponent = AsyncComponent
        }
      })
    }

    loadBundle () {
      const moduleNames = Object.keys(options.modules)
      let remainingPromises = moduleNames.length
      const moduleMap = {}

      const renderModules = () => {
        DynamicComponent.displayName = 'DynamicBundle'
        const asyncElement = options.render(this.props, moduleMap)
        if (this.mounted) {
          this.setState({ asyncElement })
        } else {
          this.state.asyncElement = asyncElement
        }
      }

      const loadModule = (name) => {
        const promise = options.modules[name]
        promise.then((Component) => {
          if (this.isServer) {
            registerChunk(Component.__webpackChunkName)
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

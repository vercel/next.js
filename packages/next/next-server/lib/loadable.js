/**
@copyright (c) 2017-present James Kyle <me@thejameskyle.com>
 MIT License
 Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:
 The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.
 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE
*/
// https://github.com/jamiebuilds/react-loadable/blob/v5.5.0/src/index.js
// Modified to be compatible with webpack 4 / Next.js

import React from 'react'
import { useSubscription } from 'use-subscription'
import { LoadableContext } from './loadable-context'

const ALL_INITIALIZERS = []
const READY_INITIALIZERS = []
let initialized = false

function load(loader) {
  let promise = loader()

  let state = {
    loading: true,
    loaded: null,
    error: null,
  }

  state.promise = promise
    .then((loaded) => {
      state.loading = false
      state.loaded = loaded
      return loaded
    })
    .catch((err) => {
      state.loading = false
      state.error = err
      throw err
    })

  return state
}

function resolve(obj) {
  return obj && obj.__esModule ? obj.default : obj
}

function createLoadableComponent(loadFn, options) {
  let opts = Object.assign(
    {
      loader: null,
      loading: null,
      delay: 200,
      timeout: null,
      webpack: null,
      modules: null,
    },
    options
  )

  let subscription = null

  function init() {
    if (!subscription) {
      const sub = new LoadableSubscription(loadFn, opts)
      subscription = {
        getCurrentValue: sub.getCurrentValue.bind(sub),
        subscribe: sub.subscribe.bind(sub),
        retry: sub.retry.bind(sub),
        promise: sub.promise.bind(sub),
      }
    }
    return subscription.promise()
  }

  // Server only
  if (typeof window === 'undefined') {
    ALL_INITIALIZERS.push(init)
  }

  // Client only
  if (
    !initialized &&
    typeof window !== 'undefined' &&
    typeof opts.webpack === 'function' &&
    typeof require.resolveWeak === 'function'
  ) {
    const moduleIds = opts.webpack()
    READY_INITIALIZERS.push((ids) => {
      for (const moduleId of moduleIds) {
        if (ids.indexOf(moduleId) !== -1) {
          return init()
        }
      }
    })
  }

  const LoadableComponent = (props, ref) => {
    init()

    const context = React.useContext(LoadableContext)
    const state = useSubscription(subscription)

    React.useImperativeHandle(
      ref,
      () => ({
        retry: subscription.retry,
      }),
      []
    )

    if (context && Array.isArray(opts.modules)) {
      opts.modules.forEach((moduleName) => {
        context(moduleName)
      })
    }

    return React.useMemo(() => {
      if (state.loading || state.error) {
        return React.createElement(opts.loading, {
          isLoading: state.loading,
          pastDelay: state.pastDelay,
          timedOut: state.timedOut,
          error: state.error,
          retry: subscription.retry,
        })
      } else if (state.loaded) {
        return React.createElement(resolve(state.loaded), props)
      } else {
        return null
      }
    }, [props, state])
  }

  LoadableComponent.preload = () => init()
  LoadableComponent.displayName = 'LoadableComponent'

  return React.forwardRef(LoadableComponent)
}

class LoadableSubscription {
  constructor(loadFn, opts) {
    this._loadFn = loadFn
    this._opts = opts
    this._callbacks = new Set()
    this._delay = null
    this._timeout = null

    this.retry()
  }

  promise() {
    return this._res.promise
  }

  retry() {
    this._clearTimeouts()
    this._res = this._loadFn(this._opts.loader)

    this._state = {
      pastDelay: false,
      timedOut: false,
    }

    const { _res: res, _opts: opts } = this

    if (res.loading) {
      if (typeof opts.delay === 'number') {
        if (opts.delay === 0) {
          this._state.pastDelay = true
        } else {
          this._delay = setTimeout(() => {
            this._update({
              pastDelay: true,
            })
          }, opts.delay)
        }
      }

      if (typeof opts.timeout === 'number') {
        this._timeout = setTimeout(() => {
          this._update({ timedOut: true })
        }, opts.timeout)
      }
    }

    this._res.promise
      .then(() => {
        this._update({})
        this._clearTimeouts()
      })
      .catch((_err) => {
        this._update({})
        this._clearTimeouts()
      })
    this._update({})
  }

  _update(partial) {
    this._state = {
      ...this._state,
      error: this._res.error,
      loaded: this._res.loaded,
      loading: this._res.loading,
      ...partial,
    }
    this._callbacks.forEach((callback) => callback())
  }

  _clearTimeouts() {
    clearTimeout(this._delay)
    clearTimeout(this._timeout)
  }

  getCurrentValue() {
    return this._state
  }

  subscribe(callback) {
    this._callbacks.add(callback)
    return () => {
      this._callbacks.delete(callback)
    }
  }
}

function Loadable(opts) {
  return createLoadableComponent(load, opts)
}

function flushInitializers(initializers, ids) {
  let promises = []

  while (initializers.length) {
    let init = initializers.pop()
    promises.push(init(ids))
  }

  return Promise.all(promises).then(() => {
    if (initializers.length) {
      return flushInitializers(initializers, ids)
    }
  })
}

Loadable.preloadAll = () => {
  return new Promise((resolveInitializers, reject) => {
    flushInitializers(ALL_INITIALIZERS).then(resolveInitializers, reject)
  })
}

Loadable.preloadReady = (ids = []) => {
  return new Promise((resolvePreload) => {
    const res = () => {
      initialized = true
      return resolvePreload()
    }
    // We always will resolve, errors should be handled within loading UIs.
    flushInitializers(READY_INITIALIZERS, ids).then(res, res)
  })
}

if (typeof window !== 'undefined') {
  window.__NEXT_PRELOADREADY = Loadable.preloadReady
}

export default Loadable

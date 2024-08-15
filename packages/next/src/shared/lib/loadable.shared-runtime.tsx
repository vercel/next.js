// TODO: Remove use of `any` type.
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
import { LoadableContext } from './loadable-context.shared-runtime'

function resolve(obj: any) {
  return obj && obj.default ? obj.default : obj
}

const ALL_INITIALIZERS: any[] = []
const READY_INITIALIZERS: any[] = []
let initialized = false

function load(loader: any) {
  let promise = loader()

  let state: any = {
    loading: true,
    loaded: null,
    error: null,
  }

  state.promise = promise
    .then((loaded: any) => {
      state.loading = false
      state.loaded = loaded
      return loaded
    })
    .catch((err: any) => {
      state.loading = false
      state.error = err
      throw err
    })

  return state
}

function createLoadableComponent(loadFn: any, options: any) {
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

  /** @type LoadableSubscription */
  let subscription: any = null
  function init() {
    if (!subscription) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
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
  if (!initialized && typeof window !== 'undefined') {
    // require.resolveWeak check is needed for environments that don't have it available like Jest
    const moduleIds =
      opts.webpack && typeof (require as any).resolveWeak === 'function'
        ? opts.webpack()
        : opts.modules
    if (moduleIds) {
      READY_INITIALIZERS.push((ids: any) => {
        for (const moduleId of moduleIds) {
          if (ids.includes(moduleId)) {
            return init()
          }
        }
      })
    }
  }

  function useLoadableModule() {
    init()

    const context = React.useContext(LoadableContext)
    if (context && Array.isArray(opts.modules)) {
      opts.modules.forEach((moduleName: any) => {
        context(moduleName)
      })
    }
  }

  function LoadableComponent(props: any, ref: any) {
    useLoadableModule()

    const state = (React as any).useSyncExternalStore(
      subscription.subscribe,
      subscription.getCurrentValue,
      subscription.getCurrentValue
    )

    React.useImperativeHandle(
      ref,
      () => ({
        retry: subscription.retry,
      }),
      []
    )

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
  _loadFn: any
  _opts: any
  _callbacks: any
  _delay: any
  _timeout: any
  _res: any
  _state: any
  constructor(loadFn: any, opts: any) {
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
      .catch((_err: any) => {
        this._update({})
        this._clearTimeouts()
      })
    this._update({})
  }

  _update(partial: any) {
    this._state = {
      ...this._state,
      error: this._res.error,
      loaded: this._res.loaded,
      loading: this._res.loading,
      ...partial,
    }
    this._callbacks.forEach((callback: any) => callback())
  }

  _clearTimeouts() {
    clearTimeout(this._delay)
    clearTimeout(this._timeout)
  }

  getCurrentValue() {
    return this._state
  }

  subscribe(callback: any) {
    this._callbacks.add(callback)
    return () => {
      this._callbacks.delete(callback)
    }
  }
}

function Loadable(opts: any) {
  return createLoadableComponent(load, opts)
}

function flushInitializers(initializers: any, ids?: any): any {
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

Loadable.preloadReady = (ids: (string | number)[] = []): Promise<void> => {
  return new Promise<void>((resolvePreload) => {
    const res = () => {
      initialized = true
      return resolvePreload()
    }
    // We always will resolve, errors should be handled within loading UIs.
    flushInitializers(READY_INITIALIZERS, ids).then(res, res)
  })
}

declare global {
  interface Window {
    __NEXT_PRELOADREADY?: (ids?: (string | number)[]) => Promise<void>
  }
}

if (typeof window !== 'undefined') {
  window.__NEXT_PRELOADREADY = Loadable.preloadReady
}

export default Loadable

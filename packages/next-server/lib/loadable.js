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
import { LoadableContext } from './loadable-context'

const ALL_INITIALIZERS = []
const READY_INITIALIZERS = []
let initialized = false

function load (loader) {
  let promise = loader()

  let state = {
    loading: true,
    loaded: null,
    error: null
  }

  state.promise = promise
    .then(loaded => {
      state.loading = false
      state.loaded = loaded
      return loaded
    })
    .catch(err => {
      state.loading = false
      state.error = err
      throw err
    })

  return state
}

function loadMap (obj) {
  let state = {
    loading: false,
    loaded: {},
    error: null
  }

  let promises = []

  try {
    Object.keys(obj).forEach(key => {
      let result = load(obj[key])

      if (!result.loading) {
        state.loaded[key] = result.loaded
        state.error = result.error
      } else {
        state.loading = true
      }

      promises.push(result.promise)

      result.promise
        .then(res => {
          state.loaded[key] = res
        })
        .catch(err => {
          state.error = err
        })
    })
  } catch (err) {
    state.error = err
  }

  state.promise = Promise.all(promises)
    .then(res => {
      state.loading = false
      return res
    })
    .catch(err => {
      state.loading = false
      throw err
    })

  return state
}

function resolve (obj) {
  return obj && obj.__esModule ? obj.default : obj
}

function render (loaded, props) {
  return React.createElement(resolve(loaded), props)
}

function createLoadableComponent (loadFn, options) {
  let opts = Object.assign(
    {
      loader: null,
      loading: null,
      delay: 200,
      timeout: null,
      render: render,
      webpack: null,
      modules: null
    },
    options
  )

  let res = null

  function init () {
    if (!res) {
      res = loadFn(opts.loader)
    }
    return res.promise
  }

  // Server only
  if (typeof window === 'undefined') {
    ALL_INITIALIZERS.push(init)
  }

  // Client only
  if (
    !initialized &&
    typeof window !== 'undefined' &&
    typeof opts.webpack === 'function'
  ) {
    const moduleIds = opts.webpack()
    READY_INITIALIZERS.push(ids => {
      for (const moduleId of moduleIds) {
        if (ids.indexOf(moduleId) !== -1) {
          return init()
        }
      }
    })
  }

  return class LoadableComponent extends React.Component {
    constructor (props) {
      super(props)
      init()

      this.state = {
        error: res.error,
        pastDelay: false,
        timedOut: false,
        loading: res.loading,
        loaded: res.loaded
      }
    }

    static preload () {
      return init()
    }

    static contextType = LoadableContext
    // TODO: change it before next major React release
    // eslint-disable-next-line
    UNSAFE_componentWillMount() {
      this._mounted = true
      this._loadModule()
    }

    _loadModule () {
      if (this.context && Array.isArray(opts.modules)) {
        opts.modules.forEach(moduleName => {
          this.context(moduleName)
        })
      }

      if (!res.loading) {
        return
      }

      if (typeof opts.delay === 'number') {
        if (opts.delay === 0) {
          this.setState({ pastDelay: true })
        } else {
          this._delay = setTimeout(() => {
            this.setState({ pastDelay: true })
          }, opts.delay)
        }
      }

      if (typeof opts.timeout === 'number') {
        this._timeout = setTimeout(() => {
          this.setState({ timedOut: true })
        }, opts.timeout)
      }

      let update = () => {
        if (!this._mounted) {
          return
        }

        this.setState({
          error: res.error,
          loaded: res.loaded,
          loading: res.loading
        })

        this._clearTimeouts()
      }

      res.promise
        .then(() => {
          update()
        })
        // eslint-disable-next-line handle-callback-err
        .catch(err => {
          update()
        })
    }

    componentWillUnmount () {
      this._mounted = false
      this._clearTimeouts()
    }

    _clearTimeouts () {
      clearTimeout(this._delay)
      clearTimeout(this._timeout)
    }

    retry = () => {
      this.setState({ error: null, loading: true, timedOut: false })
      res = loadFn(opts.loader)
      this._loadModule()
    }

    render () {
      if (this.state.loading || this.state.error) {
        return React.createElement(opts.loading, {
          isLoading: this.state.loading,
          pastDelay: this.state.pastDelay,
          timedOut: this.state.timedOut,
          error: this.state.error,
          retry: this.retry
        })
      } else if (this.state.loaded) {
        return opts.render(this.state.loaded, this.props)
      } else {
        return null
      }
    }
  }
}

function Loadable (opts) {
  return createLoadableComponent(load, opts)
}

function LoadableMap (opts) {
  if (typeof opts.render !== 'function') {
    throw new Error('LoadableMap requires a `render(loaded, props)` function')
  }

  return createLoadableComponent(loadMap, opts)
}

Loadable.Map = LoadableMap

function flushInitializers (initializers, ids) {
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
  return new Promise((resolve, reject) => {
    flushInitializers(ALL_INITIALIZERS).then(resolve, reject)
  })
}

Loadable.preloadReady = (ids = []) => {
  return new Promise(resolve => {
    const res = () => {
      initialized = true
      return resolve()
    }
    // We always will resolve, errors should be handled within loading UIs.
    flushInitializers(READY_INITIALIZERS, ids).then(res, res)
  })
}

if (typeof window !== 'undefined') {
  window.__NEXT_PRELOADREADY = Loadable.preloadReady
}

export default Loadable

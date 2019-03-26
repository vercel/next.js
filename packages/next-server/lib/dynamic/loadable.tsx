import React from 'react'
import { AsyncComponent, loadingOptions, Component } from './index'

interface InterfaceBaseOptions {
  loading?: React.ComponentType<loadingOptions> | (() => null),
  delay?: number,
  timeout?: number,
}

interface InterfaceOptions<P> extends InterfaceBaseOptions {
  kind: 'single',
  loader: () => AsyncComponent<P>,
}

interface InterfaceMapOptions<P, T, K extends keyof T> extends InterfaceBaseOptions {
  kind: 'map',
  loader: Record<K, () => Promise<Component<T[K]>>>,
  render: (props: P, loaded: Record<K, Component<T[K]>>) => React.ReactNode,
  modules: () => Record<K, Component<T[K]>>,
}

type Options<P, T, K extends keyof T> = InterfaceOptions<P> | InterfaceMapOptions<P, T, K>

type LoaderPromise<P, T, K extends keyof T, O> = Promise<O extends InterfaceOptions<P> ? React.ComponentType<P> : Record<K, React.ComponentType<T[K]>>>

type LoadablePromise<P, T, K extends keyof T, O> = {
  val: LoaderPromise<P, T, K, O> | null,
}

type State<P, T, K extends keyof T, O> = {
  error: Error | null,
  pastDelay: boolean,
  timedOut: boolean,
  loading: boolean,
  loaded: (O extends InterfaceOptions<P> ? React.ComponentType<P> : Record<K, React.ComponentType<T[K]>>) | null,
}

export class Loadable <
  P extends {},
  T extends { [k: string]: {}},
  K extends keyof T,
  O extends Options<P, T, K>
> extends React.Component<P, State<P, T, K, O>> {
  private _mounted = false
  private options: O

  // promise object is a reference
  constructor(props: P, options: O, promise: LoadablePromise<P, T, K, O>) {
    super(props)

    this.options = {
      delay: 200,
      ...options,
    }

    this.state = {
      error: null,
      pastDelay: false,
      timedOut: false,
      loading: true,
      loaded: null,
    }

    if (!promise.val) promise.val = Loadable.createPromise<P, T, K, O>(options)
    promise.val
      .then((loaded) => {
        this.setState({
          loading: false,
          loaded,
        })
      })
      .catch((error) => {
        this.setState({
          loading: false,
          error,
        })
      })
  }

  static async loadMap<T, K extends keyof T>(loader: Record<K, () => Promise<Component<T[K]>>>): Promise<Record<K, Component<T[K]>>> {
    const components: Array<Promise<[K, Component<T[K]>]>> = []

    for (const l in loader) {
      if (loader.hasOwnProperty(l)) {
        components.push(loader[l]().then((loaded) => [l, loaded] as [K, Component<T[K]>]))
      }
    }

    const map = await Promise.all(components)

    const loaded = { [map[0][0]]: map[0][1] } as Record<K, Component<T[K]>>

    map.forEach((l, k) => {
      if (k !== 0) loaded[l[0]] = l[1]
    })

    return loaded
  }

  static createPromise<P, T extends {[key: string]: {}}, K extends keyof T, O>(options: Options<P, T, K>) {
    return (options.kind === 'single' ? options.loader() : Loadable.loadMap<T, K>(options.loader)) as LoaderPromise<P, T, K, O>
  }

  /* Past here hasn't been rewritten yet */
  componentWillMount() {
    this._mounted = true
    this._loadModule()
  }

  _loadModule() {
    if (this.context.loadable && Array.isArray(opts.modules)) {
      opts.modules.forEach((moduleName) => {
        this.context.loadable.report(moduleName)
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

    const update = () => {
      if (!this._mounted) {
        return
      }

      this.setState({
        error: res.error,
        loaded: res.loaded,
        loading: res.loading,
      })

      this._clearTimeouts()
    }

    res.promise
      .then(() => {
        update()
      })
      // eslint-disable-next-line handle-callback-err
      .catch((err) => {
        update()
      })
  }

  componentWillUnmount() {
    this._mounted = false
    this._clearTimeouts()
  }

  _clearTimeouts() {
    clearTimeout(this._delay)
    clearTimeout(this._timeout)
  }

  retry() {
    this.setState({ error: null, loading: true, timedOut: false })
    res = loadFn(opts.loader)
    this._loadModule()
  }

  render() {
    if (this.state.loading || this.state.error) {
      return React.createElement(opts.loading, {
        isLoading: this.state.loading,
        pastDelay: this.state.pastDelay,
        timedOut: this.state.timedOut,
        error: this.state.error,
        retry: this.retry,
      })
    } else if (this.state.loaded) {
      return opts.render(this.state.loaded, this.props)
    } else {
      return null
    }
  }
}

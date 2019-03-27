/**
 * @copyright (c) 2017-present James Kyle <me@thejameskyle.com>
 * MIT License
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *  The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE
 */
// https://github.com/jamiebuilds/react-loadable/blob/v5.5.0/src/index.js
// Modified to be compatible with webpack 4 / Next.js / TypeScript

import React from 'react'

export type loadingOptions = {
  isLoading: boolean,
  pastDelay: boolean,
  timedOut: boolean,
  error: any,
  readonly retry: () => void,
}

interface InterfaceBaseOptions {
  readonly loading: React.ComponentType<loadingOptions> | (() => null),
  readonly delay?: number,
  readonly timeout?: number,
}

interface InterfaceOptions<P> extends InterfaceBaseOptions {
  readonly kind: 'single',
  readonly loader: () => Promise<React.ComponentType<P>>,
}

interface InterfaceMapOptions<P, T, K extends keyof T> extends InterfaceBaseOptions {
  readonly kind: 'map',
  readonly loader: Record<K, () => Promise<React.ComponentType<T[K]>>>,
  readonly render: (loaded: Record<K, React.ComponentType<T[K]>>, props: P) => React.ReactNode,
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
  O extends Options<P, T, K>,
  R extends LoadablePromise<P, T, K, O>
> extends React.Component<P, State<P, T, K, O>> {
  private timeout?: NodeJS.Timeout | number
  private delay?: NodeJS.Timeout | number
  private options: O
  private readonly promise: R

  // promise object is a reference
  constructor(props: P, options: O, promise: R) {
    super(props)

    this.options = {
      delay: 200,
      ...options,
    }

    this.state = {
      pastDelay: !this.options.delay || this.options.delay <= 0,
      timedOut: typeof this.options.timeout !== 'undefined' && this.options.timeout <= 0,
      loading: true,
      loaded: null,
      error: null,
    }

    // store as reference
    this.promise = promise

    if (!this.promise.val) this.promise.val = this.bindNewPromise()

    this.promise.val
      .then((loaded) => {
        this.clearTimeouts()
        this.setState({
          loading: false,
          loaded,
        })
      })
      .catch((error) => {
        this.clearTimeouts()
        this.setState({
          loading: false,
          error,
        })
      })
  }

  private static async loadMap<T, K extends keyof T>(loader: Record<K, () => Promise<React.ComponentType<T[K]>>>): Promise<Record<K, React.ComponentType<T[K]>>> {
    const components: Array<Promise<[K, React.ComponentType<T[K]>]>> = []

    for (const l in loader) {
      if (loader.hasOwnProperty(l)) {
        components.push(loader[l]().then((loaded) => [l, loaded] as [K, React.ComponentType<T[K]>]))
      }
    }

    const map = await Promise.all(components)

    const loaded = { [map[0][0]]: map[0][1] } as Record<K, React.ComponentType<T[K]>>

    map.forEach((l, k) => {
      if (k !== 0) loaded[l[0]] = l[1]
    })

    return loaded
  }

  private static createPromise<
    P extends {},
    T extends {[key: string]: {}},
    K extends keyof T,
    O extends Options<P, T, K>
  >(options: Options<P, T, K>) {
    return (
      Loadable.hasMapLoader(options)
        ? Loadable.loadMap<T, K>(options.loader)
        : options.loader()
      ) as LoaderPromise<P, T, K, O>
  }

  private bindNewPromise() {
    if (this.options.timeout && 0 < this.options.timeout) {
      this.timeout = setTimeout(() => {
        this.setState({ timedOut: true })
      }, this.options.timeout)
    }

    if (this.options.delay && 0 < this.options.delay) {
      this.delay = setTimeout(() => {
        this.setState({ pastDelay: true })
      }, this.options.delay)
    }

    return Loadable.createPromise<P, T, K, O>(this.options)
  }

  private clearTimeouts() {
    if (typeof this.delay === 'number') {
      window.clearTimeout(this.delay)
    } else {
      clearTimeout(this.delay as NodeJS.Timeout)
    }

    if (typeof this.timeout === 'number') {
      window.clearTimeout(this.timeout)
    } else {
      clearTimeout(this.timeout as NodeJS.Timeout)
    }
  }

  private retry() {
    this.setState({ error: null, loading: true, timedOut: false })
    this.promise.val = this.bindNewPromise()
  }

  private static hasMapLoader<P, T, K extends keyof T>(options: Options<P, T, K>): options is InterfaceMapOptions<P, T, K> {
    return options.kind === 'map'
  }

  render() {
    if (this.state.loading || this.state.error) {
      return React.createElement(this.options.loading, {
        isLoading: this.state.loading,
        pastDelay: this.state.pastDelay,
        timedOut: this.state.timedOut,
        error: this.state.error,
        retry: this.retry,
      })
    } else if (this.state.loaded) {
      if (Loadable.hasMapLoader(this.options)) {
        return this.options.render(this.state.loaded as Record<K, React.ComponentType<T[K]>>, this.props)
      } else {
        return React.createElement(this.state.loaded as React.ComponentType<P>, this.props)
      }
    } else {
      return null
    }
  }
}

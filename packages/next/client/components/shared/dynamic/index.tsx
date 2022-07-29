import React from 'react'
import Loadable from './loadable'

export type LoaderComponent<P = {}> = Promise<
  React.ComponentType<P> | { default: React.ComponentType<P> }
>

export type Loader<P = {}> = (() => LoaderComponent<P>) | LoaderComponent<P>

export type LoaderMap = { [mdule: string]: () => Loader<any> }

export type LoadableGeneratedOptions = {
  webpack?(): any
  modules?(): LoaderMap
}

export type DynamicOptions<P = {}> = LoadableGeneratedOptions & {
  loader?: Loader<P>
  loadableGenerated?: LoadableGeneratedOptions
}

export type LoadableOptions<P = {}> = DynamicOptions<P>

export type LoadableFn<P = {}> = (
  opts: LoadableOptions<P>
) => React.ComponentType<P>

export type LoadableComponent<P = {}> = React.ComponentType<P>

export default function dynamic<P = {}>(
  loader: Loader<P>,
  options?: DynamicOptions<P>
): React.ComponentType<P> {
  let loadableFn: LoadableFn<P> = Loadable
  let loadableOptions: LoadableOptions<P> = {
    ...options,
    loader,
  }

  // coming from build/babel/plugins/react-loadable-plugin.js
  if (loadableOptions.loadableGenerated) {
    loadableOptions = {
      ...loadableOptions,
      ...loadableOptions.loadableGenerated,
    }
    delete loadableOptions.loadableGenerated
  }

  return loadableFn(loadableOptions)
}

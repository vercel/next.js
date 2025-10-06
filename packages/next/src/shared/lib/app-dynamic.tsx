import type React from 'react'
import type { JSX } from 'react'
import Loadable from './lazy-dynamic/loadable'

import type {
  LoadableGeneratedOptions,
  DynamicOptionsLoadingProps,
  Loader,
  LoaderComponent,
} from './lazy-dynamic/types'

export {
  type LoadableGeneratedOptions,
  type DynamicOptionsLoadingProps,
  type Loader,
  type LoaderComponent,
}

export type DynamicOptions<P = {}> = LoadableGeneratedOptions & {
  loading?: () => JSX.Element | null
  loader?: Loader<P>
  loadableGenerated?: LoadableGeneratedOptions
  modules?: string[]
  ssr?: boolean
}

export type LoadableOptions<P = {}> = DynamicOptions<P>

export type LoadableFn<P = {}> = (
  opts: LoadableOptions<P>
) => React.ComponentType<P>

export type LoadableComponent<P = {}> = React.ComponentType<P>

export default function dynamic<P = {}>(
  dynamicOptions: DynamicOptions<P> | Loader<P>,
  options?: DynamicOptions<P>
): React.ComponentType<P> {
  const loadableOptions: LoadableOptions<P> = {}

  if (typeof dynamicOptions === 'function') {
    loadableOptions.loader = dynamicOptions
  }

  const mergedOptions = {
    ...loadableOptions,
    ...options,
  }

  return Loadable({
    ...mergedOptions,
    modules: mergedOptions.loadableGenerated?.modules,
  })
}

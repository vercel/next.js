import React from 'react'

export type LoaderComponent<P = {}> = Promise<{
  default: React.ComponentType<P>
}>

export type Loader<P = {}> = () => LoaderComponent<P>

export type DynamicOptions<P = {}> = {
  loader?: Loader<P>
}

export type LoadableComponent<P = {}> = React.ComponentType<P>

export default function dynamic<P = {}>(
  loader: Loader<P>
): React.ComponentType<P> {
  return React.lazy(loader)
}

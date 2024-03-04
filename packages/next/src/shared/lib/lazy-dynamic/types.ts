export type ComponentModule<P = {}> = { default: React.ComponentType<P> }

export declare type LoaderComponent<P = {}> = Promise<
  React.ComponentType<P> | ComponentModule<P>
>

export declare type Loader<P = {}> = () => LoaderComponent<P>

export type LoaderMap = { [module: string]: () => Loader<any> }

export type LoadableGeneratedOptions = {
  webpack?(): any
  modules?(): LoaderMap
}

export type DynamicOptionsLoadingProps = {
  error?: Error | null
  isLoading?: boolean
  pastDelay?: boolean
  retry?: () => void
  timedOut?: boolean
}

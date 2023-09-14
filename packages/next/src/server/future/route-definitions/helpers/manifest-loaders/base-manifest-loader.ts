import { ManifestsLoader } from './manifest-loader'

export class BaseManifestLoader<M> implements ManifestsLoader<M> {
  constructor(
    private readonly getter: { [K in keyof M]: () => M[K] | undefined | null }
  ) {}

  public load<K extends keyof M>(name: K): M[K] | null {
    return this.getter[name]() ?? null
  }
}

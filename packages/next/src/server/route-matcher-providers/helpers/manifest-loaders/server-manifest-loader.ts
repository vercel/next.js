import type { Manifest, ManifestLoader } from './manifest-loader'

export class ServerManifestLoader implements ManifestLoader {
  constructor(private readonly getter: (name: string) => Manifest | null) {}

  public load(name: string): Manifest | null {
    return this.getter(name)
  }
}

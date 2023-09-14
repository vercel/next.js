import { SERVER_DIRECTORY } from '../../../../../shared/lib/constants'
import path from '../../../../../shared/lib/isomorphic/path'
import { ManifestsLoader } from './manifest-loader'

export class NodeManifestLoader<
  M extends {
    [key: string]: any
  }
> implements ManifestsLoader<M>
{
  constructor(private readonly distDir: string) {}

  static require(id: string) {
    try {
      return require(id)
    } catch {
      return null
    }
  }

  public load<K extends keyof M>(name: K): M[K] | null {
    return NodeManifestLoader.require(
      path.join(this.distDir, SERVER_DIRECTORY, name as string)
    )
  }
}

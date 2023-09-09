export type Manifest = Record<string, string>

export interface ManifestLoader<M extends Manifest = Manifest> {
  load(name: string): M | null
}

export type Manifest = Record<string, string>

export interface ManifestLoader {
  load(name: string): Promise<Manifest | null> | Manifest | null
}

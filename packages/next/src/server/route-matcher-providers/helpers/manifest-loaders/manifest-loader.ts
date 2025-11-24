export type Manifest = Record<string, string>

export interface ManifestLoader {
  load(name: string): Manifest | null
}

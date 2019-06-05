export type ManifestItem = {
  id: number | string
  name: string
  file: string
  publicPath: string
}

export type Manifest = { [moduleId: string]: ManifestItem[] }

type DynamicImportBundles = Set<ManifestItem>

// Based on https://github.com/jamiebuilds/react-loadable/pull/132
export function getDynamicImportBundles(
  manifest: Manifest,
  moduleIds: string[]
): DynamicImportBundles {
  return moduleIds.reduce(
    (bundles: DynamicImportBundles, moduleId: string): DynamicImportBundles => {
      if (typeof manifest[moduleId] === 'undefined') {
        return bundles
      }

      manifest[moduleId].map(item => bundles.add(item))
      return bundles
    },
    new Set()
  )
}

let assetPrefix

export default function asset (path) {
  const pathWithoutSlash = path.replace(/^\//, '')
  return `${assetPrefix}/static/${pathWithoutSlash}`
}

export function setAssetPrefix (url) {
  assetPrefix = url
}

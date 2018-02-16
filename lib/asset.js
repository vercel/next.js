let assetPrefix

export default function asset (path) {
  // If the URL starts with http, we assume it's an
  if (/^https?:\/\//.test(path)) {
    return path
  }

  const pathWithoutSlash = path.replace(/^\//, '')
  return `${assetPrefix || ''}/static/${pathWithoutSlash}`
}

export function setAssetPrefix (url) {
  assetPrefix = url
}

export default function getAssetPath (hash, asset, assetPrefix = '', assetMap = null) {
  // rudimentary `assetMap` support,
  // meant to be used within custom `get-asset-path` functions
  if (assetMap && assetMap[asset]) {
    asset = assetMap[asset]
  }
  return `${assetPrefix}/_next/${hash}${asset}`
}

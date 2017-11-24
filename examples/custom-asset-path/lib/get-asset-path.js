export default function getAssetPath (hash, asset, assetPrefix, assetMap) {
  // rudimentary `assetMap` support,
  // meant to be used within custom `get-asset-path` functions
  if (assetMap && assetMap[asset]) {
    asset = assetMap[asset]
  }
  return `${assetPrefix}/v123/${hash}${asset}`
}

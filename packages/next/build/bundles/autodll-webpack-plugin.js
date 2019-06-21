const path = require('path')

module.exports = distDir => {
  const autodllCachePath = path.resolve(
    path.join(distDir, 'cache', 'autodll-webpack-plugin')
  )

  const autoDllWebpackPluginPaths = require('autodll-webpack-plugin/lib/paths')
  autoDllWebpackPluginPaths.cacheDir = autodllCachePath
  autoDllWebpackPluginPaths.getManifestPath = hash => bundleName =>
    path.resolve(autodllCachePath, hash, `${bundleName}.manifest.json`)

  return require('autodll-webpack-plugin')
}

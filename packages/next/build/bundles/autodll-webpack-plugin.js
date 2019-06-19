const autoDllWebpackPlugin = require('autodll-webpack-plugin')
const autoDllWebpackPluginPaths = require('autodll-webpack-plugin/lib/paths')
const path = require('path')

exports.setCacheDir = function (distDir) {
  const autodllCachePath = path.resolve(
    path.join(distDir, 'cache', 'autodll-webpack-plugin')
  )
  autoDllWebpackPluginPaths.cacheDir = autodllCachePath
  autoDllWebpackPluginPaths.getManifestPath = hash => bundleName =>
    path.resolve(autodllCachePath, hash, `${bundleName}.manifest.json`)
}

exports.AutoDllPlugin = autoDllWebpackPlugin

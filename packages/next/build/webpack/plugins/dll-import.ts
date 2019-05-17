import path from 'path'

export function importAutoDllPlugin({ distDir }: { distDir: string }) {
  const autodllPaths = require.resolve(
    'next/dist/compiled/autodll-webpack-plugin/paths'
  )
  require(autodllPaths)

  const autodllCachePath = path.resolve(
    path.join(distDir, 'cache', 'autodll-webpack-plugin')
  )
  require.cache[autodllPaths] = Object.assign({}, require.cache[autodllPaths], {
    exports: Object.assign({}, require.cache[autodllPaths].exports, {
      cacheDir: autodllCachePath,
      getManifestPath: (hash: string) => (bundleName: string) =>
        path.resolve(autodllCachePath, hash, `${bundleName}.manifest.json`),
    }),
  })

  const AutoDllPlugin = require('next/dist/compiled/autodll-webpack-plugin')
  return AutoDllPlugin
}

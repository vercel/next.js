import loaderUtils from 'loader-utils'
import { runLoaders } from 'next/dist/compiled/loader-runner'

module.exports.pitch = function () {
  const _this = this

  const callback = _this.async()
  const loaderOptions = loaderUtils.getOptions(_this) || {}

  runLoaders(
    {
      ..._this,
      context: { ..._this },
      loaders: [
        loaderOptions.hasReactRefresh
          ? require.resolve('@next/react-refresh-utils/loader')
          : null,
        {
          loader: require.resolve('./only-babel-loader.js'),
          options: loaderOptions,
        },
        ..._this.loaders.slice(_this.loaderIndex + 1).map((l) => {
          return {
            loader: l.path,
            options: l.options,
            ident: l.ident,
          }
        }),
      ].filter(Boolean),
    },
    function (err, result) {
      if (err) {
        callback(err)
      } else {
        _this.cacheable(result.cacheable ?? true)
        result.fileDependencies.forEach((d) => _this.addDependency(d))
        result.contextDependencies.forEach((d) => _this.addContextDependency(d))
        callback(null, ...result.result)
      }
    }
  )
}

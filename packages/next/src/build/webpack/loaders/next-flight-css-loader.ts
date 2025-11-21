/**
 * For server-side CSS imports, we need to ignore the actual module content but
 * still trigger the hot-reloading diff mechanism. So here we put the content
 * inside a comment.
 */

import crypto from 'crypto'
import type webpack from 'webpack'

type NextServerCSSLoaderOptions = {
  cssModules: boolean
}

const NextServerCSSLoader: webpack.LoaderDefinitionFunction<NextServerCSSLoaderOptions> =
  function (content) {
    this.cacheable && this.cacheable()
    const options = this.getOptions()
    let isCSSModule = options.cssModules

    // Only add the checksum during development.
    if (process.env.NODE_ENV !== 'production') {
      // This check is only for backwards compatibility.
      // TODO: Remove this in the next major version (next 14)
      if (isCSSModule === undefined) {
        this.emitWarning(
          new Error(
            "No 'cssModules' option was found for the next-flight-css-loader plugin."
          )
        )
        isCSSModule =
          this.resourcePath.match(/\.module\.(css|sass|scss)$/) !== null
      }
      const checksum = crypto
        .createHash('sha1')
        .update(typeof content === 'string' ? Buffer.from(content) : content)
        .digest()
        .toString('hex')
        .substring(0, 12)

      if (isCSSModule) {
        return `\
${content}
module.exports.__checksum = ${JSON.stringify(checksum)}
`
      }

      // Server CSS imports are always available for HMR, so we attach
      // `module.hot.accept()` to the generated module.
      const hmrCode = 'if (module.hot) { module.hot.accept() }'

      return `\
export default ${JSON.stringify(checksum)}
${hmrCode}
`
    }

    return content
  }

export default NextServerCSSLoader

import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { getRspackCore } from '../../../../../../shared/lib/get-rspack'

export function getClientStyleLoader({
  hasAppDir,
  isAppDir,
  isDevelopment,
  assetPrefix,
}: {
  hasAppDir: boolean
  isAppDir?: boolean
  isDevelopment: boolean
  assetPrefix: string
}): webpack.RuleSetUseItem {
  const isRspack = Boolean(process.env.NEXT_RSPACK)
  const shouldEnableApp = typeof isAppDir === 'boolean' ? isAppDir : hasAppDir

  // Keep next-style-loader for development mode in `pages/`
  if (isDevelopment && !shouldEnableApp) {
    return {
      loader: 'next-style-loader',
      options: {
        insert: function (element: Node) {
          // By default, style-loader injects CSS into the bottom
          // of <head>. This causes ordering problems between dev
          // and prod. To fix this, we render a <noscript> tag as
          // an anchor for the styles to be placed before. These
          // styles will be applied _before_ <style jsx global>.

          // These elements should always exist. If they do not,
          // this code should fail.
          var anchorElement = document.querySelector(
            '#__next_css__DO_NOT_USE__'
          )!
          var parentNode = anchorElement.parentNode! // Normally <head>

          // Each style tag should be placed right before our
          // anchor. By inserting before and not after, we do not
          // need to track the last inserted element.
          parentNode.insertBefore(element, anchorElement)
        },
      },
    }
  }

  const MiniCssExtractPlugin = isRspack
    ? getRspackCore().rspack.CssExtractRspackPlugin
    : require('../../../../plugins/mini-css-extract-plugin').default

  return {
    loader: MiniCssExtractPlugin.loader,
    options: {
      publicPath: `${assetPrefix}/_next/`,
      esModule: false,
    },
  }
}

import type { webpack } from 'next/dist/compiled/webpack/webpack'

export function getClientStyleLoader({
  isAppDir,
  isDevelopment,
  assetPrefix,
}: {
  isAppDir: boolean
  isDevelopment: boolean
  assetPrefix: string
}): webpack.RuleSetUseItem {
  if (isDevelopment) {
    return {
      loader: 'next-style-loader',
      options: {
        insert: isAppDir
          ? function (element: Node) {
              // There is currently no anchor element in <head>.
              // We temporarily insert the element as the last child
              // of the first <head>.
              const head = document.querySelector('head')!
              head.insertBefore(element, head.lastChild)
            }
          : function (element: Node) {
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

  const MiniCssExtractPlugin =
    require('../../../../plugins/mini-css-extract-plugin').default
  return {
    // @ts-ignore: TODO: remove when webpack 5 is stable
    loader: MiniCssExtractPlugin.loader,
    options: { publicPath: `${assetPrefix}/_next/`, esModule: false },
  }
}

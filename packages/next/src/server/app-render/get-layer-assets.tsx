import React from 'react'
import { getCssInlinedLinkTags } from './get-css-inlined-link-tags'
import { getPreloadableFonts } from './get-preloadable-fonts'
import type { AppRenderContext } from './app-render'
import { getAssetQueryString } from './get-asset-query-string'

export function getLayerAssets({
  ctx,
  layoutOrPagePath,
  injectedCSS: injectedCSSWithCurrentLayout,
  injectedFontPreloadTags: injectedFontPreloadTagsWithCurrentLayout,
}: {
  layoutOrPagePath: string | undefined
  injectedCSS: Set<string>
  injectedFontPreloadTags: Set<string>
  ctx: AppRenderContext
}): React.ReactNode {
  const stylesheets: string[] = layoutOrPagePath
    ? getCssInlinedLinkTags(
        ctx.clientReferenceManifest,
        layoutOrPagePath,
        injectedCSSWithCurrentLayout,
        true
      )
    : []

  const preloadedFontFiles = layoutOrPagePath
    ? getPreloadableFonts(
        ctx.renderOpts.nextFontManifest,
        layoutOrPagePath,
        injectedFontPreloadTagsWithCurrentLayout
      )
    : null

  if (preloadedFontFiles) {
    if (preloadedFontFiles.length) {
      for (let i = 0; i < preloadedFontFiles.length; i++) {
        const fontFilename = preloadedFontFiles[i]
        const ext = /\.(woff|woff2|eot|ttf|otf)$/.exec(fontFilename)![1]
        const type = `font/${ext}`
        const href = `${ctx.assetPrefix}/_next/${fontFilename}`
        ctx.componentMod.preloadFont(href, type, ctx.renderOpts.crossOrigin)
      }
    } else {
      try {
        let url = new URL(ctx.assetPrefix)
        ctx.componentMod.preconnect(url.origin, 'anonymous')
      } catch (error) {
        // assetPrefix must not be a fully qualified domain name. We assume
        // we should preconnect to same origin instead
        ctx.componentMod.preconnect('/', 'anonymous')
      }
    }
  }

  const styles = stylesheets
    ? stylesheets.map((href, index) => {
        // In dev, Safari and Firefox will cache the resource during HMR:
        // - https://github.com/vercel/next.js/issues/5860
        // - https://bugs.webkit.org/show_bug.cgi?id=187726
        // Because of this, we add a `?v=` query to bypass the cache during
        // development. We need to also make sure that the number is always
        // increasing.
        const fullHref = `${ctx.assetPrefix}/_next/${href}${getAssetQueryString(
          ctx,
          true
        )}`

        // `Precedence` is an opt-in signal for React to handle resource
        // loading and deduplication, etc. It's also used as the key to sort
        // resources so they will be injected in the correct order.
        // During HMR, it's critical to use different `precedence` values
        // for different stylesheets, so their order will be kept.
        // https://github.com/facebook/react/pull/25060
        const precedence =
          process.env.NODE_ENV === 'development' ? 'next_' + href : 'next'

        ctx.componentMod.preloadStyle(fullHref, ctx.renderOpts.crossOrigin)

        return (
          <link
            rel="stylesheet"
            href={fullHref}
            // @ts-ignore
            precedence={precedence}
            crossOrigin={ctx.renderOpts.crossOrigin}
            key={index}
          />
        )
      })
    : null

  return styles
}

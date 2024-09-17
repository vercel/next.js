import React from 'react'
import { getLinkAndScriptTags } from './get-css-inlined-link-tags'
import { getPreloadableFonts } from './get-preloadable-fonts'
import type { AppRenderContext } from './app-render'
import { getAssetQueryString } from './get-asset-query-string'
import { encodeURIPath } from '../../shared/lib/encode-uri-path'
import type { PreloadCallbacks } from './types'

export function getLayerAssets({
  ctx,
  layoutOrPagePath,
  injectedCSS: injectedCSSWithCurrentLayout,
  injectedJS: injectedJSWithCurrentLayout,
  injectedFontPreloadTags: injectedFontPreloadTagsWithCurrentLayout,
  preloadCallbacks,
}: {
  layoutOrPagePath: string | undefined
  injectedCSS: Set<string>
  injectedJS: Set<string>
  injectedFontPreloadTags: Set<string>
  ctx: AppRenderContext
  preloadCallbacks: PreloadCallbacks
}): React.ReactNode {
  const { styles: styleTags, scripts: scriptTags } = layoutOrPagePath
    ? getLinkAndScriptTags(
        ctx.clientReferenceManifest,
        layoutOrPagePath,
        injectedCSSWithCurrentLayout,
        injectedJSWithCurrentLayout,
        true
      )
    : { styles: [], scripts: [] }

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
        const href = `${ctx.assetPrefix}/_next/${encodeURIPath(fontFilename)}`

        preloadCallbacks.push(() => {
          ctx.componentMod.preloadFont(
            href,
            type,
            ctx.renderOpts.crossOrigin,
            ctx.nonce
          )
        })
      }
    } else {
      try {
        let url = new URL(ctx.assetPrefix)
        preloadCallbacks.push(() => {
          ctx.componentMod.preconnect(url.origin, 'anonymous', ctx.nonce)
        })
      } catch (error) {
        // assetPrefix must not be a fully qualified domain name. We assume
        // we should preconnect to same origin instead
        preloadCallbacks.push(() => {
          ctx.componentMod.preconnect('/', 'anonymous', ctx.nonce)
        })
      }
    }
  }

  const styles = styleTags
    ? styleTags.map((href, index) => {
        // In dev, Safari and Firefox will cache the resource during HMR:
        // - https://github.com/vercel/next.js/issues/5860
        // - https://bugs.webkit.org/show_bug.cgi?id=187726
        // Because of this, we add a `?v=` query to bypass the cache during
        // development. We need to also make sure that the number is always
        // increasing.
        const fullHref = `${ctx.assetPrefix}/_next/${encodeURIPath(
          href
        )}${getAssetQueryString(ctx, true)}`

        // `Precedence` is an opt-in signal for React to handle resource
        // loading and deduplication, etc. It's also used as the key to sort
        // resources so they will be injected in the correct order.
        // During HMR, it's critical to use different `precedence` values
        // for different stylesheets, so their order will be kept.
        // https://github.com/facebook/react/pull/25060
        const precedence =
          process.env.NODE_ENV === 'development' ? 'next_' + href : 'next'

        preloadCallbacks.push(() => {
          ctx.componentMod.preloadStyle(
            fullHref,
            ctx.renderOpts.crossOrigin,
            ctx.nonce
          )
        })
        return (
          <link
            rel="stylesheet"
            href={fullHref}
            // @ts-ignore
            precedence={precedence}
            crossOrigin={ctx.renderOpts.crossOrigin}
            key={index}
            nonce={ctx.nonce}
          />
        )
      })
    : []

  const scripts = scriptTags
    ? scriptTags.map((href, index) => {
        const fullSrc = `${ctx.assetPrefix}/_next/${encodeURIPath(
          href
        )}${getAssetQueryString(ctx, true)}`

        return (
          <script
            src={fullSrc}
            async={true}
            key={`script-${index}`}
            nonce={ctx.nonce}
          />
        )
      })
    : []

  return styles.length || scripts.length ? [...styles, ...scripts] : null
}

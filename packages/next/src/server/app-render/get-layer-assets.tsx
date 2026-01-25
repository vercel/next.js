import { getLinkAndScriptTags } from './get-css-inlined-link-tags'
import { getPreloadableFonts } from './get-preloadable-fonts'
import type { AppRenderContext } from './app-render'
import { getAssetQueryString } from './get-asset-query-string'
import { encodeURIPath } from '../../shared/lib/encode-uri-path'
import type { PreloadCallbacks, CollectedInlineCss } from './types'
import { renderCssResource } from './render-css-resource'

export function getLayerAssets({
  ctx,
  layoutOrPagePath,
  injectedCSS: injectedCSSWithCurrentLayout,
  injectedJS: injectedJSWithCurrentLayout,
  injectedFontPreloadTags: injectedFontPreloadTagsWithCurrentLayout,
  preloadCallbacks,
  collectedInlineCss,
  isRootLayout,
}: {
  layoutOrPagePath: string | undefined
  injectedCSS: Set<string>
  injectedJS: Set<string>
  injectedFontPreloadTags: Set<string>
  ctx: AppRenderContext
  preloadCallbacks: PreloadCallbacks
  collectedInlineCss?: CollectedInlineCss
  isRootLayout?: boolean
}): React.ReactNode {
  const {
    componentMod: { createElement },
  } = ctx
  const { styles: styleTags, scripts: scriptTags } = layoutOrPagePath
    ? getLinkAndScriptTags(
        layoutOrPagePath,
        injectedCSSWithCurrentLayout,
        injectedJSWithCurrentLayout,
        true
      )
    : { styles: [], scripts: [] }

  // Track root layout CSS paths for inlineCss: 'shared' mode
  // Root layout CSS is guaranteed to be shared across all pages
  if (isRootLayout && collectedInlineCss && styleTags.length > 0) {
    if (!collectedInlineCss.rootLayoutCSSPaths) {
      collectedInlineCss.rootLayoutCSSPaths = new Set()
    }
    for (const css of styleTags) {
      collectedInlineCss.rootLayoutCSSPaths.add(css.path)
    }
  }

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

  const styles = renderCssResource(
    styleTags,
    ctx,
    preloadCallbacks,
    collectedInlineCss
  )

  const scripts = scriptTags
    ? scriptTags.map((href, index) => {
        const fullSrc = `${ctx.assetPrefix}/_next/${encodeURIPath(
          href
        )}${getAssetQueryString(ctx, true)}`

        return createElement('script', {
          src: fullSrc,
          async: true,
          key: `script-${index}`,
          nonce: ctx.nonce,
        })
      })
    : []

  return styles.length || scripts.length ? [...styles, ...scripts] : null
}

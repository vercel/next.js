import type { CssResource } from '../../build/webpack/plugins/flight-manifest-plugin'
import { encodeURIPath } from '../../shared/lib/encode-uri-path'
import type { AppRenderContext } from './app-render'
import { getAssetQueryString } from './get-asset-query-string'
import type { PreloadCallbacks, CollectedInlineCss } from './types'

/**
 * Abstracts the rendering of CSS files based on whether they are inlined or not.
 * For inlined CSS, renders a <style> tag with the CSS content directly embedded.
 * For external CSS files, renders a <link> tag pointing to the CSS file.
 *
 * When collectedInlineCss is provided, inline CSS is collected for injection
 * via ServerInsertedHTML instead of being rendered in the component tree.
 * This avoids duplicating CSS in both HTML and RSC payload.
 */
export function renderCssResource(
  entryCssFiles: CssResource[],
  ctx: AppRenderContext,
  preloadCallbacks?: PreloadCallbacks,
  collectedInlineCss?: CollectedInlineCss
) {
  const {
    componentMod: { createElement },
  } = ctx
  return entryCssFiles
    .map((entryCssFile, index) => {
      // `Precedence` is an opt-in signal for React to handle resource
      // loading and deduplication, etc. It's also used as the key to sort
      // resources so they will be injected in the correct order.
      // During HMR, it's critical to use different `precedence` values
      // for different stylesheets, so their order will be kept.
      // https://github.com/facebook/react/pull/25060
      const precedence =
        process.env.NODE_ENV === 'development'
          ? 'next_' + entryCssFile.path
          : 'next'

      // In dev, Safari and Firefox will cache the resource during HMR:
      // - https://github.com/vercel/next.js/issues/5860
      // - https://bugs.webkit.org/show_bug.cgi?id=187726
      // Because of this, we add a `?v=` query to bypass the cache during
      // development. We need to also make sure that the number is always
      // increasing.
      const fullHref = `${ctx.assetPrefix}/_next/${encodeURIPath(
        entryCssFile.path
      )}${getAssetQueryString(ctx, true)}`

      if (entryCssFile.inlined && !ctx.parsedRequestHeaders.isRSCRequest) {
        // When collectedInlineCss is provided, collect CSS for ServerInsertedHTML
        // injection instead of rendering in the component tree. This prevents
        // CSS from being duplicated in both HTML and RSC payload.
        if (collectedInlineCss) {
          collectedInlineCss.styles.push({
            href: fullHref,
            content: entryCssFile.content!,
            precedence: precedence,
            nonce: ctx.nonce,
          })
          return null
        }
        return createElement(
          'style',
          {
            key: index,
            nonce: ctx.nonce,
            precedence: precedence,
            href: fullHref,
          },
          entryCssFile.content
        )
      }

      preloadCallbacks?.push(() => {
        ctx.componentMod.preloadStyle(
          fullHref,
          ctx.renderOpts.crossOrigin,
          ctx.nonce
        )
      })

      return createElement('link', {
        key: index,
        rel: 'stylesheet',
        href: fullHref,
        precedence: precedence,
        crossOrigin: ctx.renderOpts.crossOrigin,
        nonce: ctx.nonce,
      })
    })
    .filter(Boolean)
}

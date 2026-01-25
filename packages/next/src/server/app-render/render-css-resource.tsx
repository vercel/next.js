import type { CssResource } from '../../build/webpack/plugins/flight-manifest-plugin'
import { encodeURIPath } from '../../shared/lib/encode-uri-path'
import type { AppRenderContext } from './app-render'
import { getAssetQueryString } from './get-asset-query-string'
import type { PreloadCallbacks } from './types'

/**
 * Abstracts the rendering of CSS files based on whether they are inlined or not.
 * For inlined CSS, renders a <style> tag with the CSS content directly embedded.
 * For external CSS files, renders a <link> tag pointing to the CSS file.
 *
 * The inlineCssMode determines the inlining behavior:
 * - `false` or `undefined`: No CSS inlining (render as <link> tags)
 * - `true`: Inline ALL CSS. Note: This causes CSS duplication because styles
 *   appear both in initial HTML <style> tags AND in the RSC payload's serialized
 *   <script> content. The client then re-injects them, causing double styles.
 * - `'shared'`: Only inline root layout CSS (safer for client navigations).
 *   In this mode, collectedInlineCss is used to inject CSS via ServerInsertedHTML
 *   to avoid duplicating CSS in both HTML and RSC payload.
 */
export function renderCssResource(
  entryCssFiles: CssResource[],
  ctx: AppRenderContext,
  preloadCallbacks?: PreloadCallbacks
) {
  const {
    componentMod: { createElement },
    collectedInlineCss,
  } = ctx

  const inlineCssMode = collectedInlineCss.inlineCssMode
  const rootLayoutCSSPaths = collectedInlineCss.rootLayoutCSSPaths

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

      // Check if this CSS is from the root layout (shared across all pages)
      const isRootLayoutCSS = rootLayoutCSSPaths.has(entryCssFile.path)
      const isRSCRequest = ctx.parsedRequestHeaders.isRSCRequest

      // Handle inlineCss: 'shared' mode
      if (inlineCssMode === 'shared' && isRootLayoutCSS) {
        // RSC requests: skip root layout CSS (client already has it from initial HTML)
        if (isRSCRequest) {
          return null
        }
        // Initial HTML: collect for ServerInsertedHTML injection
        if (entryCssFile.inlined) {
          collectedInlineCss.styles.push({
            href: fullHref,
            content: entryCssFile.content!,
            precedence: precedence,
            nonce: ctx.nonce,
          })
          return null
        }
      }

      // Handle inlineCss: true mode - inline ALL CSS for non-RSC requests
      if (inlineCssMode === true && entryCssFile.inlined && !isRSCRequest) {
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

      // Default: render as <link> tag

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

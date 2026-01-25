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
 *
 * The inlineCssMode determines the inlining behavior:
 * - `false` or `undefined`: No CSS inlining (render as <link> tags)
 * - `true`: Inline ALL CSS
 * - `'shared'`: Only inline root layout CSS (safer for client navigations)
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

  const inlineCssMode = collectedInlineCss?.inlineCssMode
  const rootLayoutCSSPaths = collectedInlineCss?.rootLayoutCSSPaths

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
      const isRootLayoutCSS = rootLayoutCSSPaths?.has(entryCssFile.path)

      // In 'shared' mode, handle root layout CSS specially:
      // - For RSC requests: skip root layout CSS entirely (client already has it from initial HTML)
      // - For non-RSC requests: inline only root layout CSS
      if (inlineCssMode === 'shared') {
        if (ctx.parsedRequestHeaders.isRSCRequest) {
          // For RSC/navigation requests, skip root layout CSS
          // (client already has it from the initial HTML load)
          if (isRootLayoutCSS) {
            return null
          }
          // Page-specific CSS should still be included in RSC payload
          // Fall through to render as <link> tag
        } else if (isRootLayoutCSS && entryCssFile.inlined) {
          // For initial HTML requests, inline only root layout CSS
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
        // For page-specific CSS in 'shared' mode, fall through to render as <link> tag
      } else if (
        entryCssFile.inlined &&
        !ctx.parsedRequestHeaders.isRSCRequest
      ) {
        // inlineCss: true mode - inline ALL CSS for non-RSC requests
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

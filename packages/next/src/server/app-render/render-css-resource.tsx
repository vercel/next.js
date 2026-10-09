import type { CssResource } from '../../build/webpack/plugins/flight-manifest-plugin'
import { encodeURIPath } from '../../shared/lib/encode-uri-path'
import type { InlinedCssLookup } from '../../shared/lib/inlined-css-context.shared-runtime'
import type { AppRenderContext } from './app-render'
import { getAssetQueryString } from './get-asset-query-string'
import { getClientReferenceManifest } from './manifests-singleton'
import type { PreloadCallbacks } from './types'

/** What a stylesheet's href is derived from. */
export type CssHrefContext = Pick<
  AppRenderContext,
  'assetPrefix' | 'requestTimestamp' | 'sharedContext'
>

/** The URL a stylesheet is referenced by, in <link> tags and as a React resource key. */
export function getCssResourceHref(ctx: CssHrefContext, path: string) {
  // In dev, Safari and Firefox will cache the resource during HMR:
  // - https://github.com/vercel/next.js/issues/5860
  // - https://bugs.webkit.org/show_bug.cgi?id=187726
  // Because of this, we add a `?v=` query to bypass the cache during
  // development. We need to also make sure that the number is always
  // increasing.
  return `${ctx.assetPrefix}/_next/${encodeURIPath(path)}${getAssetQueryString(ctx, true)}`
}

/**
 * For renders whose output is never served, such as validation renders: every
 * inlined stylesheet falls back to a <link>.
 */
export const NO_INLINED_CSS: InlinedCssLookup = () => undefined

/**
 * The CSS text of every stylesheet the build inlined, by the href the RSC
 * payload refers to it with, for the SSR layer to render into the document.
 * The manifest is read now, while the request's work store is in scope; the
 * map is built on first use, since most renders never ask.
 */
export function createInlinedCssLookup(ctx: CssHrefContext): InlinedCssLookup {
  const { entryCSSFiles } = getClientReferenceManifest()
  let contentByHref: Map<string, string> | null = null
  return (href) => {
    if (contentByHref === null) {
      contentByHref = new Map()
      for (const resources of Object.values(entryCSSFiles)) {
        for (const resource of resources) {
          if (resource.inlined) {
            contentByHref.set(
              getCssResourceHref(ctx, resource.path),
              resource.content
            )
          }
        }
      }
    }
    return contentByHref.get(href)
  }
}

/**
 * Abstracts the rendering of CSS files based on whether they are inlined or not.
 * For inlined CSS, renders a reference the server resolves to a <style> tag
 * with the CSS content, so the content is in the document once and never in
 * the RSC payload. For external CSS files, renders a <link> tag pointing to
 * the CSS file.
 */
export function renderCssResource(
  entryCssFiles: Iterable<CssResource>,
  ctx: AppRenderContext,
  preloadCallbacks?: PreloadCallbacks
) {
  const {
    componentMod: { createElement },
  } = ctx
  const elements: React.ReactNode[] = []
  let index = 0
  for (const entryCssFile of entryCssFiles) {
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

    const fullHref = getCssResourceHref(ctx, entryCssFile.path)

    if (entryCssFile.inlined && !ctx.parsedRequestHeaders.isRSCRequest) {
      elements.push(
        createElement(ctx.componentMod.InlinedStylesheet, {
          key: index,
          href: fullHref,
          precedence: precedence,
          nonce: ctx.nonce,
          crossOrigin: ctx.renderOpts.crossOrigin,
        })
      )
    } else {
      preloadCallbacks?.push(() => {
        ctx.componentMod.preloadStyle(
          fullHref,
          ctx.renderOpts.crossOrigin,
          ctx.nonce
        )
      })

      elements.push(
        createElement('link', {
          key: index,
          rel: 'stylesheet',
          href: fullHref,
          precedence: precedence,
          crossOrigin: ctx.renderOpts.crossOrigin,
          nonce: ctx.nonce,
        })
      )
    }
    index++
  }
  return elements
}

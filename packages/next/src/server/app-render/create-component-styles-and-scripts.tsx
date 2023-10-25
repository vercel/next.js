import React from 'react'
import { interopDefault } from './interop-default'
import { getLinkAndScriptTags } from './get-css-inlined-link-tags'
import type { AppRenderContext } from './app-render'
import { getAssetQueryString } from './get-asset-query-string'

export async function createComponentStylesAndScripts({
  filePath,
  getComponent,
  injectedCSS,
  injectedJS,
  ctx,
}: {
  filePath: string
  getComponent: () => any
  injectedCSS: Set<string>
  injectedJS: Set<string>
  ctx: AppRenderContext
}): Promise<[any, React.ReactNode, React.ReactNode]> {
  const { styles: cssHrefs, scripts: jsHrefs } = getLinkAndScriptTags(
    ctx.clientReferenceManifest,
    filePath,
    injectedCSS,
    injectedJS
  )

  const styles = cssHrefs
    ? cssHrefs.map((href, index) => {
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

  const scripts = jsHrefs
    ? jsHrefs.map((href) => (
        <script src={`${ctx.assetPrefix}/_next/${href}`} async={true} />
      ))
    : null

  const Comp = interopDefault(await getComponent())

  return [Comp, styles, scripts]
}

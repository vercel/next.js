import React from 'react'
import { interopDefault } from './interop-default'
import { getLinkAndScriptTags } from './get-css-inlined-link-tags'
import type { AppRenderContext } from './app-render'
import { getAssetQueryString } from './get-asset-query-string'
import { encodeURIPath } from '../../shared/lib/encode-uri-path'
import { renderCssResource } from './render-css-resource'

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
}): Promise<[React.ComponentType<any>, React.ReactNode, React.ReactNode]> {
  const { styles: entryCssFiles, scripts: jsHrefs } = getLinkAndScriptTags(
    ctx.clientReferenceManifest,
    filePath,
    injectedCSS,
    injectedJS
  )

  const styles = renderCssResource(entryCssFiles, ctx)

  const scripts = jsHrefs
    ? jsHrefs.map((href, index) => (
        <script
          src={`${ctx.assetPrefix}/_next/${encodeURIPath(
            href
          )}${getAssetQueryString(ctx, true)}`}
          async={true}
          key={`script-${index}`}
        />
      ))
    : null

  const Comp = interopDefault(await getComponent())

  return [Comp, styles, scripts]
}

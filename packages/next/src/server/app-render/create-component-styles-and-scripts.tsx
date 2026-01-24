import { interopDefault } from './interop-default'
import { getLinkAndScriptTags } from './get-css-inlined-link-tags'
import type { AppRenderContext } from './app-render'
import { getAssetQueryString } from './get-asset-query-string'
import { encodeURIPath } from '../../shared/lib/encode-uri-path'
import { renderCssResource } from './render-css-resource'
import type { CollectedInlineCss } from './types'

export async function createComponentStylesAndScripts({
  filePath,
  getComponent,
  injectedCSS,
  injectedJS,
  ctx,
  collectedInlineCss,
}: {
  filePath: string
  getComponent: () => any
  injectedCSS: Set<string>
  injectedJS: Set<string>
  ctx: AppRenderContext
  collectedInlineCss?: CollectedInlineCss
}): Promise<[React.ComponentType<any>, React.ReactNode, React.ReactNode]> {
  const {
    componentMod: { createElement },
  } = ctx
  const { styles: entryCssFiles, scripts: jsHrefs } = getLinkAndScriptTags(
    filePath,
    injectedCSS,
    injectedJS
  )

  const styles = renderCssResource(
    entryCssFiles,
    ctx,
    undefined,
    collectedInlineCss
  )

  const scripts = jsHrefs
    ? jsHrefs.map((href, index) =>
        createElement('script', {
          src: `${ctx.assetPrefix}/_next/${encodeURIPath(href)}${getAssetQueryString(ctx, true)}`,
          async: true,
          key: `script-${index}`,
        })
      )
    : null

  const Comp = interopDefault(await getComponent())

  return [Comp, styles, scripts]
}

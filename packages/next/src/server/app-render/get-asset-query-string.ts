import type { AppRenderContext } from './app-render'

export function getAssetQueryString(
  ctx: AppRenderContext,
  addTimestamp: boolean
) {
  const isDev = process.env.NODE_ENV === 'development'
  let qs = ''

  if (isDev && addTimestamp) {
    qs += `?v=${ctx.requestTimestamp}`
  }

  if (ctx.renderOpts.deploymentId) {
    qs += `${isDev ? '&' : '?'}dpl=${ctx.renderOpts.deploymentId}`
  }
  return qs
}

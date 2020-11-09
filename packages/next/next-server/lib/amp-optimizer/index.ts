export default async function optimize(
  html: string,
  config: any
): Promise<string> {
  let AmpOptimizer
  try {
    // @ts-ignore no type defs available currently
    AmpOptimizer = require('@ampproject/toolbox-optimizer')
  } catch (_) {
    return html
  }
  const ReorderHeadTransformer = require('./reorder-head-transformer.js')

  const optimizer = AmpOptimizer.create({
    ...config,
    // disable the reorder head transformer as this is breaking
    // valid AMP as of @ampproject/toolbox-optimizer@2.7.0-alpha.4
    // previously was working on @ampproject/toolbox-optimizer@2.7.0-alpha.1
    transformations: AmpOptimizer.TRANSFORMATIONS_AMP_FIRST.filter(
      (transform: any) => transform !== 'ReorderHeadTransformer'
    ).concat(ReorderHeadTransformer),
  })
  return optimizer.transformHtml(html, config)
}

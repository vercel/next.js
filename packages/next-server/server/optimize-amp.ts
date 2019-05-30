export default async function optimize(html: string): Promise<string> {
  let AmpOptimizer
  try {
    AmpOptimizer = require('amp-toolbox-optimizer')
  } catch (_) {
    return html
  }
  const optimizer = AmpOptimizer.create()
  return optimizer.transformHtml(html)
}

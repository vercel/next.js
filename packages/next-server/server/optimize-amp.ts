import { ParsedUrlQuery } from "querystring"

interface IOptimizerConfig {
  transforms?: string[],
  validAmp?: boolean,
  verbose?: boolean,
}

interface IOptimizer {
  transformHtml: (html: string, params?: object) => Promise<string>
  setConfig: (config: IOptimizerConfig) => void
}

interface IOptimizeOptions {
  amphtml?: boolean
  noDirtyAmp?: boolean
  query?: ParsedUrlQuery
}

export default async function optimize(html: string, { amphtml, noDirtyAmp, query }: IOptimizeOptions): Promise<string> {
  let ampOptimizer: IOptimizer
  try {
    ampOptimizer = require('amp-toolbox-optimizer')
  } catch (_) {
    return html
  }
  const validAmp = Boolean(noDirtyAmp || (amphtml && query && query.amp))
  //  Examples below
  //
  //  pages/foo.js
  //  pages/foo.amp.js
  //  pages/bar.amp.js
  //
  //  /foo => traditional
  //  /foo?amp=1 => clean AMP
  //  /bar => dirty amp
  //  /bar?amp=1 => clean AMP

  ampOptimizer.setConfig({ validAmp })
  html = await ampOptimizer.transformHtml(html)
  return html
}

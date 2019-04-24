import { ParsedUrlQuery } from "querystring"

interface IOptimizerConfig {
  transformers?: string[],
  validAmp?: boolean,
  verbose?: boolean,
  runtimeVersion?: any,
}

interface IOptimizer {
  transformHtml: (html: string, params?: object) => Promise<string>
  setConfig: (config: IOptimizerConfig) => void
}

interface IOptimizeOptions {
  amphtml?: boolean
  query?: ParsedUrlQuery
}

export default async function optimize(html: string, { amphtml, query }: IOptimizeOptions): Promise<string> {
  let ampOptimizer: IOptimizer
  let runtimeVersion: any
  try {
    runtimeVersion = require('amp-toolbox-runtime-version')
    ampOptimizer = require('amp-toolbox-optimizer')
  } catch (_) {
    return html
  }
  let transformers
  const validAmp = Boolean(amphtml && query && query.amp)

  if (validAmp) {
    transformers = [
      // Optimizes script import order
      // needs to run after ServerSideRendering
      'ReorderHeadTransformer',
      // needs to run after ReorderHeadTransformer
      'RewriteAmpUrls',
      'GoogleFontsPreconnect',
      'PruneDuplicateResourceHints',
      'SeparateKeyframes',
    ]
  }
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

  ampOptimizer.setConfig({ validAmp, runtimeVersion, transformers })
  html = await ampOptimizer.transformHtml(html)
  return html
}

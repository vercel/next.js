import type { RenderOpts } from './render'

import { nonNullable } from '../lib/non-nullable'

type PostProcessorFunction =
  | ((html: string) => Promise<string>)
  | ((html: string) => string)

async function postProcessHTML(
  content: string,
  renderOpts: Pick<RenderOpts, 'optimizeCss' | 'distDir' | 'assetPrefix'>
) {
  const postProcessors: Array<PostProcessorFunction> = [
    process.env.NEXT_RUNTIME !== 'edge' && renderOpts.optimizeCss
      ? async (html: string) => {
          // eslint-disable-next-line import/no-extraneous-dependencies
          const Critters = require('critters') as typeof import('critters')
          // @ts-expect-error -- interopRequireDefault
          const cssOptimizer = new Critters({
            ssrMode: true,
            reduceInlineStyles: false,
            path: renderOpts.distDir,
            publicPath: `${renderOpts.assetPrefix}/_next/`,
            preload: 'media',
            fonts: false,
            logLevel:
              process.env.CRITTERS_LOG_LEVEL ||
              (process.env.NODE_ENV === 'production' ? 'warn' : 'info'),
            ...renderOpts.optimizeCss,
          })
          return await cssOptimizer.process(html)
        }
      : null,
  ].filter(nonNullable)

  for (const postProcessor of postProcessors) {
    if (postProcessor) {
      content = await postProcessor(content)
    }
  }
  return content
}

export { postProcessHTML }

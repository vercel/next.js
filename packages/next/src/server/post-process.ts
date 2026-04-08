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
          const Beasties = require('beasties') as typeof import('beasties')
          // @ts-expect-error -- interopRequireDefault
          const cssOptimizer = new Beasties({
            /* beasties options v0.4.2 {@link https://github.com/danielroe/beasties#usage} */
            reduceInlineStyles: false,
            path: renderOpts.distDir,
            publicPath: `${renderOpts.assetPrefix}/_next/`,
            inlineFonts: false /* these are handled by next/font */,
            preloadFonts: false,
            preload: 'media',
            inlineThreshold: 0 /* default value  */,
            logLevel:
              process.env.BEASTIES_LOG_LEVEL ||
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

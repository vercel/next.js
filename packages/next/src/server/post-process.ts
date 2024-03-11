import type { RenderOpts } from './render'
import type { HTMLElement } from 'next/dist/compiled/node-html-parser'

import { OPTIMIZED_FONT_PROVIDERS } from '../shared/lib/constants'
import { nonNullable } from '../lib/non-nullable'

type postProcessOptions = {
  optimizeFonts: any
}

type renderOptions = {
  getFontDefinition?: (url: string) => string
}
interface PostProcessMiddleware {
  inspect: (originalDom: HTMLElement, options: renderOptions) => any
  mutate: (markup: string, data: any, options: renderOptions) => Promise<string>
}

type middlewareSignature = {
  name: string
  middleware: PostProcessMiddleware
  condition: ((options: postProcessOptions) => boolean) | null
}

type PostProcessorFunction =
  | ((html: string) => Promise<string>)
  | ((html: string) => string)

const middlewareRegistry: Array<middlewareSignature> = []

function registerPostProcessor(
  name: string,
  middleware: PostProcessMiddleware,
  condition?: (options: postProcessOptions) => boolean
) {
  middlewareRegistry.push({ name, middleware, condition: condition || null })
}

async function processHTML(
  html: string,
  data: renderOptions,
  options: postProcessOptions
): Promise<string> {
  // Don't parse unless there's at least one processor middleware
  if (!middlewareRegistry[0]) {
    return html
  }

  const { parse } =
    require('next/dist/compiled/node-html-parser') as typeof import('next/dist/compiled/node-html-parser')
  const root: HTMLElement = parse(html)
  let document = html

  // Calls the middleware, with some instrumentation and logging
  async function callMiddleWare(middleware: PostProcessMiddleware) {
    // let timer = Date.now()
    const inspectData = middleware.inspect(root, data)
    document = await middleware.mutate(document, inspectData, data)
    // timer = Date.now() - timer
    // if (timer > MIDDLEWARE_TIME_BUDGET) {
    // TODO: Identify a correct upper limit for the postprocess step
    // and add a warning to disable the optimization
    // }
    return
  }

  for (let i = 0; i < middlewareRegistry.length; i++) {
    let middleware = middlewareRegistry[i]
    if (!middleware.condition || middleware.condition(options)) {
      await callMiddleWare(middlewareRegistry[i].middleware)
    }
  }

  return document
}

class FontOptimizerMiddleware implements PostProcessMiddleware {
  inspect(originalDom: HTMLElement, options: renderOptions) {
    if (!options.getFontDefinition) {
      return
    }
    const fontDefinitions: (string | undefined)[][] = []
    // collecting all the requested font definitions
    originalDom
      .querySelectorAll('link')
      .filter(
        (tag: HTMLElement) =>
          tag.getAttribute('rel') === 'stylesheet' &&
          tag.hasAttribute('data-href') &&
          OPTIMIZED_FONT_PROVIDERS.some(({ url }) => {
            const dataHref = tag.getAttribute('data-href')
            return dataHref ? dataHref.startsWith(url) : false
          })
      )
      .forEach((element: HTMLElement) => {
        const url = element.getAttribute('data-href')
        const nonce = element.getAttribute('nonce')

        if (url) {
          fontDefinitions.push([url, nonce])
        }
      })

    return fontDefinitions
  }
  mutate = async (
    markup: string,
    fontDefinitions: string[][],
    options: renderOptions
  ) => {
    let result = markup
    let preconnectUrls = new Set<string>()

    if (!options.getFontDefinition) {
      return markup
    }

    fontDefinitions.forEach((fontDef) => {
      const [url, nonce] = fontDef
      const fallBackLinkTag = `<link rel="stylesheet" href="${url}"/>`
      if (
        result.indexOf(`<style data-href="${url}">`) > -1 ||
        result.indexOf(fallBackLinkTag) > -1
      ) {
        // The font is already optimized and probably the response is cached
        return
      }
      const fontContent = options.getFontDefinition
        ? options.getFontDefinition(url as string)
        : null
      if (!fontContent) {
        /**
         * In case of unreachable font definitions, fallback to default link tag.
         */
        result = result.replace('</head>', `${fallBackLinkTag}</head>`)
      } else {
        const nonceStr = nonce ? ` nonce="${nonce}"` : ''
        let dataAttr = ''

        if (fontContent.includes('ascent-override')) {
          dataAttr = ' data-size-adjust="true"'
        }

        result = result.replace(
          '</head>',
          `<style data-href="${url}"${nonceStr}${dataAttr}>${fontContent}</style></head>`
        )

        // Remove inert font tag
        const escapedUrl = url
          .replace(/&/g, '&amp;')
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const fontRegex = new RegExp(
          `<link[^>]*data-href="${escapedUrl}"[^>]*/>`
        )
        result = result.replace(fontRegex, '')

        const provider = OPTIMIZED_FONT_PROVIDERS.find((p) =>
          url.startsWith(p.url)
        )

        if (provider) {
          preconnectUrls.add(provider.preconnect)
        }
      }
    })

    let preconnectTag = ''
    preconnectUrls.forEach((url) => {
      preconnectTag += `<link rel="preconnect" href="${url}" crossorigin />`
    })

    result = result.replace(
      '<meta name="next-font-preconnect"/>',
      preconnectTag
    )

    return result
  }
}

async function postProcessHTML(
  pathname: string,
  content: string,
  renderOpts: Pick<
    RenderOpts,
    | 'ampOptimizerConfig'
    | 'ampValidator'
    | 'ampSkipValidation'
    | 'optimizeFonts'
    | 'fontManifest'
    | 'optimizeCss'
    | 'distDir'
    | 'assetPrefix'
  >,
  { inAmpMode, hybridAmp }: { inAmpMode: boolean; hybridAmp: boolean }
) {
  const postProcessors: Array<PostProcessorFunction> = [
    process.env.NEXT_RUNTIME !== 'edge' && inAmpMode
      ? async (html: string) => {
          const optimizeAmp = require('./optimize-amp')
            .default as typeof import('./optimize-amp').default
          html = await optimizeAmp!(html, renderOpts.ampOptimizerConfig)
          if (!renderOpts.ampSkipValidation && renderOpts.ampValidator) {
            await renderOpts.ampValidator(html, pathname)
          }
          return html
        }
      : null,
    process.env.NEXT_RUNTIME !== 'edge' && renderOpts.optimizeFonts
      ? async (html: string) => {
          const getFontDefinition = (url: string) => {
            if (!renderOpts.fontManifest) {
              return ''
            }
            return (
              renderOpts.fontManifest.find((font) => {
                if (font && font.url === url) {
                  return true
                }
                return false
              })?.content || ''
            )
          }
          return await processHTML(
            html,
            { getFontDefinition },
            {
              optimizeFonts: renderOpts.optimizeFonts,
            }
          )
        }
      : null,
    process.env.NEXT_RUNTIME !== 'edge' && renderOpts.optimizeCss
      ? async (html: string) => {
          // eslint-disable-next-line import/no-extraneous-dependencies
          const Critters = require('critters')
          const cssOptimizer = new Critters({
            ssrMode: true,
            reduceInlineStyles: false,
            path: renderOpts.distDir,
            publicPath: `${renderOpts.assetPrefix}/_next/`,
            preload: 'media',
            fonts: false,
            ...renderOpts.optimizeCss,
          })
          return await cssOptimizer.process(html)
        }
      : null,
    inAmpMode || hybridAmp
      ? (html: string) => {
          return html.replace(/&amp;amp=1/g, '&amp=1')
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

// Initialization
registerPostProcessor(
  'Inline-Fonts',
  new FontOptimizerMiddleware(),
  // Using process.env because passing Experimental flag through loader is not possible.
  // @ts-ignore
  (options) => options.optimizeFonts || process.env.__NEXT_OPTIMIZE_FONTS
)

export { postProcessHTML }

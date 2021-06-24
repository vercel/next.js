import escapeRegexp from 'next/dist/compiled/escape-string-regexp'
import { parse, HTMLElement } from 'node-html-parser'
import { OPTIMIZED_FONT_PROVIDERS } from './constants'

// const MIDDLEWARE_TIME_BUDGET = parseInt(process.env.__POST_PROCESS_MIDDLEWARE_TIME_BUDGET || '', 10) || 10
const MAXIMUM_IMAGE_PRELOADS = 2
const IMAGE_PRELOAD_SIZE_THRESHOLD = 2500

type postProcessOptions = {
  optimizeFonts: boolean
  optimizeImages: boolean
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
        result = result.replace(
          '</head>',
          `<style data-href="${url}"${nonceStr}>${fontContent}</style></head>`
        )

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

class ImageOptimizerMiddleware implements PostProcessMiddleware {
  inspect(originalDom: HTMLElement) {
    const imgPreloads = []
    const imgElements = originalDom.querySelectorAll('img')
    let eligibleImages: Array<HTMLElement> = []
    for (let i = 0; i < imgElements.length; i++) {
      if (isImgEligible(imgElements[i])) {
        eligibleImages.push(imgElements[i])
      }
      if (eligibleImages.length >= MAXIMUM_IMAGE_PRELOADS) {
        break
      }
    }

    for (const imgEl of eligibleImages) {
      const src = imgEl.getAttribute('src')
      if (src) {
        imgPreloads.push(src)
      }
    }

    return imgPreloads
  }
  mutate = async (markup: string, imgPreloads: string[]) => {
    let result = markup
    let imagePreloadTags = imgPreloads
      .filter((imgHref) => !preloadTagAlreadyExists(markup, imgHref))
      .reduce(
        (acc, imgHref) =>
          acc + `<link rel="preload" href="${imgHref}" as="image"/>`,
        ''
      )
    return result.replace('<meta name="next-image-preload"/>', imagePreloadTags)
  }
}

function isImgEligible(imgElement: HTMLElement): boolean {
  let imgSrc = imgElement.getAttribute('src')
  return (
    !!imgSrc &&
    sourceIsSupportedType(imgSrc) &&
    imageIsNotTooSmall(imgElement) &&
    imageIsNotHidden(imgElement)
  )
}

function preloadTagAlreadyExists(html: string, href: string) {
  const escapedHref = escapeRegexp(href)
  const regex = new RegExp(`<link[^>]*href[^>]*${escapedHref}`)
  return html.match(regex)
}

function imageIsNotTooSmall(imgElement: HTMLElement): boolean {
  // Skip images without both height and width--we don't know enough to say if
  // they are too small
  if (
    !(imgElement.hasAttribute('height') && imgElement.hasAttribute('width'))
  ) {
    return true
  }
  try {
    const heightAttr = imgElement.getAttribute('height')
    const widthAttr = imgElement.getAttribute('width')
    if (!heightAttr || !widthAttr) {
      return true
    }

    if (
      parseInt(heightAttr) * parseInt(widthAttr) <=
      IMAGE_PRELOAD_SIZE_THRESHOLD
    ) {
      return false
    }
  } catch (err) {
    return true
  }
  return true
}

// Traverse up the dom from each image to see if it or any of it's
// ancestors have the hidden attribute.
function imageIsNotHidden(imgElement: HTMLElement): boolean {
  let activeElement = imgElement
  while (activeElement.parentNode) {
    if (activeElement.hasAttribute('hidden')) {
      return false
    }
    activeElement = activeElement.parentNode as HTMLElement
  }
  return true
}

// Currently only filters out svg images--could be made more specific in the future.
function sourceIsSupportedType(imgSrc: string): boolean {
  return !imgSrc.includes('.svg')
}

// Initialization
registerPostProcessor(
  'Inline-Fonts',
  new FontOptimizerMiddleware(),
  // Using process.env because passing Experimental flag through loader is not possible.
  // @ts-ignore
  (options) => options.optimizeFonts || process.env.__NEXT_OPTIMIZE_FONTS
)

registerPostProcessor(
  'Preload Images',
  new ImageOptimizerMiddleware(),
  // @ts-ignore
  (options) => options.optimizeImages || process.env.__NEXT_OPTIMIZE_IMAGES
)

export default processHTML

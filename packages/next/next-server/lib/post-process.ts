import { parse, HTMLElement } from 'node-html-parser'
import { OPTIMIZED_FONT_PROVIDERS } from './constants'

const MIDDLEWARE_TIME_BUDGET = 10
const MAXIMUM_IMAGE_PRELOADS = 2
const IMAGE_PRELOAD_SIZE_THRESHOLD = 2500

type postProcessOptions = {
  optimizeFonts: boolean
  optimizeImages: boolean
}

type renderOptions = {
  getFontDefinition?: (url: string) => string
}

type postProcessData = {
  preloads: {
    images: Array<string>
  }
}

interface PostProcessMiddleware {
  inspect: (
    originalDom: HTMLElement,
    data: postProcessData,
    options: renderOptions
  ) => void
  mutate: (
    markup: string,
    data: postProcessData,
    options: renderOptions
  ) => Promise<string>
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
  const postProcessData: postProcessData = {
    preloads: {
      images: [],
    },
  }
  const root: HTMLElement = parse(html)
  let document = html
  // Calls the middleware, with some instrumentation and logging
  async function callMiddleWare(
    middleware: PostProcessMiddleware,
    name: string
  ) {
    let timer = Date.now()
    middleware.inspect(root, postProcessData, data)
    const inspectTime = Date.now() - timer
    document = await middleware.mutate(document, postProcessData, data)
    timer = Date.now() - timer
    if (timer > MIDDLEWARE_TIME_BUDGET) {
      console.warn(
        `The postprocess middleware "${name}" took ${timer}ms(${inspectTime}, ${
          timer - inspectTime
        }) to complete. This is longer than the ${MIDDLEWARE_TIME_BUDGET} limit.`
      )
    }
    return
  }

  for (let i = 0; i < middlewareRegistry.length; i++) {
    let middleware = middlewareRegistry[i]
    if (!middleware.condition || middleware.condition(options)) {
      await callMiddleWare(
        middlewareRegistry[i].middleware,
        middlewareRegistry[i].name
      )
    }
  }

  return document
}

class FontOptimizerMiddleware implements PostProcessMiddleware {
  fontDefinitions: Array<string> = []
  inspect(
    originalDom: HTMLElement,
    _data: postProcessData,
    options: renderOptions
  ) {
    if (!options.getFontDefinition) {
      return
    }
    // collecting all the requested font definitions
    originalDom
      .querySelectorAll('link')
      .filter(
        (tag: HTMLElement) =>
          tag.getAttribute('rel') === 'stylesheet' &&
          tag.hasAttribute('data-href') &&
          OPTIMIZED_FONT_PROVIDERS.some((url) =>
            tag.getAttribute('data-href').startsWith(url)
          )
      )
      .forEach((element: HTMLElement) => {
        const url = element.getAttribute('data-href')
        this.fontDefinitions.push(url)
      })
  }
  mutate = async (
    markup: string,
    _data: postProcessData,
    options: renderOptions
  ) => {
    let result = markup
    if (!options.getFontDefinition) {
      return markup
    }
    for (const key in this.fontDefinitions) {
      const url = this.fontDefinitions[key]
      if (result.indexOf(`<style data-href="${url}">`) > -1) {
        // The font is already optimized and probably the response is cached
        continue
      }
      const fontContent = options.getFontDefinition(url)
      result = result.replace(
        '</head>',
        `<style data-href="${url}">${fontContent.replace(
          /(\n|\s)/g,
          ''
        )}</style></head>`
      )
    }
    return result
  }
}

class ImageOptimizerMiddleware implements PostProcessMiddleware {
  inspect(originalDom: HTMLElement, _data: postProcessData) {
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
    _data.preloads.images = eligibleImages.map((el) => el.getAttribute('src'))
  }
  mutate = async (markup: string, _data: postProcessData) => {
    let result = markup
    let imagePreloadTags = _data.preloads.images
      .filter((imgHref) => !preloadTagAlreadyExists(markup, imgHref))
      .reduce(
        (acc, imgHref) => acc + `<link rel="preload" href="${imgHref}"/>`,
        ''
      )
    return result.replace(
      /<link rel="preload"/,
      `${imagePreloadTags}<link rel="preload"`
    )
  }
}

function isImgEligible(imgElement: HTMLElement): boolean {
  return (
    imgElement.hasAttribute('src') &&
    imageIsNotTooSmall(imgElement) &&
    imageIsNotHidden(imgElement)
  )
}

function preloadTagAlreadyExists(html: string, href: string) {
  const regex = new RegExp(`<link[^>]*href[^>]*${href}`)
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
    if (
      parseInt(imgElement.getAttribute('height')) *
        parseInt(imgElement.getAttribute('width')) <=
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

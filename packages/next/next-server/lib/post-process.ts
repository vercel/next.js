import { parse, HTMLElement } from 'node-html-parser'

const MIDDLEWARE_TIME_BUDGET = 10

type postProcessOptions = {
  preloadImages: boolean
  optimizeFonts: boolean
}

type renderOpts = {
  getFontDefinition?: (url: string) => string
}

type postProcessData = {
  preloads: {
    images: Array<string>
  }
}

type postProcessMiddleware = (
  htmlRoot: HTMLElement,
  rawString: string,
  data: postProcessData,
  options: renderOpts
) => Promise<string>

type middlewareSignature = {
  name: string
  middleware: postProcessMiddleware
  condition: ((options: postProcessOptions) => boolean) | null
}

const middlewareRegistry: Array<middlewareSignature> = []

function registerPostProcessor(
  name: string,
  middleware: postProcessMiddleware,
  condition?: (options: postProcessOptions) => boolean
) {
  middlewareRegistry.push({ name, middleware, condition: condition || null })
}

async function processHTML(
  html: string,
  data: renderOpts,
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
    middleware: postProcessMiddleware,
    name: string
  ) {
    let timer = Date.now()
    document = await middleware(root, document, postProcessData, data)
    timer = Date.now() - timer
    if (timer > MIDDLEWARE_TIME_BUDGET) {
      console.warn(
        `The postprocess middleware "${name}" took ${timer}ms to complete. This is longer than the ${MIDDLEWARE_TIME_BUDGET} limit.`
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

// Middleware
const findImages: postProcessMiddleware = async (htmlRoot, document, data) => {
  // TODO: Image preload finding logic here--adds to data
  console.log(htmlRoot, data)
  return document
}

// Middleware
const inlineFonts: postProcessMiddleware = async (
  htmlRoot,
  document,
  _data,
  options
) => {
  if (!options.getFontDefinition) {
    return htmlRoot
  }

  const getFontDefinition = options.getFontDefinition
  const links = htmlRoot
    .querySelectorAll('link')
    .filter(
      (tag) =>
        tag.getAttribute('rel') === 'stylesheet' &&
        tag.hasAttribute('href') &&
        tag
          .getAttribute('href')
          .startsWith('https://fonts.googleapis.com/css2?')
    )
  links.forEach((link) => {
    const url = link.getAttribute('href')
    console.log(document, '...', `<link href="${url}"`)
    document = document.replace(
      `<link href="${url}"`,
      `<link data-href="${url}"`
    )
    document = document.replace(
      '</head>',
      `<style data-font-url='${url}'>${getFontDefinition(url)}</style></head>`
    )
    /**
     * Removing the actual element is not supported in node-html-parser
     * so we just remove the href effectively making it inert.
     */
    //link.removeAttribute('href')
  })
  return document
}

const renderPreloads: postProcessMiddleware = async (
  htmlRoot,
  document,
  data
) => {
  // TODO: Render preload tags from data
  console.log(htmlRoot, data)
  return document
}

// Initialization
registerPostProcessor(
  'Find-Images',
  findImages,
  (options) => options.preloadImages
)
// Initialization
registerPostProcessor(
  'Inline-Fonts',
  inlineFonts,
  (options) => options.optimizeFonts || true
)
registerPostProcessor(
  'Render-Preloads',
  renderPreloads,
  (options) => options.preloadImages
)

export default processHTML

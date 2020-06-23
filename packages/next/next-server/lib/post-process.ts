import { parse, HTMLElement } from 'node-html-parser'

const MIDDLEWARE_TIME_BUDGET = 10

type postProcessOptions = {
  preloadImages: boolean
}

type postProcessData = {
  preloads: {
    images: Array<string>
  }
}

type postProcessMiddleware = (
  htmlRoot: HTMLElement,
  data: postProcessData
) => Promise<HTMLElement>
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
  options: postProcessOptions
): Promise<string> {
  // Don't parse unless there's at least one processor middleware
  if (!middlewareRegistry[0]) {
    return html
  }
  const data: postProcessData = {
    preloads: {
      images: [],
    },
  }
  let root: HTMLElement = parse(html)

  // Calls the middleware, with some instrumentation and logging
  async function callMiddleWare(
    middleware: postProcessMiddleware,
    name: string
  ) {
    let timer = Date.now()
    root = await middleware(root, data)
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

  return root.toString()
}

// Middleware
const findImages: postProcessMiddleware = async (htmlRoot, data) => {
  // TODO: Image preload finding logic here--adds to data
  console.log(htmlRoot, data)
  return
}

// Middleware
const inlineFonts: postProcessMiddleware = async (htmlRoot) => {
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
    link.insertAdjacentHTML(
      'afterend',
      `<style data-optimized-fonts='${link.getAttribute('href')}'></style>`
    )
    /**
     * Removing the actual element is not supported in node-html-parser
     * so we just remove the href effectively making it inert.
     */
    link.removeAttribute('href')
  })
  return htmlRoot
}

const renderPreloads: postProcessMiddleware = async (htmlRoot, data) => {
  // TODO: Render preload tags from data
  console.log(htmlRoot, data)
  return
}

// Initialization
registerPostProcessor(
  'Find-Images',
  findImages,
  (options) => options.preloadImages
)
// Initialization
registerPostProcessor('Inline-Fonts', inlineFonts, () => true)
registerPostProcessor(
  'Render-Preloads',
  renderPreloads,
  (options) => options.preloadImages
)

export default processHTML

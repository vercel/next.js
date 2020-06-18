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
) => Promise<void>
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
  const root: HTMLElement = parse(html)

  // Calls the middleware, with some instrumentation and logging
  async function callMiddleWare(
    middleware: postProcessMiddleware,
    name: string
  ) {
    let timer = Date.now()
    await middleware(root, data)
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
registerPostProcessor(
  'Render-Preloads',
  renderPreloads,
  (options) => options.preloadImages
)

export default processHTML

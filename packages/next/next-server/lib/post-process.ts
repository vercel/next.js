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

interface PostProcessMiddleware {
  inspect: (
    originalDom: HTMLElement,
    data: postProcessData,
    options: renderOpts
  ) => void
  mutate: (
    markup: string,
    data: postProcessData,
    options: renderOpts
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
    middleware: PostProcessMiddleware,
    name: string
  ) {
    let timer = Date.now()
    middleware.inspect(root, postProcessData, data)
    document = await middleware.mutate(document, postProcessData, data)
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

class FindImages implements PostProcessMiddleware {
  inspect(
    _originalDom: HTMLElement,
    _data: postProcessData,
    _options: renderOpts
  ) {
    return
  }
  mutate = async (
    markup: string,
    _data: postProcessData,
    _options: renderOpts
  ) => {
    return markup
  }
}

class FontOptimizerMiddleware implements PostProcessMiddleware {
  fontDefinitions: {
    [key: string]: string
  } = {}

  inspect(
    originalDom: HTMLElement,
    _data: postProcessData,
    options: renderOpts
  ) {
    if (!options.getFontDefinition) {
      console.log('early')
      return
    }
    const getFontDefinition = options.getFontDefinition
    // collecting all the requested font definitions
    originalDom
      .querySelectorAll('link')
      .filter(
        (tag: HTMLElement) =>
          tag.getAttribute('rel') === 'stylesheet' &&
          tag.hasAttribute('data-href') &&
          tag
            .getAttribute('data-href')
            .startsWith('https://fonts.googleapis.com/css')
      )
      .forEach((element: HTMLElement) => {
        const url = element.getAttribute('data-href')
        this.fontDefinitions[url] = getFontDefinition(url)
      })
  }
  mutate = async (
    markup: string,
    _data: postProcessData,
    _options: renderOpts
  ) => {
    let result = markup
    for (const key in this.fontDefinitions) {
      result = result.replace(
        '</head>',
        `<style data-href="${key}">${this.fontDefinitions[key].replace(
          /(\n|\s)/g,
          ''
        )}</style>`
      )
    }
    return result
  }
}

// Middleware
// const inlineFonts: postProcessMiddleware = async (
//   htmlRoot,
//   document,
//   _data,
//   options
// ) => {
//   if (!options.getFontDefinition) {
//     return htmlRoot
//   }

//   const getFontDefinition = options.getFontDefinition
//   const links = htmlRoot
//     .querySelectorAll('link')
//     .filter(
//       (tag) =>
//         tag.getAttribute('rel') === 'stylesheet' &&
//         tag.hasAttribute('href') &&
//         tag
//           .getAttribute('href')
//           .startsWith('https://fonts.googleapis.com/css2?')
//     )
//   links.forEach((link) => {
//     const url = link.getAttribute('href')
//     console.log(document, '...', `<link href="${url}"`)
//     document = document.replace(
//       `<link href="${url}"`,
//       `<link data-href="${url}"`
//     )
//     document = document.replace(
//       '</head>',
//       `<style data-font-url='${url}'>${getFontDefinition(url)}</style></head>`
//     )
//     /**
//      * Removing the actual element is not supported in node-html-parser
//      * so we just remove the href effectively making it inert.
//      */
//     //link.removeAttribute('href')
//   })
//   return document
// }

class RenderPreloads implements PostProcessMiddleware {
  inspect = (
    _originalDom: HTMLElement,
    _data: postProcessData,
    _options: renderOpts
  ) => {}
  mutate = async (
    markup: string,
    _data: postProcessData,
    _options: renderOpts
  ) => {
    return markup
  }
}

// Initialization
registerPostProcessor(
  'Find-Images',
  new FindImages(),
  (options) => options.preloadImages
)
// Initialization
registerPostProcessor(
  'Inline-Fonts',
  new FontOptimizerMiddleware(),
  (options) => options.optimizeFonts || true
)
registerPostProcessor(
  'Render-Preloads',
  new RenderPreloads(),
  (options) => options.preloadImages
)

export default processHTML

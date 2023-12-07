import type { AppPageRender } from '../../../app-render/app-render'

export const lazyRenderAppPage: AppPageRender = (...args) => {
  if (process.env.NEXT_MINIMAL) {
    throw new Error("Can't use lazyRenderAppPage in minimal mode")
  } else {
    const render: AppPageRender =
      require('./module.compiled').renderToHTMLOrFlight

    return render(...args)
  }
}

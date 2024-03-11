import type { PagesRender } from '../../../render'

export const lazyRenderPagesPage: PagesRender = (...args) => {
  if (process.env.NEXT_MINIMAL) {
    throw new Error("Can't use lazyRenderPagesPage in minimal mode")
  } else {
    const render: PagesRender = require('./module.compiled').renderToHTML

    return render(...args)
  }
}

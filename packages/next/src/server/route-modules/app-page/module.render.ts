import type {
  AppPagePrerender,
  AppPageRender,
} from '../../app-render/app-render'

function getAppPageModule(): typeof import('./module.compiled') {
  if (process.env.NEXT_MINIMAL) {
    throw new Error("Can't use lazyRenderAppPage in minimal mode")
  } else {
    return require('./module.compiled') as typeof import('./module.compiled')
  }
}

export const lazyRenderAppPage: AppPageRender = (...args) => {
  const render: AppPageRender = getAppPageModule().renderToHTMLOrFlight
  return render(...args)
}

export const lazyPrerenderAppPage: AppPagePrerender = (...args) => {
  const prerender: AppPagePrerender = getAppPageModule().prerenderToHTMLOrFlight
  return prerender(...args)
}

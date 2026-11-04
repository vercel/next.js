import type { AppPagePrerender } from '../../app-render/app-render'

function getAppPageModule(): typeof import('./module.compiled') {
  if (process.env.NEXT_MINIMAL) {
    throw new Error("Can't use lazyPrerenderAppPage in minimal mode")
  } else {
    return require('./module.compiled') as typeof import('./module.compiled')
  }
}

export const lazyPrerenderAppPage: AppPagePrerender = (...args) => {
  const prerender: AppPagePrerender = getAppPageModule().prerenderToHTMLOrFlight
  return prerender(...args)
}

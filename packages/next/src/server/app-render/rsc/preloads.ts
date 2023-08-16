/*

Files in the rsc directory are meant to be packaged as part of the RSC graph using next-app-loader.

*/

import ReactDOM from 'react-dom'

const stylePreloadOptions = { as: 'style' }
export function preloadStyle(href: string) {
  ;(ReactDOM as any).preload(href, stylePreloadOptions)
}

export function preloadFont(href: string, type: string) {
  ;(ReactDOM as any).preload(href, { as: 'font', type })
}

export function preconnect(href: string, crossOrigin?: string) {
  if (typeof crossOrigin === 'string') {
    ;(ReactDOM as any).preconnect(href, { crossOrigin })
  } else {
    ;(ReactDOM as any).preconnect(href)
  }
}

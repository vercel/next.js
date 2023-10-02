/*

Files in the rsc directory are meant to be packaged as part of the RSC graph using next-app-loader.

*/

import ReactDOM from 'react-dom'

export function preloadStyle(href: string, crossOrigin?: string | undefined) {
  ReactDOM.preload(href, { as: 'style', crossOrigin })
}

export function preloadFont(
  href: string,
  type: string,
  crossOrigin?: string | undefined
) {
  ;(ReactDOM as any).preload(href, { as: 'font', type, crossOrigin })
}

export function preconnect(href: string, crossOrigin?: string | undefined) {
  if (typeof crossOrigin === 'string') {
    ;(ReactDOM as any).preconnect(href, { crossOrigin })
  } else {
    ;(ReactDOM as any).preconnect(href)
  }
}

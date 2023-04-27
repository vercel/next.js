/*

Files in the rsc directory are meant to be packaged as part of the RSC graph using next-app-loader.

*/

import ReactDOM from 'react-dom'

const stylePreloadOptions = { as: 'style' }
export function preloadStyle(href: string) {
  ;(ReactDOM as any).preload(href, stylePreloadOptions)
}

/*

Files in the rsc directory are meant to be packaged as part of the RSC graph using next-app-loader.

*/

import ReactDOM from 'react-dom'

export function preloadStyle(
  href: string,
  crossOrigin: string | undefined,
  nonce: string | undefined
) {
  const opts: any = { as: 'style' }
  if (typeof crossOrigin === 'string') {
    opts.crossOrigin = crossOrigin
  }
  if (typeof nonce === 'string') {
    opts.nonce = nonce
  }
  ReactDOM.preload(href, opts)
}

export function preloadFont(
  href: string,
  type: string,
  crossOrigin: string | undefined,
  nonce: string | undefined
) {
  const opts: any = { as: 'font', type }
  if (typeof crossOrigin === 'string') {
    opts.crossOrigin = crossOrigin
  }
  if (typeof nonce === 'string') {
    opts.nonce = nonce
  }
  ReactDOM.preload(href, opts)
}

export function preconnect(
  href: string,
  crossOrigin: string | undefined,
  nonce: string | undefined
) {
  const opts: any = {}
  if (typeof crossOrigin === 'string') {
    opts.crossOrigin = crossOrigin
  }
  if (typeof nonce === 'string') {
    opts.nonce = nonce
  }
  ;(ReactDOM as any).preconnect(href, opts)
}

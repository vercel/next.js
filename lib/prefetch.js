/* global __NEXT_DATA__, fetch, window */

import React from 'react'
import Link, { isLocal } from './link'
import { parse as urlParse } from 'url'
// Add fetch polyfill for older browsers
import 'whatwg-fetch'

const PREFETCHED_URLS = {}

function getPrefetchUrl (href) {
  let { pathname } = urlParse(href)
  const url = `/_next/${__NEXT_DATA__.buildId}/pages${pathname}`

  return url
}

export async function prefetch (href) {
  if (typeof window === 'undefined') return
  if (!isLocal(href)) return

  const url = getPrefetchUrl(href)
  if (PREFETCHED_URLS[url]) return PREFETCHED_URLS[url]

  PREFETCHED_URLS[url] = fetch(url)
  return PREFETCHED_URLS[url]
}

export function getPrefetchedData (url) {
  const ref = PREFETCHED_URLS[url]
  if (!ref) return null

  return ref.then((res) => res.json())
}

export async function reloadIfPrefetched (href) {
  const url = getPrefetchUrl(href)
  if (!PREFETCHED_URLS[url]) return

  delete PREFETCHED_URLS[url]
  await prefetch(href)
}

export default class LinkPrefetch extends React.Component {
  render () {
    const { href } = this.props
    if (this.props.prefetch !== false) {
      prefetch(href)
    }

    return (<Link {...this.props} />)
  }
}

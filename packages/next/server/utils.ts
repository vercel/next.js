import type { NextParsedUrlQuery } from './request-meta'
import React from 'react'
import { BLOCKED_PAGES } from '../shared/lib/constants'

export function isBlockedPage(pathname: string): boolean {
  return BLOCKED_PAGES.includes(pathname)
}

export function cleanAmpPath(pathname: string): string {
  if (pathname.match(/\?amp=(y|yes|true|1)/)) {
    pathname = pathname.replace(/\?amp=(y|yes|true|1)&?/, '?')
  }
  if (pathname.match(/&amp=(y|yes|true|1)/)) {
    pathname = pathname.replace(/&amp=(y|yes|true|1)/, '')
  }
  pathname = pathname.replace(/\?$/, '')
  return pathname
}

export function isBot(userAgent: string): boolean {
  return /Googlebot|Mediapartners-Google|AdsBot-Google|googleweblight|Storebot-Google|Google-PageRenderer|Bingbot|BingPreview|Slurp|DuckDuckBot|baiduspider|yandex|sogou|LinkedInBot|bitlybot|tumblr|vkShare|quora link preview|facebookexternalhit|facebookcatalog|Twitterbot|applebot|redditbot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|ia_archiver/i.test(
    userAgent
  )
}

export function isTargetLikeServerless(target: string) {
  const isServerless = target === 'serverless'
  const isServerlessTrace = target === 'experimental-serverless-trace'
  return isServerless || isServerlessTrace
}

const INTERNAL_QUERY_NAMES = [
  '__nextFallback',
  '__nextLocale',
  '__nextDefaultLocale',
  '__nextIsNotFound',
  // RSC
  '__flight__',
  '__props__',
  // Routing
  '__flight_router_state_tree__',
] as const

export function stripInternalQueries(query: NextParsedUrlQuery) {
  for (const name of INTERNAL_QUERY_NAMES) {
    delete query[name]
  }
}

export function stripInternalSearchParams(searchParams: URLSearchParams) {
  for (const name of INTERNAL_QUERY_NAMES) {
    searchParams.delete(name)
  }

  return searchParams
}

// When react version is >= 18 opt-in using reactRoot
export const shouldUseReactRoot = parseInt(React.version) >= 18

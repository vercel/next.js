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

export function isTargetLikeServerless(target: string) {
  const isServerless = target === 'serverless'
  const isServerlessTrace = target === 'experimental-serverless-trace'
  return isServerless || isServerlessTrace
}

// When react version is >= 18 opt-in using reactRoot
export const shouldUseReactRoot = parseInt(React.version) >= 18

export function validateRootLayout(htmlResult: string) {
  const missingTags = [
    htmlResult.includes('<html') ? null : 'html',
    htmlResult.includes('<head') ? null : 'head',
    htmlResult.includes('<body') ? null : 'body',
  ].filter(Boolean)

  if (missingTags.length > 0) {
    throw new Error(
      `Missing required root layout tag${
        missingTags.length === 1 ? '' : 's'
      }: ` + missingTags.join(', ')
    )
  }
}

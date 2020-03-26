import { BLOCKED_PAGES } from '../lib/constants'
import { Env } from '../../lib/load-env-config'

export function isBlockedPage(pathname: string): boolean {
  return BLOCKED_PAGES.indexOf(pathname) !== -1
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

export function collectEnv(page: string, env: Env, pageEnv?: string[]): Env {
  const missingEnvKeys = new Set()
  const collected = pageEnv
    ? pageEnv.reduce((prev: Env, key): Env => {
        if (typeof env[key] !== 'undefined') {
          prev[key] = env[key]!
        } else {
          missingEnvKeys.add(key)
        }
        return prev
      }, {})
    : {}

  if (missingEnvKeys.size > 0) {
    console.warn(
      `Missing env value${missingEnvKeys.size === 1 ? '' : 's'}: ${[
        ...missingEnvKeys,
      ].join(', ')} for ${page}.\n` +
        `Make sure to supply this value in either your .env file or in your environment.\n` +
        `See here for more info: https://err.sh/next.js/missing-env-value`
    )
  }
  return collected
}

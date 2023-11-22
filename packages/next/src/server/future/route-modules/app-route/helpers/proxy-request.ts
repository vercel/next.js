import type * as ServerHooks from '../../../../../client/components/hooks-server-context'
import type * as HeaderHooks from '../../../../../client/components/headers'
import type { staticGenerationBailout as StaticGenerationBailout } from '../../../../../client/components/static-generation-bailout'
import type { AppRouteUserlandModule } from '../module'
import type { NextRequest } from '../../../../web/spec-extension/request'

import { RequestCookies } from 'next/dist/compiled/@edge-runtime/cookies'
import { NextURL } from '../../../../web/next-url'
import { cleanURL } from './clean-url'

export function proxyRequest(
  request: NextRequest,
  { dynamic }: Pick<AppRouteUserlandModule, 'dynamic'>,
  hooks: {
    readonly serverHooks: typeof ServerHooks
    readonly headerHooks: typeof HeaderHooks
    readonly staticGenerationBailout: typeof StaticGenerationBailout
  }
): NextRequest {
  function handleNextUrlBailout(prop: string | symbol) {
    switch (prop) {
      case 'search':
      case 'searchParams':
      case 'toString':
      case 'href':
      case 'origin':
        hooks.staticGenerationBailout(`nextUrl.${prop as string}`)
        return
      default:
        return
    }
  }

  const cache: {
    url?: string
    toString?: () => string
    headers?: Headers
    cookies?: RequestCookies
    searchParams?: URLSearchParams
  } = {}

  const handleForceStatic = (url: string, prop: string) => {
    switch (prop) {
      case 'search':
        return ''
      case 'searchParams':
        if (!cache.searchParams) cache.searchParams = new URLSearchParams()

        return cache.searchParams
      case 'url':
      case 'href':
        if (!cache.url) cache.url = cleanURL(url)

        return cache.url
      case 'toJSON':
      case 'toString':
        if (!cache.url) cache.url = cleanURL(url)
        if (!cache.toString) cache.toString = () => cache.url!

        return cache.toString
      case 'headers':
        if (!cache.headers) cache.headers = new Headers()

        return cache.headers
      case 'cookies':
        if (!cache.headers) cache.headers = new Headers()
        if (!cache.cookies) cache.cookies = new RequestCookies(cache.headers)

        return cache.cookies
      case 'clone':
        if (!cache.url) cache.url = cleanURL(url)

        return () => new NextURL(cache.url!)
      default:
        break
    }
  }

  const wrappedNextUrl = new Proxy(request.nextUrl, {
    get(target, prop) {
      handleNextUrlBailout(prop)

      if (dynamic === 'force-static' && typeof prop === 'string') {
        const result = handleForceStatic(target.href, prop)
        if (result !== undefined) return result
      }
      const value = (target as any)[prop]

      if (typeof value === 'function') {
        return value.bind(target)
      }
      return value
    },
    set(target, prop, value) {
      handleNextUrlBailout(prop)
      ;(target as any)[prop] = value
      return true
    },
  })

  const handleReqBailout = (prop: string | symbol) => {
    switch (prop) {
      case 'headers':
        hooks.headerHooks.headers()
        return
      // if request.url is accessed directly instead of
      // request.nextUrl we bail since it includes query
      // values that can be relied on dynamically
      case 'url':
      case 'cookies':
      case 'body':
      case 'blob':
      case 'json':
      case 'text':
      case 'arrayBuffer':
      case 'formData':
        hooks.staticGenerationBailout(`request.${prop}`)
        return
      default:
        return
    }
  }

  return new Proxy(request, {
    get(target, prop) {
      handleReqBailout(prop)

      if (prop === 'nextUrl') {
        return wrappedNextUrl
      }

      if (dynamic === 'force-static' && typeof prop === 'string') {
        const result = handleForceStatic(target.url, prop)
        if (result !== undefined) return result
      }
      const value: any = (target as any)[prop]

      if (typeof value === 'function') {
        return value.bind(target)
      }
      return value
    },
    set(target, prop, value) {
      handleReqBailout(prop)
      ;(target as any)[prop] = value
      return true
    },
  })
}

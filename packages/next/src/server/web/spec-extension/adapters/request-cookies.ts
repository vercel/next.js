import type { RequestCookies } from '../cookies'
import type { BaseNextResponse } from '../../../base-http'
import type { ServerResponse } from 'http'

import { ResponseCookies } from '../cookies'
import { ReflectAdapter } from './reflect'

/**
 * @internal
 */
export class ReadonlyRequestCookiesError extends Error {
  constructor() {
    super(
      'ReadonlyRequestCookies cannot be modified. Read more: https://nextjs.org/docs/api-reference/cookies'
    )
  }

  public static callable() {
    throw new ReadonlyRequestCookiesError()
  }
}

export type ReadonlyRequestCookies = Omit<
  RequestCookies,
  'clear' | 'delete' | 'set'
>

export class RequestCookiesAdapter {
  public static seal(cookies: RequestCookies): ReadonlyRequestCookies {
    return new Proxy(cookies, {
      get(target, prop, receiver) {
        switch (prop) {
          case 'clear':
          case 'delete':
          case 'set':
            return ReadonlyRequestCookiesError.callable
          default:
            return ReflectAdapter.get(target, prop, receiver)
        }
      },
    })
  }
}

export const SYMBOL_MODIFY_COOKIE_VALUES = Symbol.for('next.mutated.cookies')

type ResponseCookie = NonNullable<
  ReturnType<InstanceType<typeof ResponseCookies>['get']>
>

export class MutableRequestCookiesAdapter {
  public static seal(
    cookies: ResponseCookies,
    res: ServerResponse | BaseNextResponse | undefined
  ): ResponseCookies {
    let modifiedValues: ResponseCookie[] = []
    const modifiedCookies = new Set<string>()
    const updateResponseCookies = () => {
      const allCookies = cookies.getAll()
      modifiedValues = allCookies.filter((c) => modifiedCookies.has(c.name))
      if (res) {
        const cookies: string[] = []
        modifiedValues.map((cookie) => {
          const tempCookies = new ResponseCookies(new Headers())
          tempCookies.set(cookie)
          cookies.push(tempCookies.toString())
        })
        res.setHeader('Set-Cookie', cookies)
      }
    }

    return new Proxy(cookies, {
      get(target, prop, receiver) {
        switch (prop) {
          // A special symbol to get the modified cookie values
          case SYMBOL_MODIFY_COOKIE_VALUES:
            return modifiedValues

          // TODO: Throw error if trying to set a cookie after the response
          // headers have been set.
          case 'delete':
            return function (...args: [string] | [ResponseCookie]) {
              modifiedCookies.add(
                typeof args[0] === 'string' ? args[0] : args[0].name
              )
              try {
                cookies.delete(...args)
              } finally {
                updateResponseCookies()
              }
            }
          case 'set':
            return function (
              ...args:
                | [key: string, value: string, cookie?: Partial<ResponseCookie>]
                | [options: ResponseCookie]
            ) {
              modifiedCookies.add(
                typeof args[0] === 'string' ? args[0] : args[0].name
              )
              try {
                return cookies.set(...args)
              } finally {
                updateResponseCookies()
              }
            }
          default:
            return ReflectAdapter.get(target, prop, receiver)
        }
      },
    })
  }
}

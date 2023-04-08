import type { RequestCookies } from '../cookies'
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

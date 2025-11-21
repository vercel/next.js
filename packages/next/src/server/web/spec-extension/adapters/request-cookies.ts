import { RequestCookies } from '../cookies'

import { ResponseCookies } from '../cookies'
import { ReflectAdapter } from './reflect'
import { workAsyncStorage } from '../../../app-render/work-async-storage.external'
import type { RequestStore } from '../../../app-render/work-unit-async-storage.external'

/**
 * @internal
 */
export class ReadonlyRequestCookiesError extends Error {
  constructor() {
    super(
      'Cookies can only be modified in a Server Action or Route Handler. Read more: https://nextjs.org/docs/app/api-reference/functions/cookies#options'
    )
  }

  public static callable() {
    throw new ReadonlyRequestCookiesError()
  }
}

// We use this to type some APIs but we don't construct instances directly
export type { ResponseCookies }

// The `cookies()` API is a mix of request and response cookies. For `.get()` methods,
// we want to return the request cookie if it exists. For mutative methods like `.set()`,
// we want to return the response cookie.
export type ReadonlyRequestCookies = Omit<
  RequestCookies,
  'set' | 'clear' | 'delete'
> &
  Pick<ResponseCookies, 'set' | 'delete'>

export class RequestCookiesAdapter {
  public static seal(cookies: RequestCookies): ReadonlyRequestCookies {
    return new Proxy(cookies as any, {
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

const SYMBOL_MODIFY_COOKIE_VALUES = Symbol.for('next.mutated.cookies')

export function getModifiedCookieValues(
  cookies: ResponseCookies
): ResponseCookie[] {
  const modified: ResponseCookie[] | undefined = (cookies as unknown as any)[
    SYMBOL_MODIFY_COOKIE_VALUES
  ]
  if (!modified || !Array.isArray(modified) || modified.length === 0) {
    return []
  }

  return modified
}

type SetCookieArgs =
  | [key: string, value: string, cookie?: Partial<ResponseCookie>]
  | [options: ResponseCookie]

export function appendMutableCookies(
  headers: Headers,
  mutableCookies: ResponseCookies
): boolean {
  const modifiedCookieValues = getModifiedCookieValues(mutableCookies)
  if (modifiedCookieValues.length === 0) {
    return false
  }

  // Return a new response that extends the response with
  // the modified cookies as fallbacks. `res` cookies
  // will still take precedence.
  const resCookies = new ResponseCookies(headers)
  const returnedCookies = resCookies.getAll()

  // Set the modified cookies as fallbacks.
  for (const cookie of modifiedCookieValues) {
    resCookies.set(cookie)
  }

  // Set the original cookies as the final values.
  for (const cookie of returnedCookies) {
    resCookies.set(cookie)
  }

  return true
}

type ResponseCookie = NonNullable<
  ReturnType<InstanceType<typeof ResponseCookies>['get']>
>

export class MutableRequestCookiesAdapter {
  public static wrap(
    cookies: RequestCookies,
    onUpdateCookies?: (cookies: string[]) => void
  ): ResponseCookies {
    const responseCookies = new ResponseCookies(new Headers())
    for (const cookie of cookies.getAll()) {
      responseCookies.set(cookie)
    }

    let modifiedValues: ResponseCookie[] = []
    const modifiedCookies = new Set<string>()
    const updateResponseCookies = () => {
      // TODO-APP: change method of getting workStore
      const workStore = workAsyncStorage.getStore()
      if (workStore) {
        workStore.pathWasRevalidated = true
      }

      const allCookies = responseCookies.getAll()
      modifiedValues = allCookies.filter((c) => modifiedCookies.has(c.name))
      if (onUpdateCookies) {
        const serializedCookies: string[] = []
        for (const cookie of modifiedValues) {
          const tempCookies = new ResponseCookies(new Headers())
          tempCookies.set(cookie)
          serializedCookies.push(tempCookies.toString())
        }

        onUpdateCookies(serializedCookies)
      }
    }

    const wrappedCookies = new Proxy(responseCookies, {
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
                target.delete(...args)
                return wrappedCookies
              } finally {
                updateResponseCookies()
              }
            }
          case 'set':
            return function (...args: SetCookieArgs) {
              modifiedCookies.add(
                typeof args[0] === 'string' ? args[0] : args[0].name
              )
              try {
                target.set(...args)
                return wrappedCookies
              } finally {
                updateResponseCookies()
              }
            }

          default:
            return ReflectAdapter.get(target, prop, receiver)
        }
      },
    })

    return wrappedCookies
  }
}

export function createCookiesWithMutableAccessCheck(
  requestStore: RequestStore
): ResponseCookies {
  const wrappedCookies = new Proxy(requestStore.mutableCookies, {
    get(target, prop, receiver) {
      switch (prop) {
        case 'delete':
          return function (...args: [string] | [ResponseCookie]) {
            ensureCookiesAreStillMutable(requestStore, 'cookies().delete')
            target.delete(...args)
            return wrappedCookies
          }
        case 'set':
          return function (...args: SetCookieArgs) {
            ensureCookiesAreStillMutable(requestStore, 'cookies().set')
            target.set(...args)
            return wrappedCookies
          }

        default:
          return ReflectAdapter.get(target, prop, receiver)
      }
    },
  })
  return wrappedCookies
}

export function areCookiesMutableInCurrentPhase(requestStore: RequestStore) {
  return requestStore.phase === 'action'
}

/** Ensure that cookies() starts throwing on mutation
 * if we changed phases and can no longer mutate.
 *
 * This can happen when going:
 *   'render' -> 'after'
 *   'action' -> 'render'
 * */
function ensureCookiesAreStillMutable(
  requestStore: RequestStore,
  _callingExpression: string
) {
  if (!areCookiesMutableInCurrentPhase(requestStore)) {
    // TODO: maybe we can give a more precise error message based on callingExpression?
    throw new ReadonlyRequestCookiesError()
  }
}

export function responseCookiesToRequestCookies(
  responseCookies: ResponseCookies
): RequestCookies {
  const requestCookies = new RequestCookies(new Headers())
  for (const cookie of responseCookies.getAll()) {
    requestCookies.set(cookie)
  }
  return requestCookies
}

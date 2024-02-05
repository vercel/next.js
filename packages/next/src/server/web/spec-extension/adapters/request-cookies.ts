import type { RequestCookies } from '../cookies'
import type { StaticGenerationStore } from '../../../../client/components/static-generation-async-storage.external'

import { ResponseCookies } from '../cookies'
import { ReflectAdapter } from './reflect'

/**
 * @internal
 */
export class ReadonlyRequestCookiesError extends Error {
  constructor() {
    super(
      'Cookies can only be modified in a Server Action or Route Handler. Read more: https://nextjs.org/docs/app/api-reference/functions/cookies#cookiessetname-value-options'
    )
  }

  public static callable() {
    throw new ReadonlyRequestCookiesError()
  }
}

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
      // TODO-APP: change method of getting staticGenerationAsyncStore
      const staticGenerationAsyncStore = (fetch as any)
        .__nextGetStaticStore?.()
        ?.getStore() as undefined | StaticGenerationStore
      if (staticGenerationAsyncStore) {
        staticGenerationAsyncStore.pathWasRevalidated = true
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

    return new Proxy(responseCookies, {
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
                return target.set(...args)
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

import { RequestCookies } from '../cookies'

import { ResponseCookies } from '../cookies'
import { ReflectAdapter } from './reflect'
import { workAsyncStorage } from '../../../app-render/work-async-storage.external'
import type { RequestStore } from '../../../app-render/work-unit-async-storage.external'
import { ActionDidRevalidateStaticAndDynamic } from '../../../../shared/lib/action-revalidation-kind'

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

/**
 * Next.js-specific options for cookie mutations, accepted by
 * `cookies().set()` and `cookies().delete()` in addition to the standard
 * cookie attributes.
 */
export type NextCookieMutationOptions = {
  /**
   * Whether mutating this cookie marks the current path as revalidated,
   * causing the page to be re-rendered on the server and the client router
   * caches to be invalidated after the Server Action completes. Defaults to
   * `true`.
   *
   * Pass `revalidate: false` when the mutation doesn't affect rendered
   * content (for example, when refreshing a session cookie) to skip the extra
   * re-render. The cookie is still set on the response as usual.
   *
   * This option only has an effect in Server Actions. In Route Handlers and
   * Middleware, cookie mutations never trigger revalidation, so the option is
   * accepted but has no effect there. Note that cookies set by Middleware on
   * the current request are merged into the Server Action's mutable cookies
   * and always request revalidation, which cannot be opted out of with this
   * option.
   *
   * @experimental
   */
  revalidate?: boolean
}

export type NextSetCookieOptions = ResponseCookie & NextCookieMutationOptions

export type NextDeleteCookieOptions = Omit<
  ResponseCookie,
  'value' | 'expires'
> &
  NextCookieMutationOptions

/**
 * The cookie mutation methods of `ResponseCookies`, extended with
 * Next.js-specific options.
 */
export interface NextCookieMutationMethods {
  set(
    ...args:
      | [key: string, value: string, cookie?: Partial<NextSetCookieOptions>]
      | [options: NextSetCookieOptions]
  ): this
  delete(...args: [key: string] | [options: NextDeleteCookieOptions]): this
}

// The `cookies()` API is a mix of request and response cookies. For `.get()` methods,
// we want to return the request cookie if it exists. For mutative methods like `.set()`,
// we want to return the response cookie.
export type ReadonlyRequestCookies = Omit<
  RequestCookies,
  'set' | 'clear' | 'delete'
> &
  NextCookieMutationMethods

/**
 * `ResponseCookies` with the mutation methods extended with Next.js-specific
 * options. This is the runtime shape of the mutable cookies object created by
 * `MutableRequestCookiesAdapter.wrap`.
 */
export type MutableRequestCookies = Omit<ResponseCookies, 'set' | 'delete'> &
  NextCookieMutationMethods

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

  /**
   * @param cookies
   * @returns A fresh object identity backed by the original value
   */
  public static fresh(cookies: ReadonlyRequestCookies): ReadonlyRequestCookies {
    return new Proxy(cookies, {
      get(target, prop, receiver) {
        return ReflectAdapter.get(target, prop, receiver)
      },
    })
  }
}

const SYMBOL_MODIFY_COOKIE_VALUES = Symbol.for('next.mutated.cookies')
const SYMBOL_MUTATED_COOKIES_REVALIDATE = Symbol.for(
  'next.mutated.cookies.revalidate'
)

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

/**
 * Whether any cookie mutation on this `MutableRequestCookiesAdapter`-wrapped
 * cookies object requested path revalidation, i.e. was performed without
 * `revalidate: false`. Returns `false` for cookies objects that were never
 * mutated (or aren't wrapped).
 */
export function didMutatedCookiesRequestRevalidation(
  cookies: ResponseCookies
): boolean {
  return (cookies as unknown as any)[SYMBOL_MUTATED_COOKIES_REVALIDATE] === true
}

type SetCookieArgs =
  | [key: string, value: string, cookie?: Partial<NextSetCookieOptions>]
  | [options: NextSetCookieOptions]

type DeleteCookieArgs = [key: string] | [options: NextDeleteCookieOptions]

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
  ): MutableRequestCookies {
    const responseCookies = new ResponseCookies(new Headers())
    for (const cookie of cookies.getAll()) {
      responseCookies.set(cookie)
    }

    let modifiedValues: ResponseCookie[] = []
    const modifiedCookies = new Set<string>()
    let mutationsRequestedRevalidation = false
    const updateResponseCookies = (shouldRevalidate: boolean) => {
      if (shouldRevalidate) {
        // Once any mutation requested revalidation, a later mutation with
        // `revalidate: false` must not undo it.
        mutationsRequestedRevalidation = true

        // TODO-APP: change method of getting workStore
        const workStore = workAsyncStorage.getStore()
        if (workStore) {
          workStore.pathWasRevalidated = ActionDidRevalidateStaticAndDynamic
        }
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

          // A special symbol to check whether any cookie mutation requested
          // path revalidation, i.e. was performed without `revalidate: false`.
          case SYMBOL_MUTATED_COOKIES_REVALIDATE:
            return mutationsRequestedRevalidation

          // TODO: Throw error if trying to set a cookie after the response
          // headers have been set.
          case 'delete':
            return function (...args: DeleteCookieArgs) {
              modifiedCookies.add(
                typeof args[0] === 'string' ? args[0] : args[0].name
              )
              let shouldRevalidate = true
              try {
                if (typeof args[0] === 'string') {
                  target.delete(args[0])
                } else if ('revalidate' in args[0]) {
                  const options = args[0]
                  shouldRevalidate = options.revalidate !== false
                  // Strip the Next.js-specific `revalidate` option so that it
                  // isn't stored on the underlying cookie. `name` is read off
                  // the original object because a rest-destructure only copies
                  // own enumerable properties.
                  const { revalidate, ...cookieOptions } = options
                  target.delete({ ...cookieOptions, name: options.name })
                } else {
                  target.delete(args[0])
                }
                return wrappedCookies
              } finally {
                updateResponseCookies(shouldRevalidate)
              }
            }
          case 'set':
            return function (...args: SetCookieArgs) {
              modifiedCookies.add(
                typeof args[0] === 'string' ? args[0] : args[0].name
              )
              let shouldRevalidate = true
              try {
                if (args.length === 1) {
                  const options = args[0]
                  if ('revalidate' in options) {
                    shouldRevalidate = options.revalidate !== false
                    // Strip the Next.js-specific `revalidate` option so that
                    // it isn't stored on the underlying cookie. `name` and
                    // `value` are read off the original object because a
                    // rest-destructure only copies own enumerable properties.
                    const { revalidate, ...cookieOptions } = options
                    target.set({
                      ...cookieOptions,
                      name: options.name,
                      value: options.value,
                    })
                  } else {
                    target.set(options)
                  }
                } else {
                  const [name, value, options] = args
                  if (options && 'revalidate' in options) {
                    shouldRevalidate = options.revalidate !== false
                    const { revalidate, ...cookieOptions } = options
                    target.set(name, value, cookieOptions)
                  } else {
                    target.set(name, value, options)
                  }
                }
                return wrappedCookies
              } finally {
                updateResponseCookies(shouldRevalidate)
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
): MutableRequestCookies {
  const wrappedCookies = new Proxy(requestStore.mutableCookies, {
    get(target, prop, receiver) {
      switch (prop) {
        // The Next.js-specific `revalidate` option is handled by the
        // `MutableRequestCookiesAdapter` proxy that `requestStore.mutableCookies`
        // is wrapped with, so the arguments are forwarded untouched here.
        case 'delete':
          return function (...args: DeleteCookieArgs) {
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

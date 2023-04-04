import { RequestCookies } from '../web/spec-extension/cookies'

const INTERNAL_COOKIES_INSTANCE = Symbol('internal for cookies readonly')
class ReadonlyRequestCookiesError extends Error {
  message =
    'ReadonlyRequestCookies cannot be modified. Read more: https://nextjs.org/api-reference/cookies'
}

export class ReadonlyRequestCookies {
  [INTERNAL_COOKIES_INSTANCE]: RequestCookies

  get: RequestCookies['get']
  getAll: RequestCookies['getAll']
  has: RequestCookies['has']

  constructor(request: {
    headers: {
      get(key: 'cookie'): string | null | undefined
    }
  }) {
    // Since `new Headers` uses `this.append()` to fill the headers object ReadonlyHeaders can't extend from Headers directly as it would throw.
    // Request overridden to not have to provide a fully request object.
    const cookiesInstance = new RequestCookies(request.headers as Headers)
    this[INTERNAL_COOKIES_INSTANCE] = cookiesInstance

    this.get = cookiesInstance.get.bind(cookiesInstance)
    this.getAll = cookiesInstance.getAll.bind(cookiesInstance)
    this.has = cookiesInstance.has.bind(cookiesInstance)
  }

  [Symbol.iterator]() {
    return (this[INTERNAL_COOKIES_INSTANCE] as any)[Symbol.iterator]()
  }

  /**
   * This method is only allowed in Server Actions. Cookies are readonly in
   * components.
   * @link https://nextjs.org/api-reference/cookies
   */
  clear() {
    throw new ReadonlyRequestCookiesError()
  }

  /**
   * This method is only allowed in Server Actions. Cookies are readonly in
   * components.
   * @link https://nextjs.org/api-reference/cookies
   */
  delete() {
    throw new ReadonlyRequestCookiesError()
  }

  /**
   * This method is only allowed in Server Actions. Cookies are readonly in
   * components.
   * @link https://nextjs.org/api-reference/cookies
   */
  set() {
    throw new ReadonlyRequestCookiesError()
  }
}

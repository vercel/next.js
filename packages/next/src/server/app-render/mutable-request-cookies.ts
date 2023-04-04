import { RequestCookies } from '../web/spec-extension/cookies'

const INTERNAL_COOKIES_INSTANCE = Symbol('internal for cookies mutable')

export class MutableRequestCookies {
  [INTERNAL_COOKIES_INSTANCE]: RequestCookies

  get: RequestCookies['get']
  getAll: RequestCookies['getAll']
  has: RequestCookies['has']
  set: RequestCookies['set']
  delete: RequestCookies['delete']
  clear: RequestCookies['clear']

  constructor(request: {
    headers: {
      get(key: 'cookie'): string | null | undefined
      set(name: 'cookie', value: string): void
    }
    onSetCookie(values: string[]): void
  }) {
    // Since `new Headers` uses `this.append()` to fill the headers object ReadonlyHeaders can't extend from Headers directly as it would throw.
    // Request overridden to not have to provide a fully request object.
    const cookiesInstance = new RequestCookies(request.headers as Headers)
    this[INTERNAL_COOKIES_INSTANCE] = cookiesInstance

    const modifiedCookies = new Set<string>()
    const updateResponseCookies = () => {
      const cookies = cookiesInstance.getAll()
      const values = cookies
        .filter((cookie) => modifiedCookies.has(cookie.name))
        .map((cookie) => `${cookie.name}=${cookie.value}`)
      request.onSetCookie(values)
    }

    this.get = cookiesInstance.get.bind(cookiesInstance)
    this.getAll = cookiesInstance.getAll.bind(cookiesInstance)
    this.has = cookiesInstance.has.bind(cookiesInstance)
    this.set = (
      ...args:
        | [key: string, value: string]
        | [options: NonNullable<ReturnType<typeof cookiesInstance.get>>]
    ) => {
      const [key, value] = args
      if (typeof key === 'string') {
        modifiedCookies.add(key)
        try {
          return cookiesInstance.set(key, value!)
        } finally {
          updateResponseCookies()
        }
      }
      modifiedCookies.add(key.name)
      try {
        return cookiesInstance.set(key)
      } finally {
        updateResponseCookies()
      }
    }
    this.delete = (names: string | string[]) => {
      if (Array.isArray(names)) {
        names.forEach((name) => modifiedCookies.add(name))
      } else {
        modifiedCookies.add(names)
      }
      try {
        return cookiesInstance.delete(names)
      } finally {
        updateResponseCookies()
      }
    }
    this.clear = () => {
      for (const cookie of cookiesInstance.getAll()) {
        modifiedCookies.add(cookie.name)
      }
      try {
        return cookiesInstance.clear()
      } finally {
        updateResponseCookies()
      }
    }
  }

  [Symbol.iterator]() {
    return (this[INTERNAL_COOKIES_INSTANCE] as any)[Symbol.iterator]()
  }
}

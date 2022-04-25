import cookie from 'next/dist/compiled/cookie'
import { CookieSerializeOptions } from '../types'

const normalizeCookieOptions = (options: CookieSerializeOptions) => {
  options = Object.assign({}, options)

  if (options.maxAge) {
    options.expires = new Date(Date.now() + options.maxAge)
    options.maxAge /= 1000
  }

  if (options.path == null) {
    options.path = '/'
  }

  return options
}

const serializeValue = (value: unknown) =>
  typeof value === 'object' ? `j:${JSON.stringify(value)}` : String(value)

export class Cookies extends Map<string, any> {
  constructor(input?: string | null) {
    const parsedInput = typeof input === 'string' ? cookie.parse(input) : {}
    super(Object.entries(parsedInput))
  }
  set(key: string, value: unknown, options: CookieSerializeOptions = {}) {
    return super.set(
      key,
      cookie.serialize(
        key,
        serializeValue(value),
        normalizeCookieOptions(options)
      )
    )
  }
}

const deserializeCookie = (input: Request | Response): string[] => {
  const value = input.headers.get('set-cookie')
  return value !== undefined && value !== null ? value.split(', ') : []
}

const serializeCookie = (input: string[]) => input.join(', ')

export class NextCookies extends Cookies {
  response: Request | Response

  constructor(response: Request | Response) {
    super(response.headers.get('cookie'))
    this.response = response
  }
  set(...args: Parameters<Cookies['set']>) {
    const isAlreadyAdded = super.has(args[0])
    const store = super.set(...args)

    if (isAlreadyAdded) {
      const setCookie = serializeCookie(
        deserializeCookie(this.response).filter(
          (value) => !value.startsWith(`${args[0]}=`)
        )
      )

      if (setCookie) {
        this.response.headers.set(
          'set-cookie',
          `${store.get(args[0])}, ${setCookie}`
        )
      } else {
        this.response.headers.set('set-cookie', store.get(args[0]))
      }
    } else {
      this.response.headers.append('set-cookie', store.get(args[0]))
    }

    return store
  }
  delete(key: any) {
    const isDeleted = super.delete(key)

    if (isDeleted) {
      const setCookie = serializeCookie(
        deserializeCookie(this.response).filter(
          (value) => !value.startsWith(`${key}=`)
        )
      )

      if (setCookie) {
        this.response.headers.set('set-cookie', setCookie)
      } else {
        this.response.headers.delete('set-cookie')
      }
    }

    return isDeleted
  }
  clear() {
    this.response.headers.delete('set-cookie')
    return super.clear()
  }
}

export { CookieSerializeOptions }

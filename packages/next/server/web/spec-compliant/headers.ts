import { isIterable } from '../is'

export type HeadersInit = Headers | string[][] | { [key: string]: string }

const MAP = Symbol('map')
const INTERNAL = Symbol('internal')
const INVALID_TOKEN_REGEX = /[^^_`a-zA-Z\-0-9!#$%&'*+.|~]/
const INVALID_HEADER_CHAR_REGEX = /[^\t\x20-\x7e\x80-\xff]/

class BaseHeaders implements Headers {
  [MAP]: { [k: string]: string[] } = {}

  constructor(init?: HeadersInit) {
    if (init instanceof BaseHeaders) {
      const rawHeaders = init.raw()
      for (const headerName of Object.keys(rawHeaders)) {
        for (const value of rawHeaders[headerName]) {
          this.append(headerName, value)
        }
      }
    } else if (isIterable(init)) {
      const pairs = []
      for (const pair of init) {
        if (!isIterable(pair)) {
          throw new TypeError('Each header pair must be iterable')
        }
        pairs.push(Array.from(pair))
      }

      for (const pair of pairs) {
        if (pair.length !== 2) {
          throw new TypeError('Each header pair must be a name/value tuple')
        }
        this.append(pair[0], pair[1])
      }
    } else if (typeof init === 'object') {
      for (const key of Object.keys(init)) {
        this.append(key, init[key])
      }
    } else if (init) {
      throw new TypeError('Provided initializer must be an object')
    }
  }

  get(name: string) {
    const _name = `${name}`
    validateName(_name)
    const key = find(this[MAP], _name)
    if (key === undefined) {
      return null
    }

    return this[MAP][key].join(', ')
  }

  forEach(
    callback: (value: string, name: string, parent: BaseHeaders) => void,
    thisArg: any = undefined
  ): void {
    let pairs = getHeaders(this)
    let i = 0
    while (i < pairs.length) {
      const [name, value] = pairs[i]
      callback.call(thisArg, value, name, this)
      pairs = getHeaders(this)
      i++
    }
  }

  set(name: string, value: string) {
    name = `${name}`
    value = `${value}`
    validateName(name)
    validateValue(value)
    const key = find(this[MAP], name)
    this[MAP][key !== undefined ? key : name] = [value]
  }

  append(name: string, value: string) {
    name = `${name}`
    value = `${value}`
    validateName(name)
    validateValue(value)
    const key = find(this[MAP], name)
    if (key !== undefined) {
      this[MAP][key].push(value)
    } else {
      this[MAP][name] = [value]
    }
  }

  has(name: string) {
    name = `${name}`
    validateName(name)
    return find(this[MAP], name) !== undefined
  }

  delete(name: string) {
    name = `${name}`
    validateName(name)
    const key = find(this[MAP], name)
    if (key !== undefined) {
      delete this[MAP][key]
    }
  }

  raw() {
    return this[MAP]
  }

  keys() {
    return createHeadersIterator(this, 'key')
  }

  values() {
    return createHeadersIterator(this, 'value')
  }

  entries() {
    return createHeadersIterator(this, 'key+value')
  }

  [Symbol.iterator]() {
    return createHeadersIterator(this, 'key+value')
  }
}

function createHeadersIterator(
  target: BaseHeaders,
  kind: 'key' | 'value' | 'key+value'
) {
  const iterator = Object.create(HeadersIteratorPrototype)
  iterator[INTERNAL] = {
    target,
    kind,
    index: 0,
  }
  return iterator
}

function validateName(name: string) {
  name = `${name}`
  if (INVALID_TOKEN_REGEX.test(name)) {
    throw new TypeError(`${name} is not a legal HTTP header name`)
  }
}

function validateValue(value: string) {
  value = `${value}`
  if (INVALID_HEADER_CHAR_REGEX.test(value)) {
    throw new TypeError(`${value} is not a legal HTTP header value`)
  }
}

function find(
  map: { [k: string]: string[] },
  name: string
): string | undefined {
  name = name.toLowerCase()
  for (const key in map) {
    if (key.toLowerCase() === name) {
      return key
    }
  }
  return undefined
}

Object.defineProperty(BaseHeaders.prototype, Symbol.toStringTag, {
  value: 'Headers',
  writable: false,
  enumerable: false,
  configurable: true,
})

Object.defineProperties(BaseHeaders.prototype, {
  append: { enumerable: true },
  delete: { enumerable: true },
  entries: { enumerable: true },
  forEach: { enumerable: true },
  get: { enumerable: true },
  has: { enumerable: true },
  keys: { enumerable: true },
  raw: { enumerable: false },
  set: { enumerable: true },
  values: { enumerable: true },
})

function getHeaders(
  headers: BaseHeaders,
  kind: 'key' | 'value' | 'key+value' = 'key+value'
) {
  const fn =
    kind === 'key'
      ? (key: string) => key.toLowerCase()
      : kind === 'value'
      ? (key: string) => headers[MAP][key].join(', ')
      : (key: string) => [key.toLowerCase(), headers[MAP][key].join(', ')]

  return Object.keys(headers[MAP])
    .sort()
    .map((key) => fn(key))
}

const HeadersIteratorPrototype = Object.setPrototypeOf(
  {
    next() {
      if (!this || Object.getPrototypeOf(this) !== HeadersIteratorPrototype) {
        throw new TypeError('Value of `this` is not a HeadersIterator')
      }

      const { target, kind, index } = this[INTERNAL]
      const values = getHeaders(target, kind)
      const len = values.length
      if (index >= len) {
        return {
          value: undefined,
          done: true,
        }
      }

      this[INTERNAL].index = index + 1

      return {
        value: values[index],
        done: false,
      }
    },
  },
  Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()))
)

Object.defineProperty(HeadersIteratorPrototype, Symbol.toStringTag, {
  value: 'HeadersIterator',
  writable: false,
  enumerable: false,
  configurable: true,
})

export { BaseHeaders as Headers }

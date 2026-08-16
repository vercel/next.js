import type { ParsedUrlQuery } from 'querystring'

/**
 * Adds one entry to a query object.
 *
 * `query[key] = value` cannot be used: for a `key` of `__proto__` that reaches
 * the setter inherited from `Object.prototype`, which replaces the object's
 * prototype instead of adding an entry, and the parameter disappears from the
 * query altogether. Defining the property keeps the ordinary object shape that
 * `router.query` consumers rely on, unlike a null-prototype object.
 */
function defineQueryValue(
  query: ParsedUrlQuery,
  key: string,
  value: string | string[]
): void {
  Object.defineProperty(query, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  })
}

export function searchParamsToUrlQuery(
  searchParams: URLSearchParams
): ParsedUrlQuery {
  const query: ParsedUrlQuery = {}
  for (const [key, value] of searchParams.entries()) {
    // Reading `query[key]` goes through the prototype chain, so a parameter
    // named after an `Object.prototype` member (`constructor`, `toString`,
    // `valueOf`, ...) reads back the inherited value and is mistaken for a
    // parameter that was already seen.
    const existing = Object.prototype.hasOwnProperty.call(query, key)
      ? query[key]
      : undefined

    if (existing === undefined) {
      defineQueryValue(query, key, value)
    } else if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      defineQueryValue(query, key, [existing, value])
    }
  }
  return query
}

function stringifyUrlQueryParam(param: unknown): string {
  if (typeof param === 'string') {
    return param
  }

  if (
    (typeof param === 'number' && !isNaN(param)) ||
    typeof param === 'boolean'
  ) {
    return String(param)
  } else {
    return ''
  }
}

export function urlQueryToSearchParams(query: ParsedUrlQuery): URLSearchParams {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        searchParams.append(key, stringifyUrlQueryParam(item))
      }
    } else {
      searchParams.set(key, stringifyUrlQueryParam(value))
    }
  }
  return searchParams
}

export function assign(
  target: URLSearchParams,
  ...searchParamsList: URLSearchParams[]
): URLSearchParams {
  for (const searchParams of searchParamsList) {
    for (const key of searchParams.keys()) {
      target.delete(key)
    }

    for (const [key, value] of searchParams.entries()) {
      target.append(key, value)
    }
  }

  return target
}

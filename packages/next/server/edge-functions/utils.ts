import { formatUrl as format } from '../../shared/lib/router/utils/format-url'
import type { ParsedNextUrl } from '../../shared/lib/router/utils/parse-next-url'

export const Encoder = new TextEncoder()
export const Decoder = new TextDecoder()

export const encode = (input: string) => Encoder.encode(input)
export const decode = (input: ArrayBufferView | ArrayBuffer, stream = false) =>
  Decoder.decode(input, { stream })

export function byteLength(input?: string): number {
  return input ? Encoder.encode(input).byteLength : 0
}

export function formatUrl(url: string | ParsedNextUrl) {
  return typeof url !== 'string' ? format(url) : url
}

export function formatPathname(
  pathname: string,
  options: {
    basePath?: string
    defaultLocale?: string
    locale?: string
  }
) {
  if (!pathname.startsWith('/')) {
    return pathname
  }

  if (options.locale && options.defaultLocale !== options.locale) {
    pathname = `/${options.locale}${pathname}`
  }

  if (options.basePath && !pathname.startsWith(options.basePath)) {
    pathname = `${options.basePath}${pathname}`
  }

  return pathname
}

export function appendSearch(
  search: string,
  query: { [key: string]: string | string[] }
) {
  const urlParams = new URLSearchParams(search)
  for (const [key, value] of Object.entries(query)) {
    const [first, ...rest] = Array.isArray(value) ? value : [value]
    urlParams.set(key, first)
    for (const item of rest) {
      urlParams.append(key, item)
    }
  }
  return urlParams.toString()
}

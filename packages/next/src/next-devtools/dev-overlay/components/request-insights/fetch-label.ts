export type FetchOriginKind = 'same-origin' | 'external' | 'unknown'

export type FetchUrlPresentation = {
  fullUrl: string
  path: string
  originKind: FetchOriginKind
  originLabel: string
}

const DEFAULT_PATH_LENGTH = 48
const DEFAULT_ORIGIN_LENGTH = 36

export function getFetchUrlPresentation(
  url: string | undefined,
  currentOrigin: string | undefined,
  pathLength = DEFAULT_PATH_LENGTH,
  originLength = DEFAULT_ORIGIN_LENGTH
): FetchUrlPresentation {
  if (!url) {
    return {
      fullUrl: 'Unknown URL',
      path: 'Unknown URL',
      originKind: 'unknown',
      originLabel: 'Origin unavailable',
    }
  }

  const baseUrl = parseHttpUrl(currentOrigin)

  try {
    const parsedUrl = baseUrl ? new URL(url, baseUrl) : new URL(url)
    if (!isHttpUrl(parsedUrl)) {
      return {
        fullUrl: url,
        path: truncateMiddle(url, pathLength),
        originKind: 'unknown',
        originLabel: 'Origin unavailable',
      }
    }

    const sameOrigin = baseUrl?.origin === parsedUrl.origin
    const originKind = baseUrl
      ? sameOrigin
        ? 'same-origin'
        : 'external'
      : 'unknown'
    const compactOrigin =
      baseUrl?.protocol === parsedUrl.protocol
        ? parsedUrl.host
        : parsedUrl.origin

    return {
      fullUrl: parsedUrl.href,
      path: truncateMiddle(
        `${parsedUrl.pathname}${parsedUrl.search}`,
        pathLength
      ),
      originKind,
      originLabel:
        originKind === 'same-origin'
          ? 'Same origin'
          : originKind === 'external'
            ? `External origin · ${truncateMiddle(compactOrigin, originLength)}`
            : truncateMiddle(parsedUrl.origin, originLength),
    }
  } catch {
    return {
      fullUrl: url,
      path: truncateMiddle(url, pathLength),
      originKind: 'unknown',
      originLabel: 'Origin unavailable',
    }
  }
}

export function truncateMiddle(value: string, maxLength: number): string {
  if (maxLength <= 0) {
    return ''
  }
  const characters = Array.from(value)
  if (characters.length <= maxLength) {
    return value
  }
  if (maxLength === 1) {
    return '…'
  }

  const availableLength = maxLength - 1
  const prefixLength = Math.floor(availableLength / 2)
  const suffixLength = availableLength - prefixLength
  return `${characters.slice(0, prefixLength).join('')}…${characters
    .slice(-suffixLength)
    .join('')}`
}

function parseHttpUrl(value: string | undefined): URL | undefined {
  if (!value) {
    return undefined
  }

  try {
    const url = new URL(value)
    return isHttpUrl(url) ? url : undefined
  } catch {
    return undefined
  }
}

function isHttpUrl(url: URL): boolean {
  return url.protocol === 'http:' || url.protocol === 'https:'
}

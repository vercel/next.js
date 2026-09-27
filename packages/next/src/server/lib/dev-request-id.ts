import {
  NEXT_HTML_REQUEST_ID_HEADER,
  NEXT_REQUEST_ID_HEADER,
} from '../../client/components/app-router-headers'

type HeaderValue = string | string[] | undefined

const REQUEST_ID_PATTERN = /^[0-9a-f]{1,8}$/
const HTML_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export function getValidatedDevRequestId(
  value: HeaderValue
): string | undefined {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value)
    ? value
    : undefined
}

export function getValidatedDevHtmlRequestId(
  value: HeaderValue
): string | undefined {
  return typeof value === 'string' && HTML_REQUEST_ID_PATTERN.test(value)
    ? value
    : undefined
}

export function filterInvalidDevRequestIdHeaders(
  headers: Record<string, HeaderValue>
): void {
  if (
    headers[NEXT_REQUEST_ID_HEADER] !== undefined &&
    getValidatedDevRequestId(headers[NEXT_REQUEST_ID_HEADER]) === undefined
  ) {
    delete headers[NEXT_REQUEST_ID_HEADER]
  }

  if (
    headers[NEXT_HTML_REQUEST_ID_HEADER] !== undefined &&
    getValidatedDevHtmlRequestId(headers[NEXT_HTML_REQUEST_ID_HEADER]) ===
      undefined
  ) {
    delete headers[NEXT_HTML_REQUEST_ID_HEADER]
  }
}

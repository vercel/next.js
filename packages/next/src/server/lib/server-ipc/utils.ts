export const forbiddenHeaders = [
  'accept-encoding',
  'content-length',
  'keepalive',
  'content-encoding',
  'transfer-encoding',
  // https://github.com/nodejs/undici/issues/1470
  'connection',
]

export const filterReqHeaders = (
  headers: Record<string, undefined | string | string[]>
) => {
  for (const [key, value] of Object.entries(headers)) {
    if (
      forbiddenHeaders.includes(key) ||
      !(Array.isArray(value) || typeof value === 'string')
    ) {
      delete headers[key]
    }
  }
  return headers
}

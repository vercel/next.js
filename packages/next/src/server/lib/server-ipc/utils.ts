export const ipcForbiddenHeaders = [
  'accept-encoding',
  'keepalive',
  'keep-alive',
  'content-encoding',
  'transfer-encoding',
  // https://github.com/nodejs/undici/issues/1470
  'connection',
]

export const actionsForbiddenHeaders = [
  ...ipcForbiddenHeaders,
  'content-length',
]

export const filterReqHeaders = (
  headers: Record<string, undefined | string | number | string[]>,
  forbiddenHeaders: string[]
) => {
  for (const [key, value] of Object.entries(headers)) {
    if (
      forbiddenHeaders.includes(key) ||
      !(Array.isArray(value) || typeof value === 'string')
    ) {
      delete headers[key]
    }
  }
  return headers as Record<string, undefined | string | string[]>
}

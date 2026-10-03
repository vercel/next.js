import { isInternalHeader } from './internal-headers'

export { isInternalHeader } from './internal-headers'

export const ipcForbiddenHeaders = [
  'accept-encoding',
  'keepalive',
  'keep-alive',
  'content-encoding',
  'transfer-encoding',
  // https://github.com/nodejs/undici/issues/1470
  'connection',
  // marked as unsupported by undici: https://github.com/nodejs/undici/blob/c83b084879fa0bb8e0469d31ec61428ac68160d5/lib/core/request.js#L354
  'expect',
]

export const actionsForbiddenHeaders = [
  ...ipcForbiddenHeaders,
  'content-length',
  'set-cookie',
]

export const filterReqHeaders = (
  headers: Record<string, undefined | string | number | string[]>,
  forbiddenHeaders: string[]
) => {
  // Some browsers are not matching spec and sending Content-Length: 0. This causes issues in undici
  // https://github.com/nodejs/undici/issues/2046
  if (headers['content-length'] && headers['content-length'] === '0') {
    delete headers['content-length']
  }

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

export const filterInternalHeaders = (
  headers: Record<string, undefined | string | string[]>
) => {
  for (const header in headers) {
    if (isInternalHeader(header)) {
      delete headers[header]
    }
  }
}

export const filterInternalRawHeaders = (headers: string[]) => {
  let writeIndex = 0

  for (let readIndex = 0; readIndex < headers.length; readIndex += 2) {
    const name = headers[readIndex]
    if (name && isInternalHeader(name)) continue

    headers[writeIndex++] = name
    if (readIndex + 1 < headers.length) {
      headers[writeIndex++] = headers[readIndex + 1]
    }
  }

  headers.length = writeIndex
}

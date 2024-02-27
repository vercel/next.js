import { decorateServerError } from '../../../shared/lib/error-source'
import { PageNotFoundError } from '../../../shared/lib/utils'
import { invokeRequest } from './invoke-request'

export const deserializeErr = (serializedErr: any) => {
  if (
    !serializedErr ||
    typeof serializedErr !== 'object' ||
    !serializedErr.stack
  ) {
    return serializedErr
  }
  let ErrorType: any = Error

  if (serializedErr.name === 'PageNotFoundError') {
    ErrorType = PageNotFoundError
  }

  const err = new ErrorType(serializedErr.message)
  err.stack = serializedErr.stack
  err.name = serializedErr.name
  ;(err as any).digest = serializedErr.digest

  if (
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_RUNTIME !== 'edge'
  ) {
    decorateServerError(err, serializedErr.source || 'server')
  }
  return err
}

export async function invokeIpcMethod({
  fetchHostname = 'localhost',
  method,
  args,
  ipcPort,
  ipcKey,
}: {
  fetchHostname?: string
  method: string
  args: any[]
  ipcPort?: string
  ipcKey?: string
}): Promise<any> {
  if (ipcPort) {
    const res = await invokeRequest(
      `http://${fetchHostname}:${ipcPort}?key=${ipcKey}&method=${
        method as string
      }&args=${encodeURIComponent(JSON.stringify(args))}`,
      {
        method: 'GET',
        headers: {},
      }
    )
    const body = await res.text()

    if (body.startsWith('{') && body.endsWith('}')) {
      const parsedBody = JSON.parse(body)

      if (
        parsedBody &&
        typeof parsedBody === 'object' &&
        'err' in parsedBody &&
        'stack' in parsedBody.err
      ) {
        throw deserializeErr(parsedBody.err)
      }
      return parsedBody
    }
  }
}

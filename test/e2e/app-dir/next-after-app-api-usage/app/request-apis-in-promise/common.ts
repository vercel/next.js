import { createLogger } from '../log'
import { cookies, headers } from 'next/headers'
import { after, connection } from 'next/server'
import { io } from 'next/cache'

const apis = {
  headers,
  cookies,
  connection,
  io,
}
export const REQUEST_API_NAMES = Object.keys(apis)

export function testApiInPromisePassedToAfter(
  context: string,
  apiName: keyof typeof apis | (string & {}),
  requestId: string | undefined
) {
  if (!(apiName in apis)) {
    throw new Error(`Invalid api: ${apiName}`)
  }
  const apiFn = apis[apiName as keyof typeof apis]

  const log = createLogger(requestId, 5)
  const longRunning = async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    log(`${context} :: ${apiName} :: after delay`)

    // Check calling the api directly
    try {
      await apiFn()
      log(`${context} :: ${apiName} :: promise :: ok`)
    } catch (err) {
      log(`${context} :: ${apiName} :: promise :: error:`, err)
    }

    // Check calling the api from a nested after
    after(async () => {
      try {
        await apiFn()
        log(`${context} :: ${apiName} :: nested after :: ok`)
      } catch (err) {
        log(`${context} :: ${apiName} :: nested after :: error:`, err)
      }

      log(`${context} :: ${apiName} :: finished`)
    })
  }

  log(`${context} :: ${apiName} :: starting`)
  const promise = longRunning()
  after(promise)
}

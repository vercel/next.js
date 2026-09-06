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
  apiName: keyof typeof apis | (string & {})
) {
  if (!(apiName in apis)) {
    throw new Error(`Invalid api: ${apiName}`)
  }
  const apiFn = apis[apiName as keyof typeof apis]

  const longRunning = async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    console.log(`${context} :: ${apiName} :: after delay`)

    // Check calling the api directly
    try {
      await apiFn()
      console.log(`${context} :: ${apiName} :: promise :: ok`)
    } catch (err) {
      console.log(`${context} :: ${apiName} :: promise :: error:`, err)
    }

    // Check calling the api from a nested after
    after(async () => {
      try {
        await apiFn()
        console.log(`${context} :: ${apiName} :: nested after :: ok`)
      } catch (err) {
        console.log(`${context} :: ${apiName} :: nested after :: error:`, err)
      }

      console.log(`${context} :: ${apiName} :: finished`)
    })
  }

  console.log(`${context} :: ${apiName} :: starting`)
  const promise = longRunning()
  after(promise)
}

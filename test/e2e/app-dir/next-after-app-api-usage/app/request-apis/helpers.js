import { cookies, headers } from 'next/headers'
import { unstable_after as after, connection } from 'next/server'

export function testRequestAPIs(/** @type {string} */ route) {
  after(async () => {
    try {
      await headers()
      console.log(`[${route}] headers(): ok`)
    } catch (err) {
      console.error(err)
    }
  })

  after(async () => {
    try {
      await cookies()
      console.log(`[${route}] cookies(): ok`)
    } catch (err) {
      console.error(err)
    }
  })

  after(async () => {
    try {
      await connection()
      console.log(`[${route}] connection(): ok`)
    } catch (err) {
      console.error(err)
    }
  })
}

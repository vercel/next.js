import { cookies, headers } from 'next/headers'
import { unstable_after as after, connection } from 'next/server'

export function testRequestAPIs() {
  after(async () => {
    try {
      await headers()
      console.log('headers(): ok')
    } catch (err) {
      console.error(err)
    }
  })

  after(async () => {
    try {
      await cookies()
      console.log('cookies(): ok')
    } catch (err) {
      console.error(err)
    }
  })

  after(async () => {
    try {
      await connection()
      console.log('connection(): ok')
    } catch (err) {
      console.error(err)
    }
  })
}

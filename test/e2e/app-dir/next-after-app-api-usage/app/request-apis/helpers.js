import { cookies, headers } from 'next/headers'
import { after, connection } from 'next/server'

export function testRequestAPIs(/** @type {string} */ route) {
  after(async () => {
    try {
      await headers()
      console.log(`[${route}] headers(): ok`)
    } catch (err) {
      console.error(`[${route}] headers(): error:`, err)
    }
  })

  after(() =>
    after(async () => {
      try {
        await headers()
        console.log(`[${route}] nested headers(): ok`)
      } catch (err) {
        console.error(`[${route}] nested headers(): error:`, err)
      }
    })
  )

  after(async () => {
    try {
      await cookies()
      console.log(`[${route}] cookies(): ok`)
    } catch (err) {
      console.error(`[${route}] cookies(): error:`, err)
    }
  })

  after(() =>
    after(async () => {
      try {
        await cookies()
        console.log(`[${route}] nested cookies(): ok`)
      } catch (err) {
        console.error(`[${route}] nested cookies(): error:`, err)
      }
    })
  )

  after(async () => {
    try {
      await connection()
      console.log(`[${route}] connection(): ok`)
    } catch (err) {
      console.error(`[${route}] connection(): error:`, err)
    }
  })

  after(() =>
    after(async () => {
      try {
        await connection()
        console.log(`[${route}] nested connection(): ok`)
      } catch (err) {
        console.error(`[${route}] nested connection(): error:`, err)
      }
    })
  )
}

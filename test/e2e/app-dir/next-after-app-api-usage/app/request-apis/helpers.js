import { createLogger } from '../log'
import { cookies, headers } from 'next/headers'
import { after, connection } from 'next/server'

export function testRequestAPIs(
  /** @type {string} */ route,
  /** @type {string | undefined} */ requestId
) {
  const log = createLogger(requestId, 6)
  after(async () => {
    try {
      await headers()
      log(`[${route}] headers(): ok`)
    } catch (err) {
      log(`[${route}] headers(): error:`, err)
    }
  })

  after(() =>
    after(async () => {
      try {
        await headers()
        log(`[${route}] nested headers(): ok`)
      } catch (err) {
        log(`[${route}] nested headers(): error:`, err)
      }
    })
  )

  after(async () => {
    try {
      await cookies()
      log(`[${route}] cookies(): ok`)
    } catch (err) {
      log(`[${route}] cookies(): error:`, err)
    }
  })

  after(() =>
    after(async () => {
      try {
        await cookies()
        log(`[${route}] nested cookies(): ok`)
      } catch (err) {
        log(`[${route}] nested cookies(): error:`, err)
      }
    })
  )

  after(async () => {
    try {
      await connection()
      log(`[${route}] connection(): ok`)
    } catch (err) {
      log(`[${route}] connection(): error:`, err)
    }
  })

  after(() =>
    after(async () => {
      try {
        await connection()
        log(`[${route}] nested connection(): ok`)
      } catch (err) {
        log(`[${route}] nested connection(): error:`, err)
      }
    })
  )
}

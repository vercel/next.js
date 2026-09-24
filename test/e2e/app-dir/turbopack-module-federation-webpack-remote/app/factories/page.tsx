'use client'

import { useEffect } from 'react'

export default function Page() {
  useEffect(() => {
    async function load() {
      try {
        const factoryErrorModule = await import('factoryErrorCatalog/message')
        globalThis.__factoryErrorResult = {
          error: `resolved: ${factoryErrorModule.message}`,
          fallbackCalls: globalThis.__factoryFallbackCalls ?? 0,
        }
      } catch (error) {
        globalThis.__factoryErrorResult = {
          error: (error as Error).message,
          fallbackCalls: globalThis.__factoryFallbackCalls ?? 0,
        }
      }

      const asyncFactoryModule = await import(
        'factoryErrorCatalog/async-message'
      )
      globalThis.__factoryAsyncResult = asyncFactoryModule.message

      try {
        const fallbackOnlyModule = await import(
          'factoryErrorCatalog/fallback-only'
        )
        const primaryOnlyModule = await import(
          'factoryErrorCatalog/primary-only'
        )
        globalThis.__factoryFallbackOrderResult = {
          fallback: fallbackOnlyModule.message,
          primary: primaryOnlyModule.message,
        }
      } catch (error) {
        globalThis.__factoryFallbackOrderResult = {
          error: (error as Error).message,
        }
      }

      try {
        const collisionModule = await import(
          '__turbopack_remote_2_1_factoryFallbackCatalog/primary-only'
        )
        globalThis.__factoryPrefixCollisionResult = collisionModule.message
      } catch (error) {
        globalThis.__factoryPrefixCollisionResult = (error as Error).message
      }
    }
    void load()
  }, [])

  return <p>Remote factory tests</p>
}

declare global {
  var __factoryAsyncResult: string | undefined
  var __factoryErrorResult: { error: string; fallbackCalls: number } | undefined
  var __factoryFallbackOrderResult:
    | { fallback: string; primary: string }
    | { error: string }
    | undefined
  var __factoryPrefixCollisionResult: string | undefined
  var __factoryFallbackCalls: number | undefined
}

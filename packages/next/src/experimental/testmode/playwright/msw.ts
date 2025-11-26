import { test as base, defineConfig } from './index'
import type { NextFixture } from './next-fixture'
// eslint-disable-next-line import/no-extraneous-dependencies
import { type RequestHandler, handleRequest } from 'msw'
// eslint-disable-next-line import/no-extraneous-dependencies
import { Emitter } from 'strict-event-emitter'

// eslint-disable-next-line import/no-extraneous-dependencies
export * from 'msw'
export * from '@playwright/test'
export type { NextFixture }
export { defineConfig }

export interface MswFixture {
  use: (...handlers: RequestHandler[]) => void
}

export const test = base.extend<{
  msw: MswFixture
  mswHandlers: RequestHandler[]
}>({
  mswHandlers: [[], { option: true }],

  msw: [
    async ({ next, mswHandlers }, use) => {
      const handlers: RequestHandler[] = [...mswHandlers]
      const emitter = new Emitter()

      next.onFetch(async (request) => {
        const requestId = Math.random().toString(16).slice(2)
        let isUnhandled = false
        let isPassthrough = false
        let mockedResponse
        await handleRequest(
          request.clone(),
          requestId,
          handlers.slice(0),
          {
            onUnhandledRequest: () => {
              isUnhandled = true
            },
          },
          emitter as any,
          {
            onPassthroughResponse: () => {
              isPassthrough = true
            },
            onMockedResponse: (r) => {
              mockedResponse = r
            },
          }
        )

        if (isUnhandled) {
          return undefined
        }
        if (isPassthrough) {
          return 'continue'
        }

        if (mockedResponse) {
          return mockedResponse
        }

        return 'abort'
      })

      await use({
        use: (...newHandlers) => {
          handlers.unshift(...newHandlers)
        },
      })

      handlers.length = 0
    },
    { auto: true },
  ],
})

export default test

/* Core */
import { loadEnvConfig } from '@next/env'
import { rest } from 'msw'
import { setupServer } from 'msw/node'
import '@testing-library/jest-dom'

loadEnvConfig(__dirname, true, { info: () => null, error: console.error })

const server = setupServer(
  rest.post(
    'http://localhost:3000/api/identity-count',
    async (req, res, ctx) => {
      const { amount = 1 } = JSON.parse(await req.json())

      return await res(ctx.json({ data: amount }))
    }
  )
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
afterEach(() => server.resetHandlers())

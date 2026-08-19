import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { promises as fs } from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'

const publicationPauseFile = path.join(
  os.tmpdir(),
  `next-route-publication-${process.pid}`
)
const publicationFailFile = path.join(
  os.tmpdir(),
  `next-route-publication-fail-${process.pid}`
)
const requestPauseFile = path.join(
  os.tmpdir(),
  `next-route-request-${process.pid}`
)

function requestWithTimeout(url: string, timeoutMs = 10_000) {
  return new Promise<{ status: number; body: string }>((resolve) => {
    let response: http.IncomingMessage | undefined
    let settled = false
    const finish = (result: { status: number; body: string }) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
    }
    const request = http.get(url, (incomingResponse) => {
      response = incomingResponse
      const chunks: Buffer[] = []
      incomingResponse.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      incomingResponse.on('end', () => {
        finish({
          status: incomingResponse.statusCode ?? 0,
          body: Buffer.concat(chunks).toString(),
        })
      })
    })
    request.once('error', () => finish({ status: 0, body: '' }))
    const timeout = setTimeout(() => {
      response?.destroy()
      request.destroy()
      finish({ status: 0, body: '' })
    }, timeoutMs)
  })
}

describe('atomic-dev-route-publication', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      NEXT_TEST_DEV_ROUTE_PUBLICATION_PAUSE_FILE: publicationPauseFile,
      NEXT_TEST_DEV_ROUTE_PUBLICATION_PATH: '/conflict.txt',
      NEXT_TEST_DEV_ROUTE_PUBLICATION_FAIL_FILE: publicationFailFile,
      NEXT_TEST_DEV_ROUTE_REQUEST_PAUSE_FILE: requestPauseFile,
      NEXT_TEST_DEV_ROUTE_REQUEST_PAUSE_PATH: '/conflict.txt',
    },
  })

  it('publishes one complete route generation at a time', async () => {
    await retry(async () => {
      expect(next.cliOutput).toContain(
        '[next-test] initial dev route publication completed'
      )
    }, 15_000)
    const initialResponse = await next.fetch('/conflict.txt')
    expect(initialResponse.status).toBe(200)
    expect(await initialResponse.text()).toBe('public file\n')

    const pauseFile = publicationPauseFile
    const claimedPauseFile = `${pauseFile}.claimed`
    const outputStart = next.cliOutput.length
    await fs.mkdir(path.dirname(pauseFile), { recursive: true })
    await fs.writeFile(pauseFile, '')
    try {
      await next.patchFile(
        'app/conflict.txt/page.tsx',
        `export default function Page() { return 'page' }`
      )
      await retry(async () => {
        expect(next.cliOutput.slice(outputStart)).toContain(
          '[next-test] dev route publication paused'
        )
      }, 15_000)

      const response = await next.fetch('/conflict.txt')
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('public file\n')
    } finally {
      await Promise.all([
        fs.rm(pauseFile, { force: true }),
        fs.rm(claimedPauseFile, { force: true }),
      ])
      await retry(async () => {
        expect(next.cliOutput.slice(outputStart)).toContain(
          '[next-test] dev route publication completed: route=true'
        )
      }, 15_000)
      const removalOutputStart = next.cliOutput.length
      await next.deleteFile('app/conflict.txt/page.tsx')
      await retry(async () => {
        expect(next.cliOutput.slice(removalOutputStart)).toContain(
          '[next-test] dev route publication completed: route=false'
        )
      }, 15_000)
    }
  })

  it('keeps the previous generation when candidate publication fails', async () => {
    const claimedFailFile = `${publicationFailFile}.claimed`
    const outputStart = next.cliOutput.length
    await fs.writeFile(publicationFailFile, '')
    try {
      await next.patchFile(
        'app/rejected/route.ts',
        `export function GET() { return new Response('rejected') }`
      )
      await retry(async () => {
        expect(next.cliOutput.slice(outputStart)).toContain(
          '[next-test] dev route publication failed'
        )
      }, 15_000)

      expect((await next.fetch('/rejected')).status).toBe(404)

      await next.patchFile(
        'app/rejected/route.ts',
        `export function GET() { return new Response('recovered') }`
      )
      await retry(async () => {
        const response = await next.fetch('/rejected')
        expect(response.status).toBe(200)
        expect(await response.text()).toBe('recovered')
      }, 15_000)
    } finally {
      await Promise.all([
        fs.rm(publicationFailFile, { force: true }),
        fs.rm(claimedFailFile, { force: true }),
        next.deleteFile('app/rejected/route.ts'),
      ])
    }
  })

  it('uses one route generation for the entire request', async () => {
    const initialResponse = await next.fetch('/conflict.txt')
    expect(initialResponse.status).toBe(200)
    expect(await initialResponse.text()).toBe('public file\n')

    const claimedPauseFile = `${requestPauseFile}.claimed`
    const outputStart = next.cliOutput.length
    await fs.writeFile(requestPauseFile, '')
    const pendingRequest = requestWithTimeout(
      new URL('/conflict.txt', next.url).toString()
    )
    try {
      await retry(async () => {
        expect(next.cliOutput.slice(outputStart)).toContain(
          '[next-test] dev route request paused'
        )
      }, 15_000)

      await next.patchFile(
        'app/conflict.txt/page.tsx',
        `export default function Page() { return 'page' }`
      )
      await retry(async () => {
        expect(next.cliOutput.slice(outputStart)).toContain(
          '[next-test] dev route publication completed: route=true'
        )
      }, 15_000)
    } finally {
      await Promise.all([
        fs.rm(requestPauseFile, { force: true }),
        fs.rm(claimedPauseFile, { force: true }),
      ])
    }
    try {
      // Keep the conflicting generation current until the paused request has
      // completed. Otherwise cleanup could make a live-state implementation
      // accidentally observe the original non-conflicting state again.
      expect(await pendingRequest).toEqual({
        status: 200,
        body: 'public file\n',
      })
    } finally {
      const removalOutputStart = next.cliOutput.length
      await next.deleteFile('app/conflict.txt/page.tsx')
      await retry(async () => {
        expect(next.cliOutput.slice(removalOutputStart)).toContain(
          '[next-test] dev route publication completed: route=false'
        )
      }, 15_000)
    }
  })
})

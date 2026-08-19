import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import WebSocket from 'ws'

const scanPauseFile = path.join(
  os.tmpdir(),
  `next-route-announce-${process.pid}`
)

function drainSocket(socket: WebSocket) {
  return new Promise<void>((resolve) => {
    socket.once('pong', () => resolve())
    socket.ping()
  })
}

describe('atomic-dev-route-announcement', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    env: {
      NEXT_TEST_DEV_ROUTE_SCAN_PAUSE_FILE: scanPauseFile,
      NEXT_TEST_DEV_ROUTE_BUNDLER_COMMIT_PATH: '/added/[slug]',
    },
  })

  it('announces route changes only after they can be observed', async () => {
    const claimedPauseFile = `${scanPauseFile}.claimed`
    let socket: WebSocket | undefined
    let addedResponse: Promise<{ status: number; body: string }> | undefined
    let removedResponse: Promise<{ status: number; body: string }> | undefined
    const announcements: string[] = []
    try {
      await retry(async () => {
        expect((await next.fetch('/existing')).status).toBe(200)
      }, 15_000)
      socket = new WebSocket(`ws://localhost:${next.appPort}/_next/hmr`, {
        origin: next.url,
      })
      await new Promise<void>((resolve, reject) => {
        socket!.once('open', resolve)
        socket!.once('error', reject)
      })
      socket.on('message', (data) => {
        const message = JSON.parse(data.toString())
        if (message.type === 'addedPage' || message.type === 'removedPage') {
          announcements.push(`${message.type} ${message.data?.[0]}`)
        }
        if (message.data?.[0] !== '/added/[slug]') return
        if (message.type === 'addedPage' && !addedResponse) {
          addedResponse = next.fetch('/added/value').then(async (response) => ({
            status: response.status,
            body: await response.text(),
          }))
        }
        if (message.type === 'removedPage' && !removedResponse) {
          removedResponse = next
            .fetch('/added/value')
            .then(async (response) => ({
              status: response.status,
              body: await response.text(),
            }))
        }
      })

      await fs.writeFile(scanPauseFile, '')
      await next.patchFile(
        'app/added/[slug]/route.ts',
        `export function GET() { return new Response('added') }`
      )
      await retry(async () => {
        expect(next.cliOutput).toContain('[next-test] dev route scan 1 paused')
      }, 15_000)
      if (isTurbopack) {
        await retry(async () => {
          expect(next.cliOutput).toContain(
            '[next-test] dev route bundler committed: route=true'
          )
        }, 15_000)
        await drainSocket(socket)
        expect(announcements).toEqual([])
      }
      await fs.rm(claimedPauseFile)
      await retry(() => expect(addedResponse).toBeDefined(), 15_000)
      expect(await addedResponse).toEqual({ status: 200, body: 'added' })

      await fs.writeFile(scanPauseFile, '')
      const removalOutputStart = next.cliOutput.length
      await next.deleteFile('app/added/[slug]/route.ts')
      await retry(async () => {
        expect(next.cliOutput.slice(removalOutputStart)).toMatch(
          /\[next-test\] dev route scan \d+ paused/
        )
      }, 15_000)
      if (isTurbopack) {
        await retry(async () => {
          expect(next.cliOutput.slice(removalOutputStart)).toContain(
            '[next-test] dev route bundler committed: route=false'
          )
        }, 15_000)
        await drainSocket(socket)
        expect(announcements).toEqual(['addedPage /added/[slug]'])
      }
      await fs.rm(claimedPauseFile)
      await retry(() => expect(removedResponse).toBeDefined(), 15_000)
      expect((await removedResponse).status).toBe(404)
      expect(announcements).toEqual([
        'addedPage /added/[slug]',
        'removedPage /added/[slug]',
      ])
    } finally {
      await Promise.all([
        fs.rm(scanPauseFile, { force: true }),
        fs.rm(claimedPauseFile, { force: true }),
        next.deleteFile('app/added/[slug]/route.ts'),
      ])
      if (socket && socket.readyState !== WebSocket.CLOSED) {
        const closed = new Promise<void>((resolve) =>
          socket!.once('close', resolve)
        )
        socket.terminate()
        await closed
      }
    }
  })
})

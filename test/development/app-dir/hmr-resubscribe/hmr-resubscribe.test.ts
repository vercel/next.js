import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import WebSocket from 'ws'

const pageSource = (version: number) =>
  `'use client'\n\nexport default function Page() {\n  return <p>version ${version}</p>\n}\n`

describe('hmr resubscribe', () => {
  const { next, isTurbopack, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (!isTurbopack || !isNextDev) {
    it('skipped outside of Turbopack dev', () => {})
    return
  }

  // Drives the HMR websocket directly, because the subscription state that
  // governs this lives on the connection: unsubscribing and subscribing again
  // has to happen without a reconnect for the resubscribe to matter.
  it('keeps delivering updates to a chunk that was unsubscribed and subscribed again', async () => {
    const html = await next.render('/')
    // Every script the page loads is a candidate. Subscribing to all of them
    // and seeing which ones report an update identifies the chunk lists without
    // reimplementing how the browser runtime derives their paths.
    const candidates = [
      ...new Set(
        [...html.matchAll(/src="\/_next\/([^"]+\.js[^"]*)"/g)].map((match) =>
          decodeURIComponent(match[1].split('?')[0])
        )
      ),
    ]
    expect(candidates.length).toBeGreaterThan(0)

    const ws = new WebSocket(`${next.url.replace(/^http/, 'ws')}/_next/hmr`)
    let phase = 'setup'
    const updates = new Set<string>()
    ws.on('message', (raw: Buffer) => {
      let message: any
      try {
        message = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (message.type !== 'turbopack-message') return
      for (const update of message.data) {
        if (update.resource?.path) {
          updates.add(`${phase} ${update.resource.path}`)
        }
      }
    })

    try {
      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve())
        ws.once('error', reject)
      })
      const send = (type: string, path: string) =>
        ws.send(JSON.stringify({ type, path }))

      for (const candidate of candidates) send('turbopack-subscribe', candidate)

      phase = 'before'
      await next.patchFile('app/page.tsx', pageSource(1))
      let delivering: string[] = []
      await retry(async () => {
        delivering = candidates.filter((candidate) =>
          updates.has(`before ${candidate}`)
        )
        expect(delivering.length).toBeGreaterThan(0)
      })

      for (const chunk of delivering) send('turbopack-unsubscribe', chunk)
      for (const chunk of delivering) send('turbopack-subscribe', chunk)

      phase = 'after'
      await next.patchFile('app/page.tsx', pageSource(2))
      await retry(async () => {
        const stillDelivering = delivering.filter((chunk) =>
          updates.has(`after ${chunk}`)
        )
        expect(stillDelivering).toEqual(delivering)
      })
    } finally {
      ws.close()
      await next.patchFile('app/page.tsx', pageSource(0))
    }
  })
})

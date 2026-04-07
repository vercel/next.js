import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import http from 'http'

describe('mcp-server /_next/dev/events SSE', () => {
  const { next, skipped } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'hmr-cycle-app'),
    skipDeployment: true,
    env: {
      NEXT_DEV_EVENTS: '1',
    },
  })

  if (skipped) {
    return
  }

  /** Subscribe to the SSE stream. Returns collected events + a close function. */
  function subscribeEvents(): {
    events: any[]
    close: () => void
    waitForEvent: (
      predicate: (e: any) => boolean,
      timeoutMs?: number
    ) => Promise<any>
  } {
    const events: any[] = []
    let waitResolve: ((e: any) => void) | null = null
    let waitPredicate: ((e: any) => boolean) | null = null

    const url = new URL('/_next/dev/events', next.url)
    const req = http.get(url, (res) => {
      let buffer = ''
      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
        // Parse SSE messages
        const parts = buffer.split('\n\n')
        buffer = parts.pop()! // keep incomplete last part
        for (const part of parts) {
          const match = part.match(/^data: (.+)$/m)
          if (match) {
            const event = JSON.parse(match[1])
            events.push(event)
            if (waitResolve && waitPredicate && waitPredicate(event)) {
              waitResolve(event)
              waitResolve = null
              waitPredicate = null
            }
          }
        }
      })
    })

    return {
      events,
      close: () => req.destroy(),
      waitForEvent: (predicate, timeoutMs = 30000) =>
        new Promise((resolve, reject) => {
          // Check already-received events
          const found = events.find(predicate)
          if (found) return resolve(found)

          waitPredicate = predicate
          waitResolve = resolve
          setTimeout(() => {
            waitResolve = null
            reject(new Error('Timeout waiting for SSE event'))
          }, timeoutMs)
        }),
    }
  }

  function log(line: string) {
    console.log(line)
  }

  function logEvent(label: string, snippet: string, event: any) {
    const c = event.compilation
    log(`── ${label} ${'─'.repeat(Math.max(0, 52 - label.length))}`)
    log(`   write    app/page.tsx`)
    log(`            ${snippet}`)
    const tag = c.status === 'ok' ? 'ok' : 'FAIL'
    log(`   compile  ${tag}  ${c.duration_ms}ms  v${c.version}`)
    if (c.changed_pages?.length > 0) {
      log(`   changed  ${c.changed_pages.join(', ')}`)
    }
    if (c.errors.length > 0) {
      for (const e of c.errors.slice(0, 2)) {
        log(`   error    ${e.message.split('\n')[0].slice(0, 60)}`)
      }
    }
    log('')
  }

  it('build error → fix → recovery', async () => {
    // Warm up
    await retry(async () => {
      const res = await next.fetch('/')
      expect(res.status).toBe(200)
    })
    await new Promise((r) => setTimeout(r, 1000))

    const sub = subscribeEvents()
    // Wait for connected event
    await sub.waitForEvent((e) => e.type === 'connected')

    log('')
    log('=== Build Error Recovery (SSE) ===')
    log('')

    // v1: working
    await next.patchFile(
      'app/page.tsx',
      `export default function Page() {\n  return <h1>working</h1>\n}`
    )
    const e1 = await sub.waitForEvent(
      (e) => e.type === 'hmr' && e.compilation.status === 'ok'
    )
    logEvent('v1 working', '<h1>working</h1>', e1)
    expect(e1.compilation.status).toBe('ok')

    // v2: break it
    await next.patchFile(
      'app/page.tsx',
      `import { x } from 'pkg-not-found'\nexport default function Page() {\n  return <h1>{x}</h1>\n}`
    )
    const e2 = await sub.waitForEvent(
      (e) =>
        e.type === 'hmr' && e.compilation.version !== e1.compilation.version
    )
    logEvent('v2 break (missing import)', "import from 'pkg-not-found'", e2)
    expect(e2.compilation.status).toBe('compile_error')
    expect(e2.compilation.errors.length).toBeGreaterThan(0)

    // v3: fix
    await next.patchFile(
      'app/page.tsx',
      `export default function Page() {\n  return <h1>fixed</h1>\n}`
    )
    const e3 = await sub.waitForEvent(
      (e) =>
        e.type === 'hmr' &&
        e.compilation.version !== e2.compilation.version &&
        e.compilation.status === 'ok'
    )
    logEvent('v3 fix', '<h1>fixed</h1>', e3)
    expect(e3.compilation.status).toBe('ok')

    sub.close()
  })

  it('runtime error → fix → recovery', async () => {
    await retry(async () => {
      const res = await next.fetch('/')
      expect(res.status).toBe(200)
    })

    const sub = subscribeEvents()
    await sub.waitForEvent((e) => e.type === 'connected')

    log('')
    log('=== Runtime Error Recovery (SSE) ===')
    log('')

    // v1: working
    await next.patchFile(
      'app/page.tsx',
      `export default function Page() {\n  return <h1>working</h1>\n}`
    )
    const e1 = await sub.waitForEvent((e) => e.type === 'hmr')
    logEvent('v1 working', '<h1>working</h1>', e1)

    // v2: runtime throw
    await next.patchFile(
      'app/page.tsx',
      `export default function Page() {\n  throw new Error('boom')\n}`
    )
    const e2 = await sub.waitForEvent(
      (e) =>
        e.type === 'hmr' && e.compilation.version !== e1.compilation.version
    )
    logEvent('v2 break (throw in render)', "throw new Error('boom')", e2)
    // Compiles fine — it's valid JS
    expect(e2.compilation.status).toBe('ok')
    // But verify the page returns 500
    const pageRes = await next.fetch('/')
    expect(pageRes.status).toBe(500)
    log(`   page     FAIL 500`)
    log('')

    // v3: fix
    await next.patchFile(
      'app/page.tsx',
      `export default function Page() {\n  return <h1>fixed</h1>\n}`
    )
    const e3 = await sub.waitForEvent(
      (e) =>
        e.type === 'hmr' && e.compilation.version !== e2.compilation.version
    )
    logEvent('v3 fix', '<h1>fixed</h1>', e3)
    const fixedRes = await next.fetch('/')
    expect(fixedRes.status).toBe(200)
    log(`   page     200`)
    log('')

    sub.close()
  })
})

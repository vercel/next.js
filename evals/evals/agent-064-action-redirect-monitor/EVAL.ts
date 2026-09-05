/**
 * Server Action redirect contract post-#96310 (2026-07-28, ccfe67aa8d)
 *
 * A redirect() thrown from a Server Action invoked as a fetch action
 * (Next-Action header, i.e. every hydrated/JS submission) responds
 * HTTP 200: the target rides in the `x-action-redirect: <url>;<push|replace>`
 * response header and the destination's RSC payload is streamed in the body,
 * saving the client a roundtrip. Only the progressive-enhancement (no-JS)
 * multipart form post — the one carrying the hidden $ACTION_ID_* field and
 * no Next-Action header — still answers 303 + Location. (URL-encoded action
 * posts are not decoded at all; server-action forms render with
 * encType="multipart/form-data".)
 *
 * A 2025-trained agent believes ALL action redirects are 303, so instead of
 * teaching the monitor the 200 + x-action-redirect contract it rewrites the
 * app (route handler POST, client-side push after returning a URL), weakens
 * the monitor (skips the JS-style check or accepts any 200 without verifying
 * redirect intent), or declares the framework broken.
 */

import { test, expect, beforeAll, afterAll } from 'vitest'
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { rmSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'

const PORT = 4064
const base = `http://localhost:${PORT}`
let server: ChildProcess | undefined

function cleanEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    PORT: String(PORT),
  }
  // vitest sets NODE_ENV=test, which breaks next build/start
  delete env.NODE_ENV
  return env as unknown as NodeJS.ProcessEnv
}

beforeAll(async () => {
  // Fail fast if something already answers on the port (e.g. a server leaked
  // by an earlier run) — otherwise we would silently test stale code.
  let portTaken = false
  try {
    const res = await fetch(base)
    await res.arrayBuffer().catch(() => {})
    portTaken = true
  } catch {
    // connection refused — the port is free
  }
  if (portTaken) {
    throw new Error(`something is already listening on ${base}`)
  }

  rmSync('.next', { recursive: true, force: true })
  execSync('node node_modules/next/dist/bin/next build', {
    stdio: 'pipe',
    env: cleanEnv(),
    timeout: 600_000,
  })
  // Spawn next directly (not through npx, which would orphan the real
  // server on kill) as a process-group leader so afterAll can kill the tree.
  server = spawn(
    'node',
    ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)],
    {
      env: cleanEnv(),
      stdio: 'pipe',
      detached: true,
    }
  )
  const deadline = Date.now() + 60_000
  while (true) {
    try {
      const res = await fetch(`${base}/apply`)
      if (res.ok) {
        await res.arrayBuffer()
        break
      }
    } catch {}
    if (Date.now() > deadline) {
      throw new Error('next start did not become ready on ' + base)
    }
    await new Promise((r) => setTimeout(r, 300))
  }
}, 800_000)

afterAll(() => {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGKILL')
    } catch {
      server.kill('SIGKILL')
    }
  }
})

async function findActionId(): Promise<string> {
  const res = await fetch(`${base}/apply`)
  const html = await res.text()
  const m = html.match(/name="\$ACTION_ID_([0-9a-f]+)"/)
  if (!m) throw new Error('no $ACTION_ID_* field found in /apply HTML')
  return m[1]
}

test('the monitor passes against the real app', () => {
  execSync(`node scripts/check-redirects.mjs ${base}`, {
    stdio: 'pipe',
    env: cleanEnv(),
    timeout: 120_000,
  })
}, 150_000)

test('JS-style submission still redirects server-side (200 + x-action-redirect)', async () => {
  const actionId = await findActionId()
  // encodeReply wire format: prefixed form fields precede the "0" root
  // field that references them ($K1 -> fields prefixed "_1_").
  const form = new FormData()
  form.append('_1_name', 'Eval Probe')
  form.append('0', '["$K1"]')
  const res = await fetch(`${base}/apply`, {
    method: 'POST',
    headers: { 'next-action': actionId },
    body: form,
    redirect: 'manual',
  })
  expect(res.status).toBe(200)
  const header = res.headers.get('x-action-redirect')
  expect(header).toBeTruthy()
  // Format: "<url>;<push|replace>", e.g. "/done;push"
  const target = new URL(header!.split(';')[0], base)
  expect(target.pathname).toBe('/done')
  await res.arrayBuffer()
}, 60_000)

test('no-JS form post still gets 303 + Location: /done', async () => {
  const actionId = await findActionId()
  const form = new FormData()
  form.append(`$ACTION_ID_${actionId}`, '')
  form.append('name', 'Eval Probe')
  const res = await fetch(`${base}/apply`, {
    method: 'POST',
    body: form,
    redirect: 'manual',
  })
  expect(res.status).toBe(303)
  const location = res.headers.get('location')
  expect(location).toBeTruthy()
  expect(new URL(location!, base).pathname).toBe('/done')
  await res.arrayBuffer()
}, 60_000)

test('the confirmation page is reachable', async () => {
  const res = await fetch(`${base}/done`)
  expect(res.status).toBe(200)
  await res.arrayBuffer()
}, 60_000)

function sourceFiles(dir: string): string[] {
  const root = join(process.cwd(), dir)
  if (!existsSync(root)) return []
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath ?? (d as any).path, d.name))
    .filter((p) => !p.includes('node_modules') && !p.includes('.next'))
}

test('the action still redirects via next/navigation', () => {
  const files = [...sourceFiles('app'), ...sourceFiles('lib')].filter((p) =>
    /\.(ts|tsx|js|jsx|mjs)$/.test(p)
  )
  const hasServerRedirect = files.some((p) => {
    const src = readFileSync(p, 'utf-8')
    return (
      /\bredirect\s*\(/.test(src) && /from\s+['"]next\/navigation['"]/.test(src)
    )
  })
  expect(hasServerRedirect).toBe(true)
})

test('no route handlers were added for the submission', () => {
  const routeFiles = sourceFiles('app').filter((p) =>
    /(^|\/)route\.(ts|tsx|js|jsx|mjs)$/.test(p)
  )
  expect(routeFiles).toEqual([])
})

test('the monitor knows the action redirect header', () => {
  // On a fetch-invoked action, the header is the only place the server
  // announces the redirect (the status is 200), so an accurate monitor has
  // to reference it. No particular status-code check shape is required.
  const monitor = readFileSync(
    join(process.cwd(), 'scripts', 'check-redirects.mjs'),
    'utf-8'
  )
  expect(monitor).toMatch(/x-action-redirect/i)
})

// The control servers run on this process's event loop, so the monitor must
// be spawned asynchronously (a blocking spawnSync would deadlock them).
function runMonitor(url: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['scripts/check-redirects.mjs', url], {
      stdio: 'ignore',
      timeout: 60_000,
    })
    child.once('error', reject)
    child.once('close', (code) => resolve(code))
  })
}

function listen(srv: Server, port: number) {
  return new Promise<void>((resolve, reject) => {
    srv.once('error', reject)
    srv.listen(port, () => resolve())
  })
}

test('the monitor still fails against a server that never redirects', async () => {
  // Control 1: bare 200s with empty bodies and no headers for everything.
  // A monitor that stopped verifying anything would exit 0 here.
  const control = createServer((req, res) => {
    req.resume()
    res.writeHead(200)
    res.end()
  })
  await listen(control, 4164)
  try {
    const code = await runMonitor('http://localhost:4164')
    expect(code).not.toBe(0)
  } finally {
    control.close()
  }
}, 120_000)

test('the monitor still fails when the JS-style response has no redirect signal', async () => {
  // Control 2: looks exactly like the real app (form HTML with an action
  // id, 303 + Location for the no-JS post, 200 on /done) except the
  // JS-style response is a 200 with no redirect indication of any kind — a
  // genuinely broken deploy. A monitor that "fixed" the JS check by
  // accepting any 200 would exit 0 here.
  const fakeId = 'f0'.repeat(21)
  const control = createServer((req, res) => {
    req.resume()
    const path = (req.url ?? '/').split('?')[0]
    if (req.method === 'POST' && path === '/apply') {
      if (req.headers['next-action']) {
        res.writeHead(200, { 'content-type': 'text/x-component' })
        res.end('0:{}\n')
      } else {
        res.writeHead(303, { location: '/done' })
        res.end()
      }
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(
      `<!DOCTYPE html><html><body><form action="" encType="multipart/form-data" method="POST">` +
        `<input type="hidden" name="$ACTION_ID_${fakeId}"/>` +
        `<input type="text" name="name"/><button>Submit</button></form></body></html>`
    )
  })
  await listen(control, 4165)
  try {
    const code = await runMonitor('http://localhost:4165')
    expect(code).not.toBe(0)
  } finally {
    control.close()
  }
}, 120_000)

import childProcess from 'child_process'
import { EventEmitter } from 'events'
import { promises as fs } from 'fs'
import http from 'http'
import type { AddressInfo } from 'net'
import { PassThrough } from 'stream'
import {
  NativeRouteManager,
  observeNativeRouteWorkers,
  type NativeRouteWorkerEvent,
} from 'next/dist/server/lib/native-route.external'

// What NativeRouteManager tells Switchyard about its route.go workers. Each
// worker is a stub child process that reports the port of a local HTTP
// server, so requests really reach "the worker".
describe('native route worker events', () => {
  let workerServer: http.Server
  let workerPort: number
  let frontServer: http.Server
  let frontPort: number
  let manager: NativeRouteManager
  let children: Array<EventEmitter & { exitCode: number | null }>
  let tokens: string[]
  /** Delays a worker's readiness until the returned function is called. */
  let holdReadiness: (() => void) | undefined

  beforeEach(async () => {
    children = []
    tokens = []
    holdReadiness = undefined
    workerServer = http.createServer((_, res) => res.end('go'))
    await new Promise<void>((resolve) =>
      workerServer.listen(0, '127.0.0.1', resolve)
    )
    workerPort = (workerServer.address() as AddressInfo).port
    jest.spyOn(childProcess, 'spawn').mockImplementation((_, __, options) => {
      const token = options!.env!.__NEXT_GO_TOKEN!
      tokens.push(token)
      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stdin: new PassThrough(),
        exitCode: null as number | null,
        kill: jest.fn(),
      })
      children.push(child)
      const ready = () =>
        child.stdout.write(`\x1eNEXT_GO_READY:${token}:${workerPort}\n`)
      if (holdReadiness === undefined) setImmediate(ready)
      else holdReadiness = ready
      return child as unknown as childProcess.ChildProcess
    })
    // Each entry names its own executable, so each gets its own worker.
    jest.spyOn(fs, 'readFile').mockImplementation(async (file) =>
      JSON.stringify({
        executable: String(file).endsWith('b.native.json') ? 'b' : 'a',
        goos: process.platform === 'win32' ? 'windows' : process.platform,
        goarch:
          process.arch === 'x64'
            ? 'amd64'
            : process.arch === 'ia32'
              ? '386'
              : process.arch,
      })
    )
    manager = new NativeRouteManager(__dirname, false)
    frontServer = http.createServer((req, res) => {
      const page = req.url!.slice(1)
      manager
        .invoke(`/${page}`, `${page}.native.json`, req, res, req.url!)
        .catch((error: Error) => {
          res.statusCode = 500
          res.end(error.message)
        })
    })
    await new Promise<void>((resolve) =>
      frontServer.listen(0, '127.0.0.1', resolve)
    )
    frontPort = (frontServer.address() as AddressInfo).port
  })

  afterEach(async () => {
    // The observer is module-level: clear it so no test depends on order.
    observeNativeRouteWorkers(undefined)
    for (const child of children) exit(child)
    await manager.close()
    await new Promise((resolve) => frontServer.close(resolve))
    await new Promise((resolve) => workerServer.close(resolve))
    jest.restoreAllMocks()
  })

  function exit(child: EventEmitter & { exitCode: number | null }) {
    if (child.exitCode !== null) return
    child.exitCode = 0
    child.emit('exit', 0)
  }

  async function get(page: string) {
    const res = await fetch(`http://127.0.0.1:${frontPort}/${page}`)
    return { status: res.status, body: await res.text() }
  }

  function observe() {
    const events: NativeRouteWorkerEvent[] = []
    observeNativeRouteWorkers((event) => events.push(event))
    return events
  }

  const address = () => `127.0.0.1:${workerPort}`

  const announced = (page: string, token: string) => ({
    event: 'worker',
    page,
    address: address(),
    tokenHeader: 'x-next-internal-go-token',
    token,
  })

  it('announces a worker that started before the observer at its next request', async () => {
    expect(await get('a')).toEqual({ status: 200, body: 'go' })
    const events = observe()
    expect(events).toEqual([])
    await get('a')
    expect(events).toEqual([announced('/a', tokens[0])])
  })

  it('announces each page once per worker', async () => {
    const events = observe()
    await get('a')
    await get('a')
    await get('b')
    expect(events.map((event) => event.event)).toEqual(['worker', 'worker'])
    expect(
      events.map((event) => event.event === 'worker' && event.page)
    ).toEqual(['/a', '/b'])
    expect(tokens).toHaveLength(2)
  })

  it('reports a worker gone once, with its token, when it exits', async () => {
    const events = observe()
    await get('a')
    exit(children[0])
    // exit() returns early once exitCode is set; emit again to check gone is
    // still reported once.
    children[0].emit('exit', 0)
    expect(events).toEqual([
      announced('/a', tokens[0]),
      { event: 'gone', address: address(), token: tokens[0] },
    ])
  })

  it('reports a retired worker gone once, though it also exits', async () => {
    const events = observe()
    await get('a')
    // The page left the build: its worker is retired, then exits.
    manager.reconcile(new Set())
    await new Promise((resolve) => setImmediate(resolve))
    exit(children[0])
    expect(events).toEqual([
      announced('/a', tokens[0]),
      { event: 'gone', address: address(), token: tokens[0] },
    ])
  })

  it('reports nothing for a worker retired while it starts', async () => {
    const events = observe()
    holdReadiness = () => {}
    const request = get('a')
    while (children.length === 0) {
      await new Promise((resolve) => setImmediate(resolve))
    }
    const closing = manager.close()
    holdReadiness()
    expect((await request).status).toBe(500)
    exit(children[0])
    await closing
    expect(events).toEqual([])
  })
})

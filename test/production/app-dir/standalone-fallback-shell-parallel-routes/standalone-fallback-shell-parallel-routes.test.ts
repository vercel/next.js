import fs from 'node:fs/promises'
import type { ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
  withInvocationId,
} from 'next-test-utils'

describe('standalone fallback shells with parallel routes', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures/default'),
    skipDeployment: true,
    skipStart: true,
  })

  let server: ChildProcess
  let appPort: number

  beforeAll(async () => {
    process.env.NOW_BUILDER = '1'
    process.env.NEXT_PRIVATE_TEST_HEADERS = '1'

    const { exitCode } = await next.build()
    if (exitCode !== 0) {
      throw new Error(`next build failed with exit code ${exitCode}`)
    }

    const serverFilePath = join(next.testDir, '.next/standalone/server.js')
    await fs.writeFile(
      serverFilePath,
      (await fs.readFile(serverFilePath, 'utf8')).replace(
        'port:',
        'minimalMode: true, port:'
      )
    )

    appPort = await findPort()
    server = await initNextServerScript(
      serverFilePath,
      /- Local:/,
      {
        ...process.env,
        ...next.env,
        __NEXT_TEST_MODE: 'e2e',
        PORT: `${appPort}`,
      },
      undefined,
      { cwd: next.testDir }
    )
  })

  afterAll(async () => {
    delete process.env.NOW_BUILDER
    delete process.env.NEXT_PRIVATE_TEST_HEADERS
    if (server) await killApp(server)
  })

  async function fetchGenericFallbackShell(
    pathname: string,
    matchedPath: string
  ) {
    // These private headers model the request a platform adapter sends when it
    // asks a standalone server for the generic shell of a dynamic route.
    return fetchViaHTTP(
      appPort,
      pathname,
      undefined,
      withInvocationId({
        headers: {
          'x-matched-path': matchedPath,
          'x-now-route-matches': '',
        },
      })
    )
  }

  it('renders ordinary concrete params normally', async () => {
    const response = await fetchViaHTTP(appPort, '/postpone/isr/concrete')

    expect(response.status).toBe(200)
    expect(response.headers.get('x-nextjs-postponed')).toBeNull()

    const $ = cheerio.load(await response.text())
    expect($('#page').text()).toBe('/postpone/isr/[slug]')
    expect($('#params').text()).toBe('{"slug":"concrete"}')
    expect($('#slot-page').text()).toBe('/@slot/[...catchAll]')
    expect($('#slot-params').text()).toBe(
      '{"catchAll":["postpone","isr","concrete"]}'
    )
  })

  it('keeps all unknown sibling params suspended in a generic fallback shell', async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetchGenericFallbackShell(
        '/postpone/isr/[slug]',
        '/postpone/isr/[slug]'
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('x-nextjs-postponed')).toBe('1')

      const html = await response.text()
      expect(html).not.toContain('</html>')
      expect(html).not.toContain('%%drp:')

      const $ = cheerio.load(html)
      expect({
        page: $('#page').text(),
        params: $('#params').text(),
        slotPage: $('#slot-page').text(),
        slotParams: $('#slot-params').text(),
      }).toEqual({
        page: '',
        params: '',
        slotPage: '',
        slotParams: '',
      })
      expect($('#loading').text()).toBe('/postpone/isr/[slug]')
      expect($('#slot-loading').text()).toBe('/[...catchAll]')
    }
  })

  it('keeps all unknown nested params suspended in a generic fallback shell', async () => {
    const response = await fetchGenericFallbackShell(
      '/nested/[group]/items/[item]',
      '/nested/[group]/items/[item]'
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-nextjs-postponed')).toBe('1')

    const $ = cheerio.load(await response.text())
    expect({
      page: $('#nested-page').text(),
      params: $('#nested-params').text(),
      slotPage: $('#nested-slot-page').text(),
      slotParams: $('#nested-slot-params').text(),
    }).toEqual({
      page: '',
      params: '',
      slotPage: '',
      slotParams: '',
    })
    expect($('#nested-loading').text()).toBe('/nested/[group]/items/[item]')
    expect($('#nested-slot-loading').text()).toBe(
      '/@slot/nested/[group]/[...catchAll]'
    )
  })

  it('renders ordinary nested concrete params normally', async () => {
    const response = await fetchViaHTTP(appPort, '/nested/team/items/widget')

    expect(response.status).toBe(200)
    expect(response.headers.get('x-nextjs-postponed')).toBeNull()

    const $ = cheerio.load(await response.text())
    expect($('#nested-page').text()).toBe('/nested/[group]/items/[item]')
    expect($('#nested-params').text()).toBe('{"group":"team","item":"widget"}')
    expect($('#nested-slot-page').text()).toBe(
      '/@slot/nested/[group]/[...catchAll]'
    )
    expect($('#nested-slot-params').text()).toBe(
      '{"group":"team","catchAll":["items","widget"]}'
    )
  })
})

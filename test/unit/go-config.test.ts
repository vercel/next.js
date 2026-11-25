import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { IncomingMessage } from 'http'
import { Socket } from 'net'
import { readGoProxyConfig } from 'next/dist/build/analysis/go-config'
import { getGoProxyMatcher } from 'next/dist/server/lib/native-proxy-matcher'
import { NodeNextRequest } from 'next/dist/server/base-http/node'
import { getMiddlewareRouteMatcher } from 'next/dist/shared/lib/router/utils/middleware-route-matcher'

describe('go-config', () => {
  let directory: string
  let descriptor: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'go-proxy-config-'))
    descriptor = join(directory, 'middleware.native.json')
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  async function readConfig(
    matcher?: unknown,
    nextConfig: Parameters<typeof readGoProxyConfig>[2] = {}
  ) {
    await writeFile(descriptor, JSON.stringify({ config: { matcher } }))
    return readGoProxyConfig(descriptor, 'proxy.go', nextConfig)
  }

  it('matches every path when Config omits Matcher', async () => {
    const { matchers } = await readConfig()
    expect(matchers).toHaveLength(1)
    expect(matchers[0].originalSource).toBe('/:path*')
    const regex = new RegExp(matchers[0].regexp)
    for (const path of ['/', '/dashboard', '/dashboard/settings']) {
      expect(regex.test(path)).toBe(true)
    }
  })

  it('preserves an explicitly empty matcher list', async () => {
    await expect(readConfig([])).resolves.toEqual({ matchers: [] })
  })

  it.each([
    {
      source: '/',
      matches: [
        '/',
        '/index',
        '/index.json',
        '/index.rsc',
        '/index.segments/$c$children/__PAGE__.segment.rsc',
        '/_next/data/build-id/index.json',
      ],
      misses: ['/dashboard', '/dashboard.rsc'],
    },
    {
      source: '/dashboard',
      matches: [
        '/dashboard',
        '/dashboard.json',
        '/dashboard.rsc',
        '/dashboard.segments/$c$children/__PAGE__.segment.rsc',
        '/_next/data/build-id/dashboard.json',
      ],
      misses: ['/settings', '/dashboard/settings'],
    },
    {
      source: '/dashboard/:path*',
      matches: [
        '/dashboard',
        '/dashboard/settings',
        '/dashboard/settings.rsc',
        '/dashboard/settings.segments/$c$children/__PAGE__.segment.rsc',
      ],
      misses: ['/', '/marketing/settings.rsc'],
    },
  ])('matches page and transport paths for $source', async (testCase) => {
    const { matchers } = await readConfig(testCase.source)
    expect(matchers[0].originalSource).toBe(testCase.source)
    const regex = new RegExp(matchers[0].regexp)
    for (const path of testCase.matches) {
      expect(regex.test(path)).toBe(true)
    }
    for (const path of testCase.misses) {
      expect(regex.test(path)).toBe(false)
    }
  })

  it('applies basePath to string and object matchers, including transport paths', async () => {
    const { matchers } = await readConfig(['/', { source: '/dashboard' }], {
      basePath: '/docs',
    })
    const matches = (path: string) =>
      matchers.some((matcher) => new RegExp(matcher.regexp).test(path))
    for (const path of [
      '/docs',
      '/docs/',
      '/docs/index.rsc',
      '/docs/dashboard',
      '/docs/dashboard.segments/__PAGE__.segment.rsc',
      '/docs/_next/data/build-id/dashboard.json',
    ]) {
      expect(matches(path)).toBe(true)
    }
    for (const path of ['/', '/dashboard', '/docs/settings']) {
      expect(matches(path)).toBe(false)
    }
  })

  it('preserves has, missing, and locale conditions', async () => {
    const matcher = {
      source: '/dashboard',
      locale: false,
      has: [{ type: 'header', key: 'x-match', value: 'yes' }],
      missing: [{ type: 'cookie', key: 'skip' }],
    }
    const { matchers } = await readConfig([matcher])
    expect(matchers[0]).toEqual({
      originalSource: matcher.source,
      regexp: expect.any(String),
      locale: false,
      has: matcher.has,
      missing: matcher.missing,
    })
  })

  it('rejects i18n configuration because Go proxies only support App Router', async () => {
    await expect(
      readConfig('/dashboard', {
        i18n: { locales: ['en', 'fr'], defaultLocale: 'en' },
      })
    ).rejects.toThrow('proxy.go does not support the i18n configuration')
  })

  it.each(['has', 'missing'] as const)(
    'keeps %s cookie conditions and routes repeated names to validation',
    async (kind) => {
      for (const name of ['resource', 'a.b', 'a+b', 'Session']) {
        const { matchers } = await readConfig([
          {
            source: '/secure',
            [kind]: [
              {
                type: 'cookie',
                key: name,
                value: kind === 'has' ? 'private' : 'public',
              },
            ],
          },
        ])
        const platformMatch = getMiddlewareRouteMatcher(matchers)
        const goMatch = getGoProxyMatcher(matchers)
        const req = new IncomingMessage(new Socket())
        req.method = 'GET'
        req.url = '/secure'
        try {
          for (const [cookie, expected] of [
            [`${name}=private`, true],
            [`${name}=public`, false],
            [`other=${name}=public; ${name}=private`, true],
            [`${name}=public; other=${name}=private`, false],
            [`prefix${name}=public; ${name}=private`, true],
          ] as const) {
            req.headers = { cookie }
            const request = new NodeNextRequest(req)
            expect(platformMatch('/secure', request, {})).toBe(expected)
            expect(goMatch('/secure', request, {})).toBe(expected)
          }
          for (const cookie of [
            `${name}=public; ${name}=private`,
            `${name}=private; ${name}=public`,
            `other=one; ${name}=public; next=two; ${name}=private`,
          ]) {
            req.headers = { cookie }
            const request = new NodeNextRequest(req)
            expect(platformMatch('/secure', request, {})).toBe(true)
            expect(() => goMatch('/secure', request, {})).toThrow(
              'unambiguous request headers'
            )
          }
        } finally {
          req.destroy()
        }
      }
    }
  )

  it('rejects ambiguous repeated headers while respecting request-header overrides', async () => {
    const { matchers } = await readConfig([
      {
        source: '/secure',
        has: [{ type: 'header', key: 'x-resource', value: 'private' }],
      },
    ])
    const req = new IncomingMessage(new Socket())
    req.method = 'GET'
    req.url = '/secure'
    req.headers = { 'x-resource': 'private, public' }
    req.rawHeaders = ['X-Resource', 'private', 'x-resource', 'public']
    try {
      const match = getGoProxyMatcher(matchers)
      expect(() => match('/secure', new NodeNextRequest(req), {})).toThrow(
        'unambiguous request headers'
      )

      req.headers['x-resource'] = 'public'
      expect(match('/secure', new NodeNextRequest(req), {})).toBe(false)
    } finally {
      req.destroy()
    }
  })

  it('rejects Connection-nominated fields in header and cookie conditions', async () => {
    const { matchers } = await readConfig([
      {
        source: '/secure',
        missing: [
          { type: 'header', key: 'x-resource' },
          { type: 'cookie', key: 'skip' },
        ],
      },
    ])
    const req = new IncomingMessage(new Socket())
    req.method = 'GET'
    req.url = '/secure'
    req.headers = {
      connection: 'X-Resource, Cookie',
      'x-resource': 'public',
      cookie: 'skip=yes',
    }
    req.rawHeaders = [
      'Connection',
      'X-Resource, Cookie',
      'X-Resource',
      'public',
      'Cookie',
      'skip=yes',
    ]
    try {
      expect(() =>
        getGoProxyMatcher(matchers)('/secure', new NodeNextRequest(req), {})
      ).toThrow('unambiguous request headers')
      expect(req.headers['x-resource']).toBe('public')
      expect(req.headers.cookie).toBe('skip=yes')
    } finally {
      req.destroy()
    }
  })

  it('keeps repeated Cookie fields combined for header and cookie conditions', async () => {
    const { matchers } = await readConfig([
      {
        source: '/secure',
        has: [
          { type: 'header', key: 'cookie', value: 'session=private; skip=yes' },
          { type: 'cookie', key: 'skip', value: 'yes' },
        ],
      },
    ])
    const req = new IncomingMessage(new Socket())
    req.method = 'GET'
    req.url = '/secure'
    req.headers = { cookie: 'session=private; skip=yes' }
    req.rawHeaders = ['Cookie', 'session=private', 'Cookie', 'skip=yes']
    try {
      expect(
        getGoProxyMatcher(matchers)('/secure', new NodeNextRequest(req), {})
      ).toBe(true)
    } finally {
      req.destroy()
    }
  })

  it('rejects invalid expanded sources without exiting and can recover', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Unexpected process.exit')
    })
    try {
      // The literal is valid; only its expanded form exceeds the length limit.
      await expect(
        readConfig([{ source: '/' + 'a'.repeat(4089) }])
      ).rejects.toThrow(
        /Invalid static Go config in proxy\.go: .*exceeds max built length of 4096/
      )
      expect(exit).not.toHaveBeenCalled()

      await expect(readConfig([{ source: '/recovered' }])).resolves.toEqual({
        matchers: [expect.objectContaining({ originalSource: '/recovered' })],
      })
      expect(exit).not.toHaveBeenCalled()
    } finally {
      exit.mockRestore()
    }
  })
})

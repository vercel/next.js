import net from 'net'
import { nextTestSetup } from 'e2e-utils'

// The root-path locale redirect reads the request target, the Host header,
// Accept-Language and the NEXT_LOCALE cookie. These tests send raw requests so
// that the request target (`//`, encoded or backslashed slashes, `*`) and the
// Host header reach the router server exactly as written, and record the
// status and Location for each combination.

type Headers = Record<string, string>

async function rawRequest(
  port: string,
  target: string,
  headers: Headers
): Promise<string> {
  const lines = [`GET ${target} HTTP/1.1`]
  if (!('host' in headers)) lines.push('host: localhost')
  for (const [name, value] of Object.entries(headers)) {
    lines.push(`${name}: ${value}`)
  }
  lines.push('connection: close', '', '')

  return new Promise((resolve, reject) => {
    const socket = net.connect(Number(port), '127.0.0.1')
    let data = ''
    let done = false
    const finish = () => {
      if (done) return
      done = true
      socket.destroy()
      const head = data.split('\r\n\r\n', 1)[0]
      if (!head) return resolve('no response')
      const [statusLine, ...headerLines] = head.split('\r\n')
      const status = statusLine.split(' ')[1]
      const location = headerLines
        .find((line) => line.toLowerCase().startsWith('location:'))
        ?.slice('location:'.length)
        .trim()
      resolve(location !== undefined ? `${status} ${location}` : status)
    }
    socket.setEncoding('latin1')
    socket.setTimeout(30_000, () => reject(new Error(`timeout: ${target}`)))
    socket.on('data', (chunk) => {
      data += chunk
      if (data.includes('\r\n\r\n')) finish()
    })
    socket.on('end', finish)
    socket.on('close', finish)
    socket.on('error', (err) => {
      if (data) finish()
      else reject(err)
    })
    socket.write(lines.join('\r\n'))
  })
}

async function matrix(
  port: string,
  targets: string[],
  variants: Record<string, Headers>
) {
  const rows: string[] = []
  for (const target of targets) {
    const cells: string[] = []
    for (const [name, headers] of Object.entries(variants)) {
      cells.push(`${name}=${await rawRequest(port, target, headers)}`)
    }
    rows.push(`${JSON.stringify(target)} ${cells.join(', ')}`)
  }
  return rows.join('\n')
}

const domains = [
  { domain: 'example.com', defaultLocale: 'en', locales: ['de'] },
  { domain: 'example.fr', defaultLocale: 'fr', http: true as const },
]

const domainVariants: Record<string, Headers> = {
  plain: {},
  'al-fr': { 'accept-language': 'fr' },
  'cookie-de': { cookie: 'NEXT_LOCALE=de' },
  'cookie-en+al-fr': { cookie: 'NEXT_LOCALE=en', 'accept-language': 'fr' },
  'host-com+al-fr': { host: 'example.com', 'accept-language': 'fr' },
  'host-FR:80+al-de': { host: 'EXAMPLE.FR:80', 'accept-language': 'de' },
  'host-evil+xfh-fr+al-nl': {
    host: 'evil.com',
    'x-forwarded-host': 'example.fr',
    'accept-language': 'nl',
  },
}

const rootTargets = [
  '/',
  '/?a=b',
  '/?next=//evil.com',
  '/index',
  '/index/',
  '/index?a=b',
  '/index\\',
  '/index/.',
  '//',
  '///?a=b',
  '//evil.com',
  '//evil.com/',
  '/\\evil.com',
  '/\\',
  '\\',
  '/%2f',
  '/%2F',
  '/%5c',
  '/.',
  '/./',
  '/..',
  '/fr',
  '/fr/',
  '/FR',
  '/en',
  '/about',
  '/about/',
  '/index/about',
  '/fr/about',
  '*',
]

// Raw request targets and Host headers only reach the router server of
// `next start` / `next dev`; a deployment does not run it.
describe('i18n-locale-redirect-request-target', () => {
  describe('with domains', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      nextConfig: {
        i18n: {
          locales: ['en', 'fr', 'de', 'nl'],
          defaultLocale: 'en',
          domains,
        },
      },
    })

    it('redirects only the root path, to the same locations', async () => {
      expect(await matrix(next.appPort, rootTargets, domainVariants))
        .toMatchInlineSnapshot(`
       ""/" plain=200, al-fr=307 /fr, cookie-de=307 /de, cookie-en+al-fr=200, host-com+al-fr=307 http://example.fr/, host-FR:80+al-de=307 https://example.com/de, host-evil+xfh-fr+al-nl=307 /nl
       "/?a=b" plain=200, al-fr=307 /fr?a=b, cookie-de=307 /de?a=b, cookie-en+al-fr=200, host-com+al-fr=307 http://example.fr/, host-FR:80+al-de=307 https://example.com/de, host-evil+xfh-fr+al-nl=307 /nl?a=b
       "/?next=//evil.com" plain=200, al-fr=307 /fr?next=//evil.com, cookie-de=307 /de?next=//evil.com, cookie-en+al-fr=200, host-com+al-fr=307 http://example.fr/, host-FR:80+al-de=307 https://example.com/de, host-evil+xfh-fr+al-nl=307 /nl?next=//evil.com
       "/index" plain=404, al-fr=307 /fr, cookie-de=307 /de, cookie-en+al-fr=404, host-com+al-fr=307 http://example.fr/, host-FR:80+al-de=307 https://example.com/de, host-evil+xfh-fr+al-nl=307 /nl
       "/index/" plain=308 /index, al-fr=307 /fr, cookie-de=307 /de, cookie-en+al-fr=308 /index, host-com+al-fr=307 http://example.fr/, host-FR:80+al-de=307 https://example.com/de, host-evil+xfh-fr+al-nl=307 /nl
       "/index?a=b" plain=404, al-fr=307 /fr?a=b, cookie-de=307 /de?a=b, cookie-en+al-fr=404, host-com+al-fr=307 http://example.fr/, host-FR:80+al-de=307 https://example.com/de, host-evil+xfh-fr+al-nl=307 /nl?a=b
       "/index\\\\" plain=308 /index/, al-fr=307 /fr, cookie-de=307 /de, cookie-en+al-fr=308 /index/, host-com+al-fr=307 http://example.fr/, host-FR:80+al-de=307 https://example.com/de, host-evil+xfh-fr+al-nl=307 /nl
       "/index/." plain=308 /index, al-fr=308 /index, cookie-de=308 /index, cookie-en+al-fr=308 /index, host-com+al-fr=308 /index, host-FR:80+al-de=308 /index, host-evil+xfh-fr+al-nl=308 /index
       "//" plain=308 /, al-fr=308 /, cookie-de=308 /, cookie-en+al-fr=308 /, host-com+al-fr=308 /, host-FR:80+al-de=308 /, host-evil+xfh-fr+al-nl=308 /
       "///?a=b" plain=308 /?a=b, al-fr=308 /?a=b, cookie-de=308 /?a=b, cookie-en+al-fr=308 /?a=b, host-com+al-fr=308 /?a=b, host-FR:80+al-de=308 /?a=b, host-evil+xfh-fr+al-nl=308 /?a=b
       "//evil.com" plain=308 /evil.com, al-fr=308 /evil.com, cookie-de=308 /evil.com, cookie-en+al-fr=308 /evil.com, host-com+al-fr=308 /evil.com, host-FR:80+al-de=308 /evil.com, host-evil+xfh-fr+al-nl=308 /evil.com
       "//evil.com/" plain=308 /evil.com/, al-fr=308 /evil.com/, cookie-de=308 /evil.com/, cookie-en+al-fr=308 /evil.com/, host-com+al-fr=308 /evil.com/, host-FR:80+al-de=308 /evil.com/, host-evil+xfh-fr+al-nl=308 /evil.com/
       "/\\\\evil.com" plain=308 /evil.com, al-fr=308 /evil.com, cookie-de=308 /evil.com, cookie-en+al-fr=308 /evil.com, host-com+al-fr=308 /evil.com, host-FR:80+al-de=308 /evil.com, host-evil+xfh-fr+al-nl=308 /evil.com
       "/\\\\" plain=308 /, al-fr=308 /, cookie-de=308 /, cookie-en+al-fr=308 /, host-com+al-fr=308 /, host-FR:80+al-de=308 /, host-evil+xfh-fr+al-nl=308 /
       "\\\\" plain=400, al-fr=400, cookie-de=400, cookie-en+al-fr=400, host-com+al-fr=400, host-FR:80+al-de=400, host-evil+xfh-fr+al-nl=400
       "/%2f" plain=404, al-fr=404, cookie-de=404, cookie-en+al-fr=404, host-com+al-fr=404, host-FR:80+al-de=404, host-evil+xfh-fr+al-nl=404
       "/%2F" plain=404, al-fr=404, cookie-de=404, cookie-en+al-fr=404, host-com+al-fr=404, host-FR:80+al-de=404, host-evil+xfh-fr+al-nl=404
       "/%5c" plain=404, al-fr=404, cookie-de=404, cookie-en+al-fr=404, host-com+al-fr=404, host-FR:80+al-de=404, host-evil+xfh-fr+al-nl=404
       "/." plain=200, al-fr=200, cookie-de=200, cookie-en+al-fr=200, host-com+al-fr=200, host-FR:80+al-de=200, host-evil+xfh-fr+al-nl=200
       "/./" plain=200, al-fr=200, cookie-de=200, cookie-en+al-fr=200, host-com+al-fr=200, host-FR:80+al-de=200, host-evil+xfh-fr+al-nl=200
       "/.." plain=200, al-fr=200, cookie-de=200, cookie-en+al-fr=200, host-com+al-fr=200, host-FR:80+al-de=200, host-evil+xfh-fr+al-nl=200
       "/fr" plain=200, al-fr=200, cookie-de=200, cookie-en+al-fr=200, host-com+al-fr=200, host-FR:80+al-de=200, host-evil+xfh-fr+al-nl=200
       "/fr/" plain=308 /fr, al-fr=308 /fr, cookie-de=308 /fr, cookie-en+al-fr=308 /fr, host-com+al-fr=308 /fr, host-FR:80+al-de=200, host-evil+xfh-fr+al-nl=308 /fr
       "/FR" plain=200, al-fr=200, cookie-de=200, cookie-en+al-fr=200, host-com+al-fr=200, host-FR:80+al-de=200, host-evil+xfh-fr+al-nl=200
       "/en" plain=200, al-fr=200, cookie-de=200, cookie-en+al-fr=200, host-com+al-fr=200, host-FR:80+al-de=200, host-evil+xfh-fr+al-nl=200
       "/about" plain=200, al-fr=200, cookie-de=200, cookie-en+al-fr=200, host-com+al-fr=200, host-FR:80+al-de=200, host-evil+xfh-fr+al-nl=200
       "/about/" plain=308 /about, al-fr=308 /about, cookie-de=308 /about, cookie-en+al-fr=308 /about, host-com+al-fr=308 /about, host-FR:80+al-de=308 /about, host-evil+xfh-fr+al-nl=308 /about
       "/index/about" plain=404, al-fr=404, cookie-de=404, cookie-en+al-fr=404, host-com+al-fr=404, host-FR:80+al-de=404, host-evil+xfh-fr+al-nl=404
       "/fr/about" plain=200, al-fr=200, cookie-de=200, cookie-en+al-fr=200, host-com+al-fr=200, host-FR:80+al-de=200, host-evil+xfh-fr+al-nl=200
       "*" plain=500, al-fr=500, cookie-de=500, cookie-en+al-fr=500, host-com+al-fr=500, host-FR:80+al-de=500, host-evil+xfh-fr+al-nl=500"
      `)
    })
  })

  describe('with basePath and trailingSlash', () => {
    const { next, isNextDev } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      nextConfig: {
        basePath: '/docs',
        trailingSlash: true,
        i18n: {
          locales: ['en', 'fr', 'de'],
          defaultLocale: 'en',
        },
      },
    })

    it('redirects only the root path, to the same locations', async () => {
      expect(
        await matrix(
          next.appPort,
          [
            '/docs',
            '/docs/',
            '/docs?a=b',
            '/docs/index',
            '/docs/index/',
            '/docs//evil.com',
            '/docs/%2f',
            '/docs/fr',
            '/docs/fr/',
            '/docs/about/',
            '/docsx',
            '//docs/',
            '/',
          ],

          {
            plain: {},
            'al-fr': { 'accept-language': 'fr' },
            'cookie-de': { cookie: 'NEXT_LOCALE=de' },
          }
        )
      ).toMatchInlineSnapshot(`
       ""/docs" plain=308 /docs/, al-fr=307 /docs/fr/, cookie-de=307 /docs/de/
       "/docs/" plain=200, al-fr=307 /docs/fr/, cookie-de=307 /docs/de/
       "/docs?a=b" plain=308 /docs/?a=b, al-fr=307 /docs/fr/?a=b, cookie-de=307 /docs/de/?a=b
       "/docs/index" plain=308 /docs/index/, al-fr=307 /docs/fr/, cookie-de=307 /docs/de/
       "/docs/index/" plain=404, al-fr=307 /docs/fr/, cookie-de=307 /docs/de/
       "/docs//evil.com" plain=308 /docs/evil.com, al-fr=308 /docs/evil.com, cookie-de=308 /docs/evil.com
       "/docs/%2f" plain=308 /docs/%2f/, al-fr=308 /docs/%2f/, cookie-de=308 /docs/%2f/
       "/docs/fr" plain=308 /docs/fr/, al-fr=308 /docs/fr/, cookie-de=308 /docs/fr/
       "/docs/fr/" plain=200, al-fr=200, cookie-de=200
       "/docs/about/" plain=200, al-fr=200, cookie-de=200
       "/docsx" plain=308 /docsx/, al-fr=308 /docsx/, cookie-de=308 /docsx/
       "//docs/" plain=308 /docs/, al-fr=308 /docs/, cookie-de=308 /docs/
       "/" plain=404, al-fr=307 /docs/fr/, cookie-de=307 /docs/de/"
      `)
    })
    it('normalizes repeated and backslashed slashes after the basePath', async () => {
      // `next dev` drops the basePath from this normalization redirect, while
      // `next start` keeps it; neither applies the locale redirect.
      const location = isNextDev ? '/' : '/docs/'
      expect(
        await matrix(next.appPort, ['/docs//', '/docs/\\'], {
          plain: {},
          'al-fr': { 'accept-language': 'fr' },
          'cookie-de': { cookie: 'NEXT_LOCALE=de' },
        })
      ).toBe(
        [
          `"/docs//" plain=308 ${location}, al-fr=308 ${location}, cookie-de=308 ${location}`,
          `"/docs/\\\\" plain=308 ${location}, al-fr=308 ${location}, cookie-de=308 ${location}`,
        ].join('\n')
      )
    })
  })

  describe('with localeDetection false', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      nextConfig: {
        i18n: {
          locales: ['en', 'fr', 'de', 'nl'],
          defaultLocale: 'en',
          localeDetection: false,
          domains,
        },
      },
    })

    it('does not redirect', async () => {
      expect(
        await matrix(
          next.appPort,
          ['/', '/index', '//evil.com', '/about'],
          domainVariants
        )
      ).toMatchInlineSnapshot(`
       ""/" plain=200, al-fr=200, cookie-de=200, cookie-en+al-fr=200, host-com+al-fr=200, host-FR:80+al-de=200, host-evil+xfh-fr+al-nl=200
       "/index" plain=404, al-fr=404, cookie-de=404, cookie-en+al-fr=404, host-com+al-fr=404, host-FR:80+al-de=404, host-evil+xfh-fr+al-nl=404
       "//evil.com" plain=308 /evil.com, al-fr=308 /evil.com, cookie-de=308 /evil.com, cookie-en+al-fr=308 /evil.com, host-com+al-fr=308 /evil.com, host-FR:80+al-de=308 /evil.com, host-evil+xfh-fr+al-nl=308 /evil.com
       "/about" plain=200, al-fr=200, cookie-de=200, cookie-en+al-fr=200, host-com+al-fr=200, host-FR:80+al-de=200, host-evil+xfh-fr+al-nl=200"
      `)
    })
  })
})

/* eslint-env jest */
import { NextURL } from 'next/dist/server/web/next-url'

// TODO Make NextURL extend URL
it.skip('has the right shape and prototype', () => {
  const parsed = new NextURL('/about?param1=value1', 'http://127.0.0.1')
  expect(parsed).toBeInstanceOf(URL)
})

it('allows to the pathname', async () => {
  const parsed = new NextURL('/about?param1=value1', 'http://127.0.0.1:3000')
  expect(parsed.basePath).toEqual('')
  expect(parsed.hostname).toEqual('localhost')
  expect(parsed.host).toEqual('localhost:3000')
  expect(parsed.href).toEqual('http://localhost:3000/about?param1=value1')

  parsed.pathname = '/hihi'
  expect(parsed.href).toEqual('http://localhost:3000/hihi?param1=value1')
})

it('allows to change the host', () => {
  const parsed = new NextURL('/about?param1=value1', 'http://127.0.0.1')
  expect(parsed.hostname).toEqual('localhost')
  expect(parsed.host).toEqual('localhost')
  expect(parsed.href).toEqual('http://localhost/about?param1=value1')

  parsed.hostname = 'foo.com'
  expect(parsed.hostname).toEqual('foo.com')
  expect(parsed.host).toEqual('foo.com')
  expect(parsed.href).toEqual('http://foo.com/about?param1=value1')
  expect(parsed.toString()).toEqual('http://foo.com/about?param1=value1')
})

it('does noop changing to an invalid hostname', () => {
  const url = new NextURL('https://foo.com/example')
  url.hostname = ''
  expect(url.toString()).toEqual('https://foo.com/example')
})

it('allows to change the whole href', () => {
  const url = new NextURL('https://localhost.com/foo')
  expect(url.hostname).toEqual('localhost.com')
  expect(url.protocol).toEqual('https:')
  expect(url.host).toEqual('localhost.com')

  url.href = 'http://foo.com/bar'
  expect(url.hostname).toEqual('foo.com')
  expect(url.protocol).toEqual('http:')
  expect(url.host).toEqual('foo.com')
})

it('allows to update search params', () => {
  const url = new NextURL('/example', 'http://localhost.com')
  url.searchParams.set('foo', 'bar')
  expect(url.search).toEqual('?foo=bar')
  expect(url.toString()).toEqual('http://localhost.com/example?foo=bar')
})

it('parses and formats the basePath', () => {
  const url = new NextURL('/root/example', {
    base: 'http://127.0.0.1',
    basePath: '/root',
  })

  expect(url.basePath).toEqual('/root')
  expect(url.pathname).toEqual('/example')
  expect(url.toString()).toEqual('http://localhost/root/example')

  const url2 = new NextURL('https://foo.com/root/bar', {
    basePath: '/root',
  })

  expect(url2.basePath).toEqual('/root')
  expect(url2.pathname).toEqual('/bar')
  expect(url2.toString()).toEqual('https://foo.com/root/bar')

  url2.basePath = '/test'
  expect(url2.basePath).toEqual('/test')
  expect(url2.pathname).toEqual('/bar')
  expect(url2.toString()).toEqual('https://foo.com/test/bar')

  const url3 = new NextURL('https://foo.com/example', {
    basePath: '/root',
  })

  expect(url3.basePath).toEqual('')

  url3.href = 'http://localhost.com/root/example'
  expect(url3.basePath).toEqual('/root')
  expect(url3.pathname).toEqual('/example')
  expect(url3.toString()).toEqual('http://localhost.com/root/example')
})

it('allows to get empty locale when there is no locale', () => {
  const url = new NextURL('https://localhost:3000/foo')
  expect(url.locale).toEqual('')
})

it('doesnt allow to set an unexisting locale', () => {
  const url = new NextURL('https://localhost:3000/foo')
  let error: Error | null = null
  try {
    url.locale = 'foo'
  } catch (err) {
    error = err
  }

  expect(error).toBeInstanceOf(TypeError)
  expect(error.message).toEqual(
    'The NextURL configuration includes no locale "foo"'
  )
})

it('always get a default locale', () => {
  const url = new NextURL('/bar', {
    base: 'http://127.0.0.1',
    i18n: {
      defaultLocale: 'en',
      locales: ['en', 'es', 'fr'],
    },
  })

  expect(url.locale).toEqual('en')
})

it('parses and formats the default locale', () => {
  const url = new NextURL('/es/bar', {
    base: 'http://127.0.0.1',
    basePath: '/root',
    i18n: {
      defaultLocale: 'en',
      locales: ['en', 'es', 'fr'],
    },
  })

  expect(url.locale).toEqual('es')
  expect(url.toString()).toEqual('http://localhost/es/bar')

  url.basePath = '/root'
  expect(url.locale).toEqual('es')
  expect(url.toString()).toEqual('http://localhost/root/es/bar')

  url.locale = 'en'
  expect(url.locale).toEqual('en')
  expect(url.toString()).toEqual('http://localhost/root/bar')

  url.locale = 'fr'
  expect(url.locale).toEqual('fr')
  expect(url.toString()).toEqual('http://localhost/root/fr/bar')
})

it('consider 127.0.0.1 and variations as localhost', () => {
  const httpUrl = new NextURL('http://localhost:3000/hello')
  expect(new NextURL('http://127.0.0.1:3000/hello')).toStrictEqual(httpUrl)
  expect(new NextURL('http://127.0.1.0:3000/hello')).toStrictEqual(httpUrl)
  expect(new NextURL('http://::1:3000/hello')).toStrictEqual(httpUrl)

  const httpsUrl = new NextURL('https://localhost:3000/hello')
  expect(new NextURL('https://127.0.0.1:3000/hello')).toStrictEqual(httpsUrl)
  expect(new NextURL('https://127.0.1.0:3000/hello')).toStrictEqual(httpsUrl)
  expect(new NextURL('https://::1:3000/hello')).toStrictEqual(httpsUrl)
})

it('allows to change the port', () => {
  const url = new NextURL('https://localhost:3000/foo')
  url.port = '3001'
  expect(url.href).toEqual('https://localhost:3001/foo')
  url.port = '80'
  expect(url.href).toEqual('https://localhost:80/foo')
  url.port = ''
  expect(url.href).toEqual('https://localhost/foo')
})

it('allows to clone a new copy', () => {
  const url = new NextURL('/root/es/bar', {
    base: 'http://127.0.0.1',
    basePath: '/root',
    i18n: {
      defaultLocale: 'en',
      locales: ['en', 'es', 'fr'],
    },
  })

  const clone = url.clone()
  clone.pathname = '/test'
  clone.basePath = '/root-test'

  expect(url.toString()).toEqual('http://localhost/root/es/bar')
  expect(clone.toString()).toEqual('http://localhost/root-test/es/test')
})

it('does not add locale for api route', () => {
  const url = new NextURL('http:///localhost:3000/api', {
    i18n: {
      defaultLocale: 'en',
      locales: ['en', 'es', 'fr'],
    },
  })
  url.locale = 'fr'

  let expected = 'http://localhost:3000/api'
  expect(url.href).toEqual(expected)
  expect(url.toString()).toEqual(expected)
  expect(url.toJSON()).toEqual(expected)

  url.pathname = '/api/hello'

  expected = 'http://localhost:3000/api/hello'
  expect(url.href).toEqual(expected)
  expect(url.toString()).toEqual(expected)
  expect(url.toJSON()).toEqual(expected)
})

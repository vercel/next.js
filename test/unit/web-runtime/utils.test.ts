/* eslint-env jest */
import { NextURL } from 'next/dist/server/web/next-url'

it('has the right shape', () => {
  const parsed = new NextURL('/about?param1=value1')
  expect(parsed).toBeInstanceOf(URL)
})

it('allows to format relative urls', async () => {
  const parsed = new NextURL('/about?param1=value1')
  expect(parsed.basePath).toEqual('')
  expect(parsed.hostname).toEqual('')
  expect(parsed.host).toEqual('')
  expect(parsed.href).toEqual('/about?param1=value1')

  parsed.pathname = '/hihi'
  expect(parsed.href).toEqual('/hihi?param1=value1')
})

it('allows to change the host of a relative url', () => {
  const parsed = new NextURL('/about?param1=value1')
  expect(parsed.hostname).toEqual('')
  expect(parsed.host).toEqual('')
  expect(parsed.href).toEqual('/about?param1=value1')

  parsed.hostname = 'foo.com'
  expect(parsed.hostname).toEqual('foo.com')
  expect(parsed.host).toEqual('foo.com')
  expect(parsed.href).toEqual('https://foo.com/about?param1=value1')
  expect(parsed.toString()).toEqual('https://foo.com/about?param1=value1')
})

it('allows to change the hostname of a relative url', () => {
  const url = new NextURL('/example')
  url.hostname = 'foo.com'
  expect(url.toString()).toEqual('https://foo.com/example')
})

it('allows to remove the hostname of an absolute url', () => {
  const url = new NextURL('https://foo.com/example')
  url.hostname = ''
  expect(url.toString()).toEqual('/example')
})

it('allows to change the whole href of an absolute url', () => {
  const url = new NextURL('https://localhost.com/foo')
  expect(url.hostname).toEqual('localhost.com')
  expect(url.protocol).toEqual('https:')
  expect(url.host).toEqual('localhost.com')

  url.href = '/foo'
  expect(url.hostname).toEqual('')
  expect(url.protocol).toEqual('')
  expect(url.host).toEqual('')
})

it('allows to update search params', () => {
  const url = new NextURL('/example')
  url.searchParams.set('foo', 'bar')
  expect(url.search).toEqual('?foo=bar')
  expect(url.toString()).toEqual('/example?foo=bar')
})

it('parses and formats the basePath', () => {
  const url = new NextURL('/root/example', {
    basePath: '/root',
  })

  expect(url.basePath).toEqual('/root')
  expect(url.pathname).toEqual('/example')
  expect(url.toString()).toEqual('/root/example')

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

  url3.href = '/root/example'
  expect(url.basePath).toEqual('/root')
  expect(url.pathname).toEqual('/example')
  expect(url.toString()).toEqual('/root/example')
})

it('parses and formats the default locale', () => {
  const url = new NextURL('/es/bar', {
    basePath: '/root',
    i18n: {
      defaultLocale: 'en',
      locales: ['en', 'es', 'fr'],
    },
  })

  expect(url.locale).toEqual('es')
  expect(url.toString()).toEqual('/es/bar')

  url.basePath = '/root'
  expect(url.locale).toEqual('es')
  expect(url.toString()).toEqual('/root/es/bar')

  url.locale = 'en'
  expect(url.locale).toEqual('en')
  expect(url.toString()).toEqual('/root/bar')

  url.locale = 'fr'
  expect(url.locale).toEqual('fr')
  expect(url.toString()).toEqual('/root/fr/bar')
})

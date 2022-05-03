/* eslint-env jest */

import {
  Cookies,
  CookieSerializeOptions,
} from 'next/dist/server/web/spec-extension/cookies'
import { Blob, File, FormData } from 'next/dist/compiled/formdata-node'
import { Headers } from 'next/dist/server/web/spec-compliant/headers'
import { Crypto } from 'next/dist/server/web/sandbox/polyfills'
import * as streams from 'web-streams-polyfill/ponyfill'

beforeAll(() => {
  global['Blob'] = Blob
  global['crypto'] = new Crypto()
  global['File'] = File
  global['FormData'] = FormData
  global['Headers'] = Headers
  global['ReadableStream'] = streams.ReadableStream
  global['TransformStream'] = streams.TransformStream
})

afterAll(() => {
  delete global['Blob']
  delete global['crypto']
  delete global['File']
  delete global['Headers']
  delete global['FormData']
  delete global['ReadableStream']
  delete global['TransformStream']
})

it('create a empty cookies bag', async () => {
  const cookies = new Cookies()
  expect(Object.entries(cookies)).toStrictEqual([])
})

it('create a cookies bag from string', async () => {
  const cookies = new Cookies('foo=bar; equation=E%3Dmc%5E2')
  expect(Array.from(cookies.entries())).toStrictEqual([
    ['foo', 'foo=bar; Path=/'],
    ['equation', 'equation=E%3Dmc%5E2; Path=/'],
  ])
})

it('.set', async () => {
  const cookies = new Cookies()
  cookies.set('foo', 'bar')
  expect(Array.from(cookies.entries())).toStrictEqual([
    ['foo', 'foo=bar; Path=/'],
  ])
})

it('.set with options', async () => {
  const cookies = new Cookies()

  const options: CookieSerializeOptions = {
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: 'strict',
    domain: 'example.com',
  }

  cookies.set('foo', 'bar', options)

  expect(options).toStrictEqual({
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: 'strict',
    domain: 'example.com',
  })

  const [[key, value]] = Array.from(cookies.entries())
  const values = value.split('; ')

  expect(key).toBe('foo')

  expect(values).toStrictEqual([
    'foo=bar',
    'Max-Age=604800',
    'Domain=example.com',
    'Path=/',
    expect.stringContaining('Expires='),
    'HttpOnly',
    'SameSite=Strict',
  ])
})

it('.delete', async () => {
  const cookies = new Cookies()
  cookies.set('foo', 'bar')
  cookies.delete('foo')
  expect(Array.from(cookies.entries())).toStrictEqual([])
})

it('.has', async () => {
  const cookies = new Cookies()
  cookies.set('foo', 'bar')
  expect(cookies.has('foo')).toBe(true)
})

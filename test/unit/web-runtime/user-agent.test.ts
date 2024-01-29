/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { userAgentFromString, userAgent, NextRequest } from 'next/server'

const UA_STRING =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_2_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36'

it('parse an user agent', () => {
  const parser = userAgentFromString(UA_STRING)
  expect(parser.ua).toBe(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_2_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36'
  )
  expect(parser.browser).toStrictEqual({
    name: 'Chrome',
    version: '89.0.4389.90',
    major: '89',
  })
  expect(parser.engine).toStrictEqual({
    name: 'Blink',
    version: '89.0.4389.90',
  })
  expect(parser.os).toStrictEqual({ name: 'Mac OS', version: '11.2.3' })
  expect(parser.cpu).toStrictEqual({ architecture: undefined })
  expect(parser.isBot).toBe(false)
})

it('parse empty user agent', () => {
  expect.assertions(3)
  for (const input of [undefined, null, '']) {
    expect(userAgentFromString(input)).toStrictEqual({
      ua: '',
      browser: { name: undefined, version: undefined, major: undefined },
      engine: { name: undefined, version: undefined },
      os: { name: undefined, version: undefined },
      device: { vendor: undefined, model: undefined, type: undefined },
      cpu: { architecture: undefined },
      isBot: false,
    })
  }
})

it('parse user agent from a NextRequest instance', () => {
  const request = new NextRequest('https://vercel.com', {
    headers: {
      'user-agent': UA_STRING,
    },
  })

  expect(userAgent(request)).toStrictEqual({
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_2_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36',
    browser: { name: 'Chrome', version: '89.0.4389.90', major: '89' },
    engine: { name: 'Blink', version: '89.0.4389.90' },
    os: { name: 'Mac OS', version: '11.2.3' },
    device: { vendor: 'Apple', model: 'Macintosh', type: undefined },
    cpu: { architecture: undefined },
    isBot: false,
  })
})

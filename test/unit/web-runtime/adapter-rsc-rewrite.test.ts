/**
 * @jest-environment node
 */

import { adapter } from '../../../packages/next/src/server/web/adapter'
import { NextResponse } from 'next/dist/server/web/spec-extension/response'

describe('adapter RSC rewrite forwarding (issue #100398)', () => {
  it('forwards empty _rsc parameter on rewrite for RSC request', async () => {
    const result = await adapter({
      page: '/middleware',
      request: {
        url: 'https://example.com/target?_rsc',
        method: 'GET',
        headers: {
          rsc: '1',
        },
      },
      handler: async () => {
        return NextResponse.rewrite('https://example.com/rewritten')
      },
    })

    const rewriteHeader = result.response.headers.get('x-middleware-rewrite')
    expect(rewriteHeader).toBe('https://example.com/rewritten?_rsc=')
  })

  it('forwards non-empty _rsc parameter on rewrite for RSC request', async () => {
    const result = await adapter({
      page: '/middleware',
      request: {
        url: 'https://example.com/target?_rsc=abc123',
        method: 'GET',
        headers: {
          rsc: '1',
        },
      },
      handler: async () => {
        return NextResponse.rewrite('https://example.com/rewritten')
      },
    })

    const rewriteHeader = result.response.headers.get('x-middleware-rewrite')
    expect(rewriteHeader).toBe('https://example.com/rewritten?_rsc=abc123')
  })

  it('does not add _rsc parameter on rewrite when request is not RSC request', async () => {
    const result = await adapter({
      page: '/middleware',
      request: {
        url: 'https://example.com/target',
        method: 'GET',
        headers: {},
      },
      handler: async () => {
        return NextResponse.rewrite('https://example.com/rewritten')
      },
    })

    const rewriteHeader = result.response.headers.get('x-middleware-rewrite')
    expect(rewriteHeader).toBe('https://example.com/rewritten')
  })

  it('does not add _rsc parameter on rewrite when RSC request has no _rsc parameter', async () => {
    const result = await adapter({
      page: '/middleware',
      request: {
        url: 'https://example.com/target',
        method: 'GET',
        headers: {
          rsc: '1',
        },
      },
      handler: async () => {
        return NextResponse.rewrite('https://example.com/rewritten')
      },
    })

    const rewriteHeader = result.response.headers.get('x-middleware-rewrite')
    expect(rewriteHeader).toBe('https://example.com/rewritten')
  })
})

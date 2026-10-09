/**
 * @jest-environment node
 */

import { getMcpAllowedHosts } from './get-mcp-middleware'

describe('getMcpAllowedHosts', () => {
  it('allows loopback hosts on the dev server port', () => {
    expect(getMcpAllowedHosts('http://localhost:3100', undefined)).toEqual([
      'localhost',
      '127.0.0.1',
      '[::1]',
      'localhost:3100',
      '127.0.0.1:3100',
      '[::1]:3100',
    ])
  })

  it('does not allow network interfaces when the dev server binds to all hosts', () => {
    expect(
      getMcpAllowedHosts('http://0.0.0.0:3100', '192.168.0.10:3100')
    ).toEqual([
      'localhost',
      '127.0.0.1',
      '[::1]',
      'localhost:3100',
      '127.0.0.1:3100',
      '[::1]:3100',
    ])
  })

  it('allows the current request host only when it is loopback', () => {
    expect(getMcpAllowedHosts(undefined, '127.0.0.1:4000')).toContain(
      '127.0.0.1:4000'
    )
    expect(getMcpAllowedHosts(undefined, '192.168.0.10:4000')).not.toContain(
      '192.168.0.10:4000'
    )
  })
})

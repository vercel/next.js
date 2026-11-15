/* eslint-env jest */
import { ADDRCONFIG, type LookupAddress, type LookupOptions } from 'dns'
import { createPinnedLookup } from 'next/dist/server/image-optimizer'

const HOSTNAME = 'example.com'
const IPV4: LookupAddress = { address: '93.184.216.34', family: 4 }
const IPV6: LookupAddress = {
  address: '2606:2800:220:1:248:1893:25c8:1946',
  family: 6,
}

function callLookup(
  options: LookupOptions,
  { hostname = HOSTNAME, addresses = [IPV4, IPV6] } = {}
) {
  const calls: Array<{
    err: NodeJS.ErrnoException | null
    result: string | LookupAddress[]
    family?: number
  }> = []

  createPinnedLookup(HOSTNAME, addresses)(
    hostname,
    options,
    (err, result, family) => calls.push({ err, result, family })
  )

  expect(calls).toHaveLength(1)
  return calls[0]
}

describe('createPinnedLookup', () => {
  it('should hand back every pinned address for the options a socket uses', () => {
    const { err, result } = callLookup({ all: true, hints: ADDRCONFIG })
    expect(err).toBeNull()
    expect(result).toEqual([IPV4, IPV6])
  })

  it('should report ENODATA rather than an empty list when the family matches nothing', () => {
    // An empty list is not recoverable: node destructures the first address, so
    // the resulting TypeError is thrown inside the socket and escapes the request
    const { err, result } = callLookup(
      { all: true, family: 6 },
      { addresses: [IPV4] }
    )
    expect(err?.code).toBe('ENODATA')
    expect(result).toEqual([])
  })

  it('should report ENODATA when the family matches nothing and all is unset', () => {
    const { err } = callLookup({ family: 6 }, { addresses: [IPV4] })
    expect(err?.code).toBe('ENODATA')
  })

  it('should return a single address of the requested family', () => {
    const { err, result, family } = callLookup({ family: 6 })
    expect(err).toBeNull()
    expect({ result, family }).toEqual({ result: IPV6.address, family: 6 })
  })

  it('should refuse to resolve a hostname other than the pinned one', () => {
    const { err } = callLookup({ all: true }, { hostname: 'attacker.example' })
    expect(err?.message).toContain('does not match request hostname')
  })
})

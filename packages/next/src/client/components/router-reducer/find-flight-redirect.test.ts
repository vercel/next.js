import { findRedirectHrefInTransportData } from './find-flight-redirect'
import { getRedirectError } from '../redirect'
import type { PartialTransportData } from '../../../shared/lib/rsc-transport'

function rejectedRedirect(url: string) {
  const error = getRedirectError(url, 'replace')
  const thenable = Promise.reject(error) as Promise<never> & {
    status?: string
    reason?: unknown
  }
  thenable.status = 'rejected'
  thenable.reason = error
  thenable.then(
    () => {},
    () => {}
  )
  return thenable
}

describe('findRedirectHrefInTransportData', () => {
  it('returns null when there is no transport data', () => {
    expect(findRedirectHrefInTransportData(null)).toBeNull()
    expect(findRedirectHrefInTransportData(undefined)).toBeNull()
  })

  it('finds NEXT_REDIRECT on a rejected segment RSC thenable', () => {
    const transportData: PartialTransportData = {
      t: {
        s: '',
        d: {
          r: rejectedRedirect('/target'),
          p: false,
          v: null,
        },
      },
    }
    expect(findRedirectHrefInTransportData(transportData)).toBe('/target')
  })

  it('walks child slots', () => {
    const transportData: PartialTransportData = {
      t: {
        s: '',
        c: new Map([
          [
            'children',
            {
              s: '__PAGE__',
              d: {
                r: rejectedRedirect('/dashboard'),
                p: false,
                v: null,
              },
            },
          ],
        ]),
      },
    }
    expect(findRedirectHrefInTransportData(transportData)).toBe('/dashboard')
  })
})

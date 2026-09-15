import type { ServerResponse } from 'node:http'

import { isResponseAlreadySent } from './is-response-already-sent'

const res = (state: {
  closed?: boolean
  finished?: boolean
  headersSent?: boolean
}) =>
  ({
    closed: false,
    finished: false,
    headersSent: false,
    ...state,
  }) as unknown as ServerResponse

describe('isResponseAlreadySent', () => {
  it('true when the response ended or the connection closed', () => {
    expect(isResponseAlreadySent(res({ finished: true }), undefined)).toBe(true)
    expect(isResponseAlreadySent(res({ closed: true }), undefined)).toBe(true)
  })

  it('true when a route reported finished and headers are out, even though res.finished is false (compression defers the real end())', () => {
    expect(isResponseAlreadySent(res({ headersSent: true }), true)).toBe(true)
  })

  it('false while nothing was sent, whatever resolveRoutes reported', () => {
    expect(isResponseAlreadySent(res({}), true)).toBe(false)
    expect(isResponseAlreadySent(res({}), undefined)).toBe(false)
    expect(isResponseAlreadySent(res({ headersSent: true }), false)).toBe(false)
  })
})

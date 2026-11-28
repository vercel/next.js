import {
  extractBearerToken,
  UnauthenticatedError,
  type AuthFn,
} from '@next/mcp/auth'

export function testToken(): AuthFn {
  return (request) => {
    const header = request.headers.get('authorization')
    if (!header) return null
    const token = extractBearerToken(header)
    if (token !== 'test-token')
      throw new UnauthenticatedError({ error: 'invalid_token' })
    return {
      principalId: 'user-1',
      principalType: 'user',
      authenticator: 'test',
      attributes: { email: 'a@example.com' },
    }
  }
}

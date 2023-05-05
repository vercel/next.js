import type {
  MockedResponse,
  MockedResponseOptions,
} from '../../../lib/mock-request'

export function createMockedResponse(
  res: MockedResponseOptions
): MockedResponse | undefined {
  if (process.env.NEXT_RUNTIME !== 'edge') {
    // Load this dynamically to avoid including it in the edge build.
    const mod =
      require('../../../lib/mock-request') as typeof import('../../../lib/mock-request')
    return new mod.MockedResponse(res)
  }
}

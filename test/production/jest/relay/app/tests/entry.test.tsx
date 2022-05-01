import { render as renderFn, waitFor } from '@testing-library/react'
import { RelayEnvironmentProvider } from 'react-relay'
import { createMockEnvironment, MockPayloadGenerator } from 'relay-test-utils'

import Page from '../pages'

describe('test graphql tag transformation', () => {
  it('should work', async () => {
    let environment = createMockEnvironment()

    const { getByText } = renderFn(
      <RelayEnvironmentProvider environment={environment}>
        <Page />
      </RelayEnvironmentProvider>
    )

    environment.mock.resolveMostRecentOperation((operation) => {
      return MockPayloadGenerator.generate(operation)
    })

    await waitFor(() => getByText('Data requested:'))

    expect(getByText('Data requested:')).not.toBe(null)
  })
})

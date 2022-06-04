import { useMemo } from 'react'
import { Environment, Network, RecordSource, Store, type GraphQLResponse } from 'relay-runtime'

let relayEnvironment: Environment | null = null

function createRelayNetwork() {
  return Network.create(async ({ text: query }, variables) => {
    const response = await fetch(process.env.NEXT_PUBLIC_GRAPHQL_API_ENDPOINT as string, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_GITHUB_API_TOKEN}`,
      }, // Add authentication and other headers here
      body: JSON.stringify({ query, variables }),
    })

    if (response.status !== 200) {
      console.error(await response.text())
      throw new Error('Relay Network Error: Invalid response from server')
    }

    return (await response.json()) as GraphQLResponse
  })
}

export const initEnvironment = (records = {}): Environment => {
  const source = new RecordSource(records)
  const store = new Store(source, { gcReleaseBufferSize: 10 })

  // Create a new instance of Relay environment for every server-side request
  if (typeof window === 'undefined') {
    return new Environment({
      configName: 'server',
      network: createRelayNetwork(),
      store,
      isServer: true,
    })
  }

  // Reuse Relay environment on client-side
  if (!relayEnvironment) {
    relayEnvironment = new Environment({
      configName: 'client',
      network: createRelayNetwork(),
      store,
      isServer: false,
    })
  }

  return relayEnvironment
}

export function useRelayEnvironment(initialRecords = {}) {
  return useMemo(() => {
    return initEnvironment(initialRecords)
  }, [initialRecords])
}

export function dehydrateStore(environment: Environment) {
  return environment.getStore().getSource().toJSON()
}

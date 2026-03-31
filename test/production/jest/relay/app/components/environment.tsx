import { Environment, Network, RecordSource, Store } from 'relay-runtime'

async function fetchGraphQL(text, variables) {
  return new Promise((next) => {
    const res = () => {
      return next({ data: { viewer: { user: { id: '123', name: 'Foo' } } } })
    }

    setTimeout(res, 1000)
  })
}

// Relay passes a "params" object with the query name and text. So we define a helper function
// to call our fetchGraphQL utility with params.text.
async function fetchRelay(params, variables) {
  return await fetchGraphQL(params.text, variables)
}

// Export a singleton instance of Relay Environment configured with our network function:
export default new Environment({
  network: Network.create(fetchRelay),
  store: new Store(new RecordSource()),
})

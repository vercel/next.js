const defaultOpts = { useCache: true }
/**
 * Returns the result of a GraphQL query. It also adds the result to the
 * cache of the GraphQL client for better initial data population in pages.
 *
 * Note: This helper tries to imitate what the query hooks of `graphql-hooks`
 * do internally to make sure we generate the same cache key
 */
export default async function graphQLRequest(client, query, options) {
  const opts = { ...defaultOpts, ...options }
  const operation = {
    query,
    variables: opts.variables,
    operationName: opts.operationName,
    persisted: opts.persisted,
  }

  if (opts.persisted || (client.useGETForQueries && !opts.isMutation)) {
    opts.fetchOptionsOverrides = {
      ...opts.fetchOptionsOverrides,
      method: 'GET',
    }
  }

  const cacheKey = client.getCacheKey(operation, opts)
  const cacheValue = await client.request(operation, opts)

  client.saveCache(cacheKey, cacheValue)
  return cacheValue
}

import { findResultsState } from 'react-instantsearch-dom/server'
import algoliasearch from 'algoliasearch/lite'

const indexName = 'instant_search'

// Keys are supplied from Algolio's instant search example
// https://github.com/algolia/react-instantsearch
const searchClient = algoliasearch(
  'latency',
  '6be0576ff61c053d5f9a3225e2a90f76'
)

export { findResultsState, indexName, searchClient }

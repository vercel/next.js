import { createClient } from 'urql'

/**
 * Needed because `window.fetch` will not be available in `getStaticProps`,
 * `window.fetch` is what `urql` uses under the hood
 */
import 'isomorphic-unfetch'

export const client = createClient({
  url: 'https://graphql-pokemon.now.sh/',
})

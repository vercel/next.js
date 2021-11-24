import { createClient } from 'urql'

export const client = createClient({
  url: 'https://graphql-pokemon.vercel.app/',
})

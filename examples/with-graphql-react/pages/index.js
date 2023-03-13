import { useGraphQL } from 'graphql-react'

export default function IndexPage() {
  const { loading, cacheValue: { data } = {} } = useGraphQL({
    fetchOptionsOverride(options) {
      options.url = 'https://graphql-pokemon.vercel.app'
    },
    operation: {
      query: /* GraphQL */ `
        {
          pokemon(name: "Pikachu") {
            name
            image
          }
        }
      `,
    },
    loadOnMount: true,
    loadOnReload: true,
    loadOnReset: true,
  })

  return data ? (
    <img src={data.pokemon.image} alt={data.pokemon.name} />
  ) : loading ? (
    <p>Loading…</p>
  ) : (
    <p>Error!</p>
  )
}

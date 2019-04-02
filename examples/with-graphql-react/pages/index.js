import { useGraphQL } from 'graphql-react'

export default () => {
  const { loading, cacheValue = {} } = useGraphQL({
    fetchOptionsOverride (options) {
      options.url = 'https://graphql-pokemon.now.sh'
    },
    operation: {
      query: `
        {
          pokemon(name: "Pikachu") {
            name
            image
          }
        }
     `
    }
  })

  const { data } = cacheValue
  return data ? (
    <img src={data.pokemon.image} alt={data.pokemon.name} />
  ) : loading ? (
    <p>Loading…</p>
  ) : (
    <p>Error!</p>
  )
}

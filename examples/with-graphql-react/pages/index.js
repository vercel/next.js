import { Query } from 'graphql-react'

export default () => (
  <Query
    loadOnMount
    loadOnReset
    fetchOptionsOverride={options => {
      options.url = 'https://graphql-pokemon.now.sh'
    }}
    operation={{
      query: /* GraphQL */ `
        {
          pokemon(name: "Pikachu") {
            name
            image
          }
        }
      `
    }}
  >
    {({ data, loading }) =>
      data ? (
        <img src={data.pokemon.image} alt={data.pokemon.name} />
      ) : loading ? (
        <p>Loading…</p>
      ) : (
        <p>Error!</p>
      )
    }
  </Query>
)

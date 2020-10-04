import { client } from './client'
const firstTwentyPokemonsQuery = `
  query firstTwentyPokemons {
    pokemons(first: 20) {
      image
      name
    }
  }
`

export const getPokemons = async () => {
  const {
    data: { pokemons },
  } = await client.query(firstTwentyPokemonsQuery).toPromise()

  return pokemons.map((pokemon) => ({
    ...pokemon,
    name: pokemon.name.toLowerCase(),
  }))
}

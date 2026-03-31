import { client } from "./client";

const pokemonQuery = `
  query firstTwentyPokemons($name: String!) {
    pokemon(name: $name) {
      name
      image
    }
  }
`;

export const getPokemon = async (name) => {
  const {
    data: { pokemon },
  } = await client.query(pokemonQuery, { name }).toPromise();

  return pokemon;
};

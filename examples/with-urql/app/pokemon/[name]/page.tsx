import { getPokemon as getPokemonByName } from "../../../graphql/getPokemon";

export default async function PokemonPage({ params }: { params: { name?: string } }) {
  if (!params?.name) {
    return <p>Loading...</p>; 
  }

  const pokemon = await getPokemonByName(params.name);

  if (!pokemon) {
    return <p>Pokémon not found!</p>; 
  }

  return (
    <div>
      <h1 style={{ textTransform: "capitalize" }}>{pokemon.name}</h1>
      <img src={pokemon.image} alt={pokemon.name} />
    </div>
  );
}

import { getPokemon as getPokemonByName } from "@/graphql/getPokemon";

export default async function PokemonPage({
  params,
}: {
  params: { name?: string };
}) {
  const pokemon = await getPokemonByName(params.name);
  return (
    <div>
      <h1 style={{ textTransform: "capitalize" }}>{pokemon.name}</h1>
      <img src={pokemon.image} alt={pokemon.name} />
    </div>
  );
}

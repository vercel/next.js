import Link from "next/link";
import { getPokemons } from "@/graphql/getPokemons";

type Pokemon = {
  image: string;
  name: string;
  __typename: string;
};

export default async function Home() {
  const pokemons = await getPokemons();

  return (
    <ul>
      {pokemons.map((pokemon: Pokemon) => (
        <li key={pokemon.name}>
          <Link href={`/pokemon/${pokemon.name}`}>
            <h2 style={{ textTransform: "capitalize" }}>{pokemon.name}</h2>
            <img src={pokemon.image} alt={`${pokemon.name} picture`} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

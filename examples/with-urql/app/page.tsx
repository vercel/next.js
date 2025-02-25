import Link from "next/link";
import { getPokemons } from "../graphql/getPokemons";

export default async function Home() {
  const pokemons = await getPokemons();

  return (
    <ul>
      {pokemons.map((pokemon) => (
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

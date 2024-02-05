import { getPokemon } from "../../graphql/getPokemon";
import { getPokemons } from "../../graphql/getPokemons";

export default function Pokemon({ pokemon }) {
  return (
    <div>
      <h1>{pokemon.name}</h1>
      <img src={pokemon.image} />
    </div>
  );
}

export const getStaticPaths = async () => {
  const pokemons = await getPokemons();

  return {
    paths: pokemons.map(({ name }) => ({
      params: { name },
    })),
    fallback: true,
  };
};

export const getStaticProps = async (context) => {
  const { name } = context.params;
  const pokemon = await getPokemon(name);

  return {
    props: {
      pokemon,
    },
  };
};

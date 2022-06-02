import Link from 'next/link'
import { getPokemons } from '../graphql/getPokemons'

export default function Home({ pokemons }) {
  return (
    <ul>
      {pokemons.map((pokemon) => (
        <li key={pokemon.name}>
          <Link as={`/pokemon/${pokemon.name}`} href="/pokemon/[name]">
            <a>
              <h2 style={{ textTransform: 'capitalize' }}>{pokemon.name}</h2>
              <img src={pokemon.image} alt={`${pokemon.name} picture`} />
            </a>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export const getStaticProps = async () => {
  const pokemons = await getPokemons()
  return {
    props: {
      pokemons,
    },
  }
}

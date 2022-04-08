import type { NextPage } from 'next'
import Image from 'next/image'
import { request, gql } from 'graphql-request'

const query = gql`
  {
    pokemons(first: 10) {
      id
      name
      image
    }
  }
`

interface Props {
  pokemons: Array<{ id: string, name: string, image: string }>
}

export async function getStaticProps() {
  const { pokemons } = await request(process.env.HASURA_GRAPHQL_URL!, query)
  return {
    props: {
      pokemons,
    },
  }
}

const Home: NextPage<Props> = ({ pokemons }) => {
  const cards = pokemons.map(pokemon => <Image key={pokemon.id} src={pokemon.image} alt={pokemon.name} height="200" width="200"></Image>)
  return (
    <main>{cards}</main>
  )
}

export default Home

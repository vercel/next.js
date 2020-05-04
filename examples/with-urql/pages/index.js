import { useQuery } from 'urql'
const PikachuQuery = `
  {
    pokemon(name: "pikachu") {
      name
      image
    }
  }
`

export default () => {
  const [{ data, fetching, error }] = useQuery({ query: PikachuQuery })
  if (fetching) {
    return <div>Loading...</div>
  }
  if (error) {
    return <div>{error.message}</div>
  }

  return (
    <div>
      <h2>{data.pokemon.name}</h2>
      <img src={data.pokemon.image} alt={`${data.pokemon.name} picture`} />
    </div>
  )
}

import { graphql, useFragment } from 'react-relay'

export const CharacterTable = ({ film }) => {
  const data = useFragment(
    graphql`
      fragment characterTable_film on Film {
        id
        title
        characterConnection {
          edges {
            node {
              id
              name
              height
              species {
                id
                name
                averageHeight
              }
              homeworld {
                id
                name
              }
            }
          }
        }
      }
    `,
    film
  )

  return (
    <div>
      <strong>Characters of {data.title}</strong>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Species</th>
            <th>Height</th>
            <th>Homeworld</th>
          </tr>
        </thead>
        <tbody>
          {data.characterConnection.edges.map(({ node: character }) => (
            <tr key={character.id}>
              <td>{character.name}</td>
              <td>{character.species?.name}</td>
              <td>
                {character.height < character.species?.averageHeight
                  ? 'Below Average'
                  : character.height > character.species?.averageHeight
                  ? 'Above Average'
                  : 'Average'}
              </td>
              <td>{character.homeworld?.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

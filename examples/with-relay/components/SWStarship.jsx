import { Fragment } from 'react'
import { graphql, useFragment } from 'react-relay'
import { SWPilot } from './SWPilot'

export const SWStarship = ({ starship }) => {
  const data = useFragment(
    graphql`
      fragment SWStarship_starship on Starship {
        id
        name
        pilotConnection {
          totalCount
          edges {
            node {
              id
              ...SWPilot_person
            }
          }
        }
      }
    `,
    starship
  )

  return (
    <li>
      <strong>{data.name}</strong>
      <br />
      {data.pilotConnection.totalCount > 0 ? (
        <Fragment>
          Pilots:
          <ul>
            {data.pilotConnection.edges.map(({ node: pilot }) => (
              <SWPilot key={pilot.id} pilot={pilot} />
            ))}
          </ul>
        </Fragment>
      ) : null}
    </li>
  )
}

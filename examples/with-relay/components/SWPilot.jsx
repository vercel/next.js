import { graphql, useFragment } from 'react-relay'

export const SWPilot = ({ pilot }) => {
  const data = useFragment(
    graphql`
      fragment SWPilot_person on Person {
        id
        name
        homeworld {
          id
          name
        }
      }
    `,
    pilot
  )

  return (
    <li>
      {data.name} ({data.homeworld.name})
    </li>
  )
}

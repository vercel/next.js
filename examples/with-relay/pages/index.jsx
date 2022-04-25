import Link from 'next/link'
import { graphql, fetchQuery } from 'react-relay'

import { initializeRelay, finalizeRelay } from '../lib/relay'
import { SWStarship } from '../components/SWStarship'

export async function getStaticProps() {
  const environment = initializeRelay()

  const result = await fetchQuery(
    environment,
    graphql`
      query pagesIndexQuery {
        allStarships(first: 5) {
          edges {
            # This 'node' will be passed to the <SWStarship> component as the
            # 'starship' prop
            node {
              id
              # Must match the named fragment from the <SWStarship> component.
              ...SWStarship_starship
            }
          }
        }
      }
    `
  ).toPromise()

  // Helper function to hydrate the Relay cache client side on page load
  return finalizeRelay(environment, {
    props: {
      // Return the results directly so the component can render immediately
      allStarships: result.allStarships,
    },
    revalidate: 1,
  })
}

const Index = ({ allStarships }) => (
  <div>
    <strong>Home</strong>
    &nbsp;|&nbsp;
    <Link href="/films">
      <a>Films</a>
    </Link>
    <h1>StarWars Starships</h1>
    <ul>
      {allStarships.edges.map(({ node: starship }) => (
        // The `starship` prop gets read by Relay within the SWStarship
        // component to hydrate the data required by the fragment in that
        // component
        <SWStarship key={starship.id} starship={starship} />
      ))}
    </ul>
  </div>
)

export default Index

import { Fragment, Suspense } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  graphql,
  useQueryLoader,
  usePreloadedQuery,
  useFragment,
  fetchQuery,
} from 'react-relay'

import { initializeRelay, finalizeRelay } from '../lib/relay'

// There's a lot going on in this file. It can be broken down into 2 main
// sections, with their own data fetching strategies:
//
// 1. The data to load the initial page.
//    This is the same as pages/index.jsx; using fragments & fetchQuery().
//
// 2. The data & component loaded when a button is clicked.
//    a) We define a `LoadingCharacterTable` placeholder component for when
//       we're loading the component and data.
//    b) We tell Next.js that we'll dynamically import a `CharacterTable`
//       component.
//    c) The query `filmsCharacterQuery` uses a fragment defined in the
//       `CharacterTable` component.
//    d) `useQueryLoader()` gives us a `loadQuery()` method to lazily execute
//       the query defined in 2. c)
//    e) When the button is clicked, we start loading the dynamic component from
//       2. b), and also trigger the query defined in 2. c) by calling
//       `loadQuery()` from 2. d). These two will run in parallel for maximum
//       performance
//    f) A <Suspense> boundary is rendered using the loading component in 2. a).
//    g) `usePreloadedQuery()` Attempts to read the result of calling
//       `loadQuery()` in 2. e). If the query hasn't completed yet, it will
//       trigger the <Suspense> boundary from 2. f)
//    h) Once 2. g) passes, React will attempt to render our dynamic component
//       from 2. b). If it's still loading, it will render the loading component
//       from 2. a).

export async function getStaticProps() {
  const environment = initializeRelay()

  const result = await fetchQuery(
    environment,
    graphql`
      query filmsPageQuery {
        allFilms(first: 10) {
          edges {
            node {
              id
              ...films
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
      allFilms: result.allFilms,
    },
    revalidate: 1,
  })
}

// 2. a)
const LoadingCharacterTable = () => 'Loading characters...'

// 2. b)
const CharacterTable = dynamic(
  () =>
    import('../components/character-table').then((mod) => mod.CharacterTable),
  // NOTE: Can't use Next.js's suspense mode here; it will disable our ability
  // to preload the component on button click.
  // Instead, we use the same component here as we do for the Relay <Suspense
  // fallback="..."> boundary.
  { loading: LoadingCharacterTable }
)

// 2. c)
const filmsCharacterQuery = graphql`
  query filmsCharacterQuery($id: ID!) {
    film(id: $id) {
      ...characterTable_film
    }
  }
`

const FilmCharacterTable = ({ queryReference }) => {
  // 2. g)
  const data = usePreloadedQuery(filmsCharacterQuery, queryReference)
  // 2. h)
  return <CharacterTable film={data.film} />
}

// This component is always rendered on this page, so it's inlined into this
// file. It could also be extracted into a separate file.
const Film = ({ film }) => {
  const data = useFragment(
    // Notice this fragment does _not_ include any character information. That
    // will be loaded lazily when the button is clicked
    graphql`
      fragment films on Film {
        # NOTE: We also request the 'id' field in the root query for this page.
        # Relay is smart enough to dedupe this field for us, reducing the
        # scope of maintenance to where the field is read.
        id
        title
        episodeID
      }
    `,
    film
  )

  // 2. d)
  const [queryReference, loadQuery] = useQueryLoader(filmsCharacterQuery)

  return (
    <Fragment>
      Episode {data.episodeID}: {data.title}
      <br />
      {queryReference == null ? (
        <button
          onClick={() => {
            // 2. e)
            // Start downloading the JS for the component (NOTE: This API is
            // undocumented in Next.js)
            CharacterTable.render.preload()
            // In parallel, trigger the query
            loadQuery({ id: data.id })
          }}
          disabled={queryReference != null}
        >
          Load Characters
        </button>
      ) : (
        // 2. f)
        // NOTE: The fallback component here is the same as used for the dynamic
        // component's `loading` prop
        <Suspense fallback={<LoadingCharacterTable />}>
          <FilmCharacterTable queryReference={queryReference} />
        </Suspense>
      )}
    </Fragment>
  )
}

const FilmsPage = ({ allFilms }) => (
  <div>
    <style jsx>{`
      li {
        margin-bottom: 1em;
      }
    `}</style>
    <Link href="/">
      <a>Home</a>
    </Link>
    &nbsp;|&nbsp;
    <strong>Films</strong>
    <h1>StarWars Films</h1>
    <ul>
      {allFilms.edges.map(({ node: film }) => (
        <li key={film.id}>
          <Film film={film} />
        </li>
      ))}
    </ul>
  </div>
)

export default FilmsPage

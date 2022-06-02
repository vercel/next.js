import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { gql, useQuery } from '@apollo/client'
import Header from '../../components/header'
import Footer from '../../components/footer'

const GET_ACTOR = gql`
  query GetActor($actorName: String) {
    getActor(filter: { name: $actorName }) {
      name
      born
      movies {
        title
      }
    }
  }
`

export default function Actor() {
  const router = useRouter()
  const { name } = router.query
  const { loading, error, data } = useQuery(GET_ACTOR, {
    actorName: name,
  })

  if (loading) return 'Loading...'
  if (error) return `Error! ${error.message}`

  return (
    <div className="container">
      <Head>
        <title>Next with Neo4j</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Header title={name} />

      <main>
        <div className="actor">
          <div className="info">
            <h2>Information</h2>
            <div>
              <strong>Born: </strong>
              {data.getActor.born}
            </div>
          </div>
          <div className="movies">
            <h2>Movies</h2>
            {data.getActor.movies.map((movie) => (
              <div key={movie.title}>
                <Link
                  href="/movie/[title]"
                  as={{
                    pathname: `/movie/${encodeURIComponent(movie.title)}`,
                  }}
                >
                  <a>{movie.title}</a>
                </Link>
              </div>
            ))}
          </div>
        </div>

        <div className="back">
          <Link href="/">
            <a>🔙 Go Back</a>
          </Link>
        </div>
      </main>

      <Footer />

      <style jsx>
        {`
          .container {
            width: 100vw;
            min-height: 100vh;
            padding: 0 0.5rem;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
          }
          main {
            display: flex;
            width: 100%;
            justify-content: center;
            padding: 2rem 0;
            text-align: center;
            flex-direction: column;
          }
          .actor {
            margin-bottom: 2rem;
          }
          .movies div {
            margin-bottom: 5px;
          }
          .movies a {
            text-decoration: underline;
          }
          .back {
            padding: 1rem 0;
          }
          .back a {
            font-weight: bold;
          }
        `}
      </style>
    </div>
  )
}

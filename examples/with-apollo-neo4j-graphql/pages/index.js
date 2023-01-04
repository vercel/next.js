import Head from 'next/head'
import Link from 'next/link'
import { gql, useQuery } from '@apollo/client'
import Header from '../components/header'
import Footer from '../components/footer'

const GET_MOVIES = gql`
  query GetMovies {
    getMovies {
      title
      tagline
      released
      actors {
        name
      }
      directors {
        name
      }
    }
  }
`

export default function Home() {
  const { loading, error, data } = useQuery(GET_MOVIES)

  if (loading) return 'Loading...'
  if (error) return `Error! ${error.message}`

  return (
    <div className="container">
      <Head>
        <title>Next with Neo4j</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Header />
      <main>
        <div className="movies">
          <div className="subtitle">
            <p>
              <strong>"Movies"</strong> Neo4j example dataset.
            </p>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Movie Title</th>
                <th>Released</th>
                <th>Tagline</th>
                <th>Directed</th>
                <th>Actors</th>
              </tr>
            </thead>
            <tbody>
              {data.getMovies.map((movie, index) => (
                <tr className="movie" key={movie.title}>
                  <th>{index + 1}</th>
                  <td>
                    <Link
                      href="/movie/[title]"
                      as={{
                        pathname: `/movie/${encodeURIComponent(movie.title)}`,
                      }}
                      legacyBehavior
                    >
                      <a className="link">{movie.title}</a>
                    </Link>
                  </td>
                  <td>{movie.released}</td>
                  <td>{movie.tagline}</td>
                  <td>
                    <ul>
                      {movie.directors.map((director) => (
                        <li key={director.name}>{director.name}</li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    <ul>
                      {movie.actors.map((actor) => (
                        <li key={actor.name}>
                          <Link
                            href="/actor/[name]"
                            as={{
                              pathname: `/actor/${encodeURIComponent(
                                actor.name
                              )}`,
                            }}
                            legacyBehavior
                          >
                            <a className="link">{actor.name}</a>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      <Footer />

      <style jsx>{`
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
        }
        .subtitle {
          margin-bottom: 25px;
          text-align: center;
        }
        .movies {
          flex: 1;
          padding: 0 5rem;
        }

        table {
          width: 100%;
          border: 1px solid #dee2e6;
          border-collapse: collapse;
          border-spacing: 2px;
        }

        table thead th {
          vertical-align: middle;
          border-bottom: 2px solid #dee2e6;
          border: 1px solid #dee2e6;
          border-bottom-width: 2px;
          padding: 0.75rem;
        }

        table tbody th,
        table tbody td {
          border: 1px solid #dee2e6;
          padding: 0.75rem;
          vertical-align: middle;
        }

        .link {
          text-decoration: underline;
        }
      `}</style>
    </div>
  )
}

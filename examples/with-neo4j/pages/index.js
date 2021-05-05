import Head from 'next/head'
import Link from 'next/link'
import useSWR from 'swr'
import fetcher from '../lib/fetcher'
import Header from '../components/header'
import Footer from '../components/footer'

export default function Home() {
  const { data, error } = useSWR('/api/movies', fetcher)

  if (error) return <div>failed to load</div>
  if (!data) return <div>loading...</div>

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
              {data.movies.map((movie, index) => (
                <tr className="movie" key={movie.title}>
                  <th>{index + 1}</th>
                  <td>
                    <Link
                      href="/movie/[title]"
                      as={{
                        pathname: `/movie/${encodeURIComponent(movie.title)}`,
                      }}
                    >
                      <a className="link">{movie.title}</a>
                    </Link>
                  </td>
                  <td>{movie.released.low}</td>
                  <td>{movie.tagline}</td>
                  <td>
                    <ul>
                      {movie.directed.map((director) => (
                        <li key={director}>{director}</li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    <ul>
                      {movie.actors.map((actor) => (
                        <li key={actor}>
                          <Link
                            href="/actor/[name]"
                            as={{
                              pathname: `/actor/${encodeURIComponent(actor)}`,
                            }}
                          >
                            <a className="link">{actor}</a>
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

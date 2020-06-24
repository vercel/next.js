import { FIND_MOVIES } from '../lib/graphql-operations'
import { APP_ID } from '../lib/RealmClient'
import { useQuery } from '@apollo/react-hooks'

const IndexPage = () => {
  const { loading, error, data } = useQuery(FIND_MOVIES, {
    query: { year: 2014, rated: 'PG' },
  })

  if (error) {
    console.log(error.message)
  }

  const movies = data ? data.movies : null

  return (
    <>
      <div className="App">
        <h1>"PG" Rated Movies - 2014</h1>

        {APP_ID === 'realm-example-bspbt' ? (
          <div className="status">Replace REALM_APP_ID with your App ID</div>
        ) : (
          !loading && !movies && <div className="status">No data Found!</div>
        )}

        {movies && (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Runtime</th>
              </tr>
            </thead>
            <tbody>
              {movies.map((movie, index) => {
                return (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td>{movie.title}</td>
                    <td>{movie.runtime}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <style jsx>{`
        th,
        td {
          padding: 15px;
          text-align: left;
        }
        tr:nth-child(even) {
          background-color: #f2f2f2;
        }
        th {
          background-color: #69bef0;
          color: white;
        }
        table {
          width: 100%;
        }
        h1 {
          text-align: center;
          font-family: sans-serif;
        }
        .status {
          text-colour: red;
          text-align: center;
        }
      `}</style>
    </>
  )
}

export default IndexPage

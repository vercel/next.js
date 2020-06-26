import useSWR from 'swr'
import { generateAuthHeader, REALM_GRAPHQL_ENDPOINT } from '../lib/RealmClient'
import { FIND_MOVIES } from '../lib/graphql-operations'

const fetcher = async (url) =>
  fetch(url, {
    method: 'POST',
    headers: await generateAuthHeader(),
    body: JSON.stringify({
      query: FIND_MOVIES,
    }),
  }).then((res) => res.json())

const IndexPage = () => {
  const { data, error } = useSWR(REALM_GRAPHQL_ENDPOINT, fetcher)

  const movies = data ? data.data.movies : null

  if (error) {
    console.log(error.message)
  }

  return (
    <>
      <div className="App">
        <h1>"PG" Rated Movies - 2014</h1>

        {data && !movies && <div className="status">No movies Found</div>}

        {data && (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Runtime</th>
              </tr>
            </thead>
            <tbody>
              {data &&
                movies.map((movie, index) => {
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

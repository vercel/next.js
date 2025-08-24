import useSWR from "swr";
import { generateAuthHeader, REALM_GRAPHQL_ENDPOINT } from "../lib/RealmClient";

const FIND_MOVIES = `
  query FindMovies{
    movies(query: { year: 2014, rated: "PG" } ) {
      title
      year
      runtime
    }
  }
`;

const fetcher = async (query) =>
  fetch(REALM_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: await generateAuthHeader(),
    body: JSON.stringify({ query }),
  }).then((res) => res.json());

const IndexPage = () => {
  const { data } = useSWR(FIND_MOVIES, fetcher);

  if (data && data.error) {
    console.error(data.error);
    return <p>An error occurred: ${data.error}</p>;
  }
  const movies = data ? data.data.movies : null;

  return (
    <>
      <div className="App">
        <h1>"PG" Rated Movies - 2014</h1>

        {data ? (
          !movies && <div className="status">No movies Found</div>
        ) : (
          <div className="status"> Fetching data...</div>
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
                );
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
          text-color: red;
          text-align: center;
        }
      `}</style>
    </>
  );
};

export default IndexPage;

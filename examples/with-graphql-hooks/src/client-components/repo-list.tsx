import { useQuery } from "graphql-hooks";

const getRepo = /* GraphQL */ `
  query {
    launchLatest {
      mission_name
    }
  }
`;

export function RepoList() {
  const { loading, error, data } = useQuery(getRepo);
  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {JSON.stringify(error)}</p>;

  return <div>{data.launchLatest.mission_name}</div>;
}

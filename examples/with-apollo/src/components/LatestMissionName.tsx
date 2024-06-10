import { getClient } from "@/lib/ApolloClient";
import { TypedDocumentNode, gql } from "@apollo/client";

export const getLatestMissionName: TypedDocumentNode<{
  launchLatest: {
    mission_name: string;
  };
}> = gql`
  query {
    launchLatest {
      mission_name
    }
  }
`;

/**
 * Example Server Component that uses Apollo Client for data fetching.
 */
export async function LatestMissionName() {
  const { data } = await getClient().query({
    query: getLatestMissionName,
  });

  return <div>{data.launchLatest.mission_name}</div>;
}

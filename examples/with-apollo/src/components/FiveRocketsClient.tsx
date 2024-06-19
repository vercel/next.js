"use client";

import { TypedDocumentNode, gql, useSuspenseQuery } from "@apollo/client";

export const getRockets: TypedDocumentNode<
  {
    rockets: Array<{
      id: string;
      name: string;
    }>;
  },
  {
    limit: number;
  }
> = gql`
  query GetRockets($limit: Int) {
    rockets(limit: $limit) {
      id
      name
    }
  }
`;

/**
 * Example Client Component that uses Apollo Client's `useSuspenseQuery` hook for data fetching.
 */
export function FiveRockets() {
  const { data } = useSuspenseQuery(getRockets, {
    variables: { limit: 5 },
  });

  return (
    <ul>
      {data.rockets.map((rocket) => (
        <li key={rocket.id}>{rocket.name}</li>
      ))}
    </ul>
  );
}

// app/components/Viewer.tsx
'use client';  // Make sure this is a client component
import { useQuery } from '@apollo/client';
// import { ViewerQuery } from '../';

import { gql } from '@apollo/client';

const ViewerQuery = gql`
  query ViewerQuery {
    viewer {
      id
      name
      status
    }
  }
`;
const Viewer = () => {
  const { data, loading, error } = useQuery(ViewerQuery);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <div>
      You're signed in as {data.viewer.name} and you're {data.viewer.status}.
    </div>
  );
};

export default Viewer;

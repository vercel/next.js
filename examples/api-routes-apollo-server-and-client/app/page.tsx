// app/page.tsx
import { gql } from '@apollo/client';
import { initializeApollo } from './apollo/client';
import Link from 'next/link';

// Define the GraphQL query
const ViewerQuery = gql`
  query ViewerQuery {
    viewer {
      id
      name
      status
    }
  }
`;

// Function to fetch data from Apollo on the server side
async function fetchViewer() {
  const apolloClient = initializeApollo();  // Initialize Apollo client (server-side)
  const { data } = await apolloClient.query({
    query: ViewerQuery,
  });
  return data.viewer;
}

// Server Component that fetches data and passes it to a Client Component
export default async function HomePage() {
  const viewer = await fetchViewer();  // Fetch the data server-side

  return (
    <div>
    You're signed in as {viewer.name} and you're {viewer.status} goto{" "}
    <Link href="/about">static</Link> page.
  </div>
  );
}

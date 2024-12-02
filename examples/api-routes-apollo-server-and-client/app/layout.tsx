// app/layout.tsx
'use client';  // This directive makes this file a Client Component
import { ApolloProvider } from '@apollo/client';
import { useApollo } from './apollo/client';  // Import your Apollo client initialization

export default function Layout({ children }: { children: React.ReactNode }) {
  // Apollo Client initialization here
  const apolloClient = useApollo();  // This hook works only on the client side

  return (
    <ApolloProvider client={apolloClient}>
      {children}  {/* All child pages/components will have access to Apollo Client */}
    </ApolloProvider>
  );
}

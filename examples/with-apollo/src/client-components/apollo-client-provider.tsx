import { ApolloClient, ApolloProvider, InMemoryCache } from "@apollo/client";

export const client = new ApolloClient({
  // URL retrieved from official apollo graphql blog
  // See https://www.apollographql.com/blog/using-apollo-client-with-next-js-13-releasing-an-official-library-to-support-the-app-router
  uri: "https://main--spacex-l4uc6p.apollographos.net/graphql",
  cache: new InMemoryCache(),
});

export function ApolloClientProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}

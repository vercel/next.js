import { ApolloClient, InMemoryCache } from "@apollo/client";

const client = new ApolloClient({
  uri: process.env.PREPRIO_API,
  cache: new InMemoryCache(),
});

export default client;
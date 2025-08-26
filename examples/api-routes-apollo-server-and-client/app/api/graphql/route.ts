// app/api/graphql/route.ts
import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import { schema } from '../../apollo/schema';

const apolloServer = new ApolloServer({ schema });

export const handler = startServerAndCreateNextHandler(apolloServer);

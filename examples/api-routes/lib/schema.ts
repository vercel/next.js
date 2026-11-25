import { createSchema } from "graphql-yoga";
import { findUser, users } from "./users";

export const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type User {
      id: ID!
      name: String!
    }

    type Query {
      users: [User!]!
      user(id: ID!): User
    }
  `,
  resolvers: {
    Query: {
      users: () => users,
      user: (_parent: unknown, { id }: { id: string }) => findUser(id) ?? null,
    },
  },
});

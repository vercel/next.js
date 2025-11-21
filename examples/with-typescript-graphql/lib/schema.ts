const typeDefs = /* GraphQL */ `
  type User {
    id: ID!
    name: String!
    status: String!
  }

  type Query {
    viewer: User!
  }

  type Mutation {
    updateName(name: String!): User!
  }
`;

export default typeDefs;

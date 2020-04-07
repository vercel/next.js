import gql from 'graphql-tag'

export const typeDefs = gql`
  type Post {
    id: ID!
    title: String!
    updatedAt: String!
    url: String!
    votes: Int!
  }

  type PostsMeta {
    count: Int!
  }

  type Query {
    allPosts(first: Int!, skip: Int!): [Post!]!
    _allPostsMeta: PostsMeta!
  }
`

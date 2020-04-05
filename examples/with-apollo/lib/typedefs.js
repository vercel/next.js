import gql from 'graphql-tag'

export const typeDefs = gql`
  type Post {
    id: ID!
    createdAt: String!
    title: String!
    updatedAt: String!
    url: String!
    votes: Int!
  }

  type PostsMeta {
    count: Int!
  }

  type Query {
    allPosts: [Post!]!
    _allPostsMeta: PostsMeta!
  }
`

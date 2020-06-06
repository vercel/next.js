const remoteTypeDefs = `
directive @embedded on OBJECT
directive @collection(name: String!) on OBJECT
directive @index(name: String!) on FIELD_DEFINITION
directive @resolver(
  name: String
  paginated: Boolean! = false
) on FIELD_DEFINITION
directive @relation(name: String) on FIELD_DEFINITION
directive @unique(index: String) on FIELD_DEFINITION
input CreateUserInput {
  email: String!
  password: String!
  role: UserRole!
}

scalar Date

input LoginUserInput {
  email: String!
  password: String!
}

# The 'Long' scalar type represents non-fractional signed whole numeric values.
# Long can represent values between -(2^63) and 2^63 - 1.
scalar Long

type Mutation {
  logoutUser: Boolean!
  # Update an existing document in the collection of 'User'
  updateUser(
    # The 'User' document's ID
    id: ID!
    # 'User' input values
    data: UserInput!
  ): User
  createUser(data: CreateUserInput!): User!
  loginUser(data: LoginUserInput!): String!
  # Delete an existing document in the collection of 'User'
  deleteUser(
    # The 'User' document's ID
    id: ID!
  ): User
  signupUser(data: CreateUserInput!): String!
}

type Query {
  # Find a document from the collection of 'User' by its id.
  findUserByID(
    # The 'User' document's ID
    id: ID!
  ): User
}

scalar Time

type User {
  # The document's ID.
  _id: ID!
  # The document's timestamp.
  _ts: Long!
  email: String!
  role: UserRole!
}

# 'User' input values
input UserInput {
  email: String!
  role: UserRole!
}

enum UserRole {
  ADMIN
  FREE_USER
}
`

export { remoteTypeDefs }

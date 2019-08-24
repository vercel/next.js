import gql from 'graphql-tag'

export const typeDefs = gql`
  enum _ModelMutationType {
    CREATED
    UPDATED
    DELETED
  }

  type _QueryMeta {
    count: Int!
  }

  input AUTH_PROVIDER_EMAIL {
    email: String!
    password: String!
  }

  input AuthProviderSignupData {
    email: AUTH_PROVIDER_EMAIL
  }

  input CreateFile {
    name: String!
  }

  input CreatePost {
    title: String!
    url: String!
    votes: Int
  }

  input CreateUser {
    firstName: String!
    lastName: String!
  }

  scalar DateTime

  type File implements Node {
    contentType: String!
    createdAt: DateTime
    id: ID!
    name: String!
    secret: String!
    size: Int!
    updatedAt: DateTime
    url: String!
  }

  input FileFilter {
    AND: [FileFilter!]
    OR: [FileFilter!]
    contentType: String
    contentType_not: String
    contentType_in: [String!]
    contentType_not_in: [String!]
    contentType_lt: String
    contentType_lte: String
    contentType_gt: String
    contentType_gte: String
    contentType_contains: String
    contentType_not_contains: String
    contentType_starts_with: String
    contentType_not_starts_with: String
    contentType_ends_with: String
    contentType_not_ends_with: String
    createdAt: DateTime
    createdAt_not: DateTime
    createdAt_in: [DateTime!]
    createdAt_not_in: [DateTime!]
    createdAt_lt: DateTime
    createdAt_lte: DateTime
    createdAt_gt: DateTime
    createdAt_gte: DateTime
    id: ID
    id_not: ID
    id_in: [ID!]
    id_not_in: [ID!]
    id_lt: ID
    id_lte: ID
    id_gt: ID
    id_gte: ID
    id_contains: ID
    id_not_contains: ID
    id_starts_with: ID
    id_not_starts_with: ID
    id_ends_with: ID
    id_not_ends_with: ID
    name: String
    name_not: String
    name_in: [String!]
    name_not_in: [String!]
    name_lt: String
    name_lte: String
    name_gt: String
    name_gte: String
    name_contains: String
    name_not_contains: String
    name_starts_with: String
    name_not_starts_with: String
    name_ends_with: String
    name_not_ends_with: String
    secret: String
    secret_not: String
    secret_in: [String!]
    secret_not_in: [String!]
    secret_lt: String
    secret_lte: String
    secret_gt: String
    secret_gte: String
    secret_contains: String
    secret_not_contains: String
    secret_starts_with: String
    secret_not_starts_with: String
    secret_ends_with: String
    secret_not_ends_with: String
    size: Int
    size_not: Int
    size_in: [Int!]
    size_not_in: [Int!]
    size_lt: Int
    size_lte: Int
    size_gt: Int
    size_gte: Int
    updatedAt: DateTime
    updatedAt_not: DateTime
    updatedAt_in: [DateTime!]
    updatedAt_not_in: [DateTime!]
    updatedAt_lt: DateTime
    updatedAt_lte: DateTime
    updatedAt_gt: DateTime
    updatedAt_gte: DateTime
    url: String
    url_not: String
    url_in: [String!]
    url_not_in: [String!]
    url_lt: String
    url_lte: String
    url_gt: String
    url_gte: String
    url_contains: String
    url_not_contains: String
    url_starts_with: String
    url_not_starts_with: String
    url_ends_with: String
    url_not_ends_with: String
  }

  enum FileOrderBy {
    contentType_ASC
    contentType_DESC
    createdAt_ASC
    createdAt_DESC
    id_ASC
    id_DESC
    name_ASC
    name_DESC
    secret_ASC
    secret_DESC
    size_ASC
    size_DESC
    updatedAt_ASC
    updatedAt_DESC
    url_ASC
    url_DESC
  }

  type FilePreviousValues {
    contentType: String!
    createdAt: DateTime
    id: ID!
    name: String!
    secret: String!
    size: Int!
    updatedAt: DateTime
    url: String!
  }

  input FileSubscriptionFilter {
    AND: [FileSubscriptionFilter!]
    OR: [FileSubscriptionFilter!]
    mutation_in: [_ModelMutationType!]
    updatedFields_contains: String
    updatedFields_contains_every: [String!]
    updatedFields_contains_some: [String!]
    node: FileSubscriptionFilterNode
  }

  input FileSubscriptionFilterNode {
    contentType: String
    contentType_not: String
    contentType_in: [String!]
    contentType_not_in: [String!]
    contentType_lt: String
    contentType_lte: String
    contentType_gt: String
    contentType_gte: String
    contentType_contains: String
    contentType_not_contains: String
    contentType_starts_with: String
    contentType_not_starts_with: String
    contentType_ends_with: String
    contentType_not_ends_with: String
    createdAt: DateTime
    createdAt_not: DateTime
    createdAt_in: [DateTime!]
    createdAt_not_in: [DateTime!]
    createdAt_lt: DateTime
    createdAt_lte: DateTime
    createdAt_gt: DateTime
    createdAt_gte: DateTime
    id: ID
    id_not: ID
    id_in: [ID!]
    id_not_in: [ID!]
    id_lt: ID
    id_lte: ID
    id_gt: ID
    id_gte: ID
    id_contains: ID
    id_not_contains: ID
    id_starts_with: ID
    id_not_starts_with: ID
    id_ends_with: ID
    id_not_ends_with: ID
    name: String
    name_not: String
    name_in: [String!]
    name_not_in: [String!]
    name_lt: String
    name_lte: String
    name_gt: String
    name_gte: String
    name_contains: String
    name_not_contains: String
    name_starts_with: String
    name_not_starts_with: String
    name_ends_with: String
    name_not_ends_with: String
    secret: String
    secret_not: String
    secret_in: [String!]
    secret_not_in: [String!]
    secret_lt: String
    secret_lte: String
    secret_gt: String
    secret_gte: String
    secret_contains: String
    secret_not_contains: String
    secret_starts_with: String
    secret_not_starts_with: String
    secret_ends_with: String
    secret_not_ends_with: String
    size: Int
    size_not: Int
    size_in: [Int!]
    size_not_in: [Int!]
    size_lt: Int
    size_lte: Int
    size_gt: Int
    size_gte: Int
    updatedAt: DateTime
    updatedAt_not: DateTime
    updatedAt_in: [DateTime!]
    updatedAt_not_in: [DateTime!]
    updatedAt_lt: DateTime
    updatedAt_lte: DateTime
    updatedAt_gt: DateTime
    updatedAt_gte: DateTime
    url: String
    url_not: String
    url_in: [String!]
    url_not_in: [String!]
    url_lt: String
    url_lte: String
    url_gt: String
    url_gte: String
    url_contains: String
    url_not_contains: String
    url_starts_with: String
    url_not_starts_with: String
    url_ends_with: String
    url_not_ends_with: String
  }

  type FileSubscriptionPayload {
    mutation: _ModelMutationType!
    node: File
    updatedFields: [String!]
    previousValues: FilePreviousValues
  }

  input InvokeFunctionInput {
    name: String!
    input: String!
    clientMutationId: String
  }

  type InvokeFunctionPayload {
    result: String!
    clientMutationId: String
  }

  type Mutation {
    createFile(name: String!): File
    createPost(title: String!, url: String!, votes: Int): Post
    updateFile(id: ID!, name: String): File
    updatePost(id: ID!, title: String, url: String, votes: Int): Post
    updateUser(firstName: String, id: ID!, lastName: String): User
    updateOrCreateFile(update: UpdateFile!, create: CreateFile!): File
    updateOrCreatePost(update: UpdatePost!, create: CreatePost!): Post
    updateOrCreateUser(update: UpdateUser!, create: CreateUser!): User
    deleteFile(id: ID!): File
    deletePost(id: ID!): Post
    deleteUser(id: ID!): User
    signinUser(email: AUTH_PROVIDER_EMAIL): SigninPayload!
    createUser(
      firstName: String!
      lastName: String!
      authProvider: AuthProviderSignupData!
    ): User
    invokeFunction(input: InvokeFunctionInput!): InvokeFunctionPayload
  }

  interface Node {
    id: ID!
  }

  type Post implements Node {
    createdAt: DateTime
    id: ID!
    title: String!
    updatedAt: DateTime
    url: String!
    votes: Int
  }

  input PostFilter {
    AND: [PostFilter!]
    OR: [PostFilter!]
    createdAt: DateTime
    createdAt_not: DateTime
    createdAt_in: [DateTime!]
    createdAt_not_in: [DateTime!]
    createdAt_lt: DateTime
    createdAt_lte: DateTime
    createdAt_gt: DateTime
    createdAt_gte: DateTime
    id: ID
    id_not: ID
    id_in: [ID!]
    id_not_in: [ID!]
    id_lt: ID
    id_lte: ID
    id_gt: ID
    id_gte: ID
    id_contains: ID
    id_not_contains: ID
    id_starts_with: ID
    id_not_starts_with: ID
    id_ends_with: ID
    id_not_ends_with: ID
    title: String
    title_not: String
    title_in: [String!]
    title_not_in: [String!]
    title_lt: String
    title_lte: String
    title_gt: String
    title_gte: String
    title_contains: String
    title_not_contains: String
    title_starts_with: String
    title_not_starts_with: String
    title_ends_with: String
    title_not_ends_with: String
    updatedAt: DateTime
    updatedAt_not: DateTime
    updatedAt_in: [DateTime!]
    updatedAt_not_in: [DateTime!]
    updatedAt_lt: DateTime
    updatedAt_lte: DateTime
    updatedAt_gt: DateTime
    updatedAt_gte: DateTime
    url: String
    url_not: String
    url_in: [String!]
    url_not_in: [String!]
    url_lt: String
    url_lte: String
    url_gt: String
    url_gte: String
    url_contains: String
    url_not_contains: String
    url_starts_with: String
    url_not_starts_with: String
    url_ends_with: String
    url_not_ends_with: String
    votes: Int
    votes_not: Int
    votes_in: [Int!]
    votes_not_in: [Int!]
    votes_lt: Int
    votes_lte: Int
    votes_gt: Int
    votes_gte: Int
  }

  enum PostOrderBy {
    createdAt_ASC
    createdAt_DESC
    id_ASC
    id_DESC
    title_ASC
    title_DESC
    updatedAt_ASC
    updatedAt_DESC
    url_ASC
    url_DESC
    votes_ASC
    votes_DESC
  }

  type PostPreviousValues {
    createdAt: DateTime
    id: ID!
    title: String!
    updatedAt: DateTime
    url: String!
    votes: Int
  }

  input PostSubscriptionFilter {
    AND: [PostSubscriptionFilter!]
    OR: [PostSubscriptionFilter!]
    mutation_in: [_ModelMutationType!]
    updatedFields_contains: String
    updatedFields_contains_every: [String!]
    updatedFields_contains_some: [String!]
    node: PostSubscriptionFilterNode
  }

  input PostSubscriptionFilterNode {
    createdAt: DateTime
    createdAt_not: DateTime
    createdAt_in: [DateTime!]
    createdAt_not_in: [DateTime!]
    createdAt_lt: DateTime
    createdAt_lte: DateTime
    createdAt_gt: DateTime
    createdAt_gte: DateTime
    id: ID
    id_not: ID
    id_in: [ID!]
    id_not_in: [ID!]
    id_lt: ID
    id_lte: ID
    id_gt: ID
    id_gte: ID
    id_contains: ID
    id_not_contains: ID
    id_starts_with: ID
    id_not_starts_with: ID
    id_ends_with: ID
    id_not_ends_with: ID
    title: String
    title_not: String
    title_in: [String!]
    title_not_in: [String!]
    title_lt: String
    title_lte: String
    title_gt: String
    title_gte: String
    title_contains: String
    title_not_contains: String
    title_starts_with: String
    title_not_starts_with: String
    title_ends_with: String
    title_not_ends_with: String
    updatedAt: DateTime
    updatedAt_not: DateTime
    updatedAt_in: [DateTime!]
    updatedAt_not_in: [DateTime!]
    updatedAt_lt: DateTime
    updatedAt_lte: DateTime
    updatedAt_gt: DateTime
    updatedAt_gte: DateTime
    url: String
    url_not: String
    url_in: [String!]
    url_not_in: [String!]
    url_lt: String
    url_lte: String
    url_gt: String
    url_gte: String
    url_contains: String
    url_not_contains: String
    url_starts_with: String
    url_not_starts_with: String
    url_ends_with: String
    url_not_ends_with: String
    votes: Int
    votes_not: Int
    votes_in: [Int!]
    votes_not_in: [Int!]
    votes_lt: Int
    votes_lte: Int
    votes_gt: Int
    votes_gte: Int
  }

  type PostSubscriptionPayload {
    mutation: _ModelMutationType!
    node: Post
    updatedFields: [String!]
    previousValues: PostPreviousValues
  }

  type Query {
    allFiles(
      filter: FileFilter
      orderBy: FileOrderBy
      skip: Int
      after: String
      before: String
      first: Int
      last: Int
    ): [File!]!
    allPosts(
      filter: PostFilter
      orderBy: PostOrderBy
      skip: Int
      after: String
      before: String
      first: Int
      last: Int
    ): [Post!]!
    allUsers(
      filter: UserFilter
      orderBy: UserOrderBy
      skip: Int
      after: String
      before: String
      first: Int
      last: Int
    ): [User!]!
    _allFilesMeta(
      filter: FileFilter
      orderBy: FileOrderBy
      skip: Int
      after: String
      before: String
      first: Int
      last: Int
    ): _QueryMeta!
    _allPostsMeta(
      filter: PostFilter
      orderBy: PostOrderBy
      skip: Int
      after: String
      before: String
      first: Int
      last: Int
    ): _QueryMeta!
    _allUsersMeta(
      filter: UserFilter
      orderBy: UserOrderBy
      skip: Int
      after: String
      before: String
      first: Int
      last: Int
    ): _QueryMeta!
    File(id: ID, secret: String, url: String): File
    Post(id: ID): Post
    User(email: String, id: ID): User
    user: User
    node(id: ID!): Node
  }

  type SigninPayload {
    token: String
    user: User
  }

  type Subscription {
    File(filter: FileSubscriptionFilter): FileSubscriptionPayload
    Post(filter: PostSubscriptionFilter): PostSubscriptionPayload
    User(filter: UserSubscriptionFilter): UserSubscriptionPayload
  }

  input UpdateFile {
    id: ID!
    name: String
  }

  input UpdatePost {
    id: ID!
    title: String
    url: String
    votes: Int
  }

  input UpdateUser {
    firstName: String
    id: ID!
    lastName: String
  }

  type User implements Node {
    createdAt: DateTime
    email: String
    firstName: String!
    id: ID!
    lastName: String!
    password: String
    updatedAt: DateTime
  }

  input UserFilter {
    AND: [UserFilter!]
    OR: [UserFilter!]
    createdAt: DateTime
    createdAt_not: DateTime
    createdAt_in: [DateTime!]
    createdAt_not_in: [DateTime!]
    createdAt_lt: DateTime
    createdAt_lte: DateTime
    createdAt_gt: DateTime
    createdAt_gte: DateTime
    email: String
    email_not: String
    email_in: [String!]
    email_not_in: [String!]
    email_lt: String
    email_lte: String
    email_gt: String
    email_gte: String
    email_contains: String
    email_not_contains: String
    email_starts_with: String
    email_not_starts_with: String
    email_ends_with: String
    email_not_ends_with: String
    firstName: String
    firstName_not: String
    firstName_in: [String!]
    firstName_not_in: [String!]
    firstName_lt: String
    firstName_lte: String
    firstName_gt: String
    firstName_gte: String
    firstName_contains: String
    firstName_not_contains: String
    firstName_starts_with: String
    firstName_not_starts_with: String
    firstName_ends_with: String
    firstName_not_ends_with: String
    id: ID
    id_not: ID
    id_in: [ID!]
    id_not_in: [ID!]
    id_lt: ID
    id_lte: ID
    id_gt: ID
    id_gte: ID
    id_contains: ID
    id_not_contains: ID
    id_starts_with: ID
    id_not_starts_with: ID
    id_ends_with: ID
    id_not_ends_with: ID
    lastName: String
    lastName_not: String
    lastName_in: [String!]
    lastName_not_in: [String!]
    lastName_lt: String
    lastName_lte: String
    lastName_gt: String
    lastName_gte: String
    lastName_contains: String
    lastName_not_contains: String
    lastName_starts_with: String
    lastName_not_starts_with: String
    lastName_ends_with: String
    lastName_not_ends_with: String
    password: String
    password_not: String
    password_in: [String!]
    password_not_in: [String!]
    password_lt: String
    password_lte: String
    password_gt: String
    password_gte: String
    password_contains: String
    password_not_contains: String
    password_starts_with: String
    password_not_starts_with: String
    password_ends_with: String
    password_not_ends_with: String
    updatedAt: DateTime
    updatedAt_not: DateTime
    updatedAt_in: [DateTime!]
    updatedAt_not_in: [DateTime!]
    updatedAt_lt: DateTime
    updatedAt_lte: DateTime
    updatedAt_gt: DateTime
    updatedAt_gte: DateTime
  }

  enum UserOrderBy {
    createdAt_ASC
    createdAt_DESC
    email_ASC
    email_DESC
    firstName_ASC
    firstName_DESC
    id_ASC
    id_DESC
    lastName_ASC
    lastName_DESC
    password_ASC
    password_DESC
    updatedAt_ASC
    updatedAt_DESC
  }

  type UserPreviousValues {
    createdAt: DateTime
    email: String
    firstName: String!
    id: ID!
    lastName: String!
    password: String
    updatedAt: DateTime
  }

  input UserSubscriptionFilter {
    AND: [UserSubscriptionFilter!]
    OR: [UserSubscriptionFilter!]
    mutation_in: [_ModelMutationType!]
    updatedFields_contains: String
    updatedFields_contains_every: [String!]
    updatedFields_contains_some: [String!]
    node: UserSubscriptionFilterNode
  }

  input UserSubscriptionFilterNode {
    createdAt: DateTime
    createdAt_not: DateTime
    createdAt_in: [DateTime!]
    createdAt_not_in: [DateTime!]
    createdAt_lt: DateTime
    createdAt_lte: DateTime
    createdAt_gt: DateTime
    createdAt_gte: DateTime
    email: String
    email_not: String
    email_in: [String!]
    email_not_in: [String!]
    email_lt: String
    email_lte: String
    email_gt: String
    email_gte: String
    email_contains: String
    email_not_contains: String
    email_starts_with: String
    email_not_starts_with: String
    email_ends_with: String
    email_not_ends_with: String
    firstName: String
    firstName_not: String
    firstName_in: [String!]
    firstName_not_in: [String!]
    firstName_lt: String
    firstName_lte: String
    firstName_gt: String
    firstName_gte: String
    firstName_contains: String
    firstName_not_contains: String
    firstName_starts_with: String
    firstName_not_starts_with: String
    firstName_ends_with: String
    firstName_not_ends_with: String
    id: ID
    id_not: ID
    id_in: [ID!]
    id_not_in: [ID!]
    id_lt: ID
    id_lte: ID
    id_gt: ID
    id_gte: ID
    id_contains: ID
    id_not_contains: ID
    id_starts_with: ID
    id_not_starts_with: ID
    id_ends_with: ID
    id_not_ends_with: ID
    lastName: String
    lastName_not: String
    lastName_in: [String!]
    lastName_not_in: [String!]
    lastName_lt: String
    lastName_lte: String
    lastName_gt: String
    lastName_gte: String
    lastName_contains: String
    lastName_not_contains: String
    lastName_starts_with: String
    lastName_not_starts_with: String
    lastName_ends_with: String
    lastName_not_ends_with: String
    password: String
    password_not: String
    password_in: [String!]
    password_not_in: [String!]
    password_lt: String
    password_lte: String
    password_gt: String
    password_gte: String
    password_contains: String
    password_not_contains: String
    password_starts_with: String
    password_not_starts_with: String
    password_ends_with: String
    password_not_ends_with: String
    updatedAt: DateTime
    updatedAt_not: DateTime
    updatedAt_in: [DateTime!]
    updatedAt_not_in: [DateTime!]
    updatedAt_lt: DateTime
    updatedAt_lte: DateTime
    updatedAt_gt: DateTime
    updatedAt_gte: DateTime
  }

  type UserSubscriptionPayload {
    mutation: _ModelMutationType!
    node: User
    updatedFields: [String!]
    previousValues: UserPreviousValues
  }
`

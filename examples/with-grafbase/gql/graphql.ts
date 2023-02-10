/* eslint-disable */
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core'
export type Maybe<T> = T | null
export type InputMaybe<T> = Maybe<T>
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K]
}
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>
}
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>
}
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string
  String: string
  Boolean: boolean
  Int: number
  Float: number
  /**
   * A date-time string at UTC, such as 2007-12-03T10:15:30Z, is compliant with the date-time format outlined in section 5.6 of the RFC 3339
   * profile of the ISO 8601 standard for representation of dates and times using the Gregorian calendar.
   *
   * This scalar is a description of an exact instant on the timeline such as the instant that a user account was created.
   *
   * # Input Coercion
   *
   * When expected as an input type, only RFC 3339 compliant date-time strings are accepted. All other input values raise a query error indicating an incorrect type.
   *
   * # Result Coercion
   *
   * Where an RFC 3339 compliant date-time string has a time-zone other than UTC, it is shifted to UTC.
   * For example, the date-time string 2016-01-01T14:10:20+01:00 is shifted to 2016-01-01T13:10:20Z.
   */
  DateTime: any
}

export type Comment = {
  __typename?: 'Comment'
  /** when the model was created */
  createdAt: Scalars['DateTime']
  id: Scalars['ID']
  message: Scalars['String']
  post?: Maybe<Post>
  /** when the model was updated */
  updatedAt: Scalars['DateTime']
}

export type CommentByInput = {
  id?: InputMaybe<Scalars['ID']>
}

/** Input to create a new CommentCommentRelatePostPost */
export type CommentCommentRelatePostPostCreateInput = {
  slug: Scalars['String']
  title: Scalars['String']
}

/** Input to create a new CommentCommentRelatePostPost relation */
export type CommentCommentRelatePostPostCreateRelationInput = {
  create?: InputMaybe<CommentCommentRelatePostPostCreateInput>
  link?: InputMaybe<Scalars['ID']>
}

/** Input to update a CommentCommentRelatePostPost relation */
export type CommentCommentRelatePostPostUpdateRelationInput = {
  create?: InputMaybe<CommentCommentRelatePostPostCreateInput>
  link?: InputMaybe<Scalars['ID']>
  unlink?: InputMaybe<Scalars['ID']>
}

export type CommentConnection = {
  __typename?: 'CommentConnection'
  edges?: Maybe<Array<Maybe<CommentEdge>>>
  /** Information to aid in pagination */
  pageInfo: PageInfo
}

/** Input to create a new Comment */
export type CommentCreateInput = {
  message: Scalars['String']
  post?: InputMaybe<CommentCommentRelatePostPostCreateRelationInput>
}

export type CommentCreatePayload = {
  __typename?: 'CommentCreatePayload'
  comment?: Maybe<Comment>
}

export type CommentDeletePayload = {
  __typename?: 'CommentDeletePayload'
  deletedId: Scalars['ID']
}

export type CommentEdge = {
  __typename?: 'CommentEdge'
  cursor: Scalars['String']
  node: Comment
}

/** Input to create a new Comment */
export type CommentUpdateInput = {
  message?: InputMaybe<Scalars['String']>
  post?: InputMaybe<CommentCommentRelatePostPostUpdateRelationInput>
}

export type CommentUpdatePayload = {
  __typename?: 'CommentUpdatePayload'
  comment?: Maybe<Comment>
}

export type Mutation = {
  __typename?: 'Mutation'
  /** Create a Comment */
  commentCreate?: Maybe<CommentCreatePayload>
  /** Delete a Comment by ID or unique field */
  commentDelete?: Maybe<CommentDeletePayload>
  /** Update a Comment */
  commentUpdate?: Maybe<CommentUpdatePayload>
  /** Create a Post */
  postCreate?: Maybe<PostCreatePayload>
  /** Delete a Post by ID or unique field */
  postDelete?: Maybe<PostDeletePayload>
  /** Update a Post */
  postUpdate?: Maybe<PostUpdatePayload>
}

export type MutationCommentCreateArgs = {
  input: CommentCreateInput
}

export type MutationCommentDeleteArgs = {
  by: CommentByInput
}

export type MutationCommentUpdateArgs = {
  by: CommentByInput
  input: CommentUpdateInput
}

export type MutationPostCreateArgs = {
  input: PostCreateInput
}

export type MutationPostDeleteArgs = {
  by: PostByInput
}

export type MutationPostUpdateArgs = {
  by: PostByInput
  input: PostUpdateInput
}

export type PageInfo = {
  __typename?: 'PageInfo'
  endCursor?: Maybe<Scalars['String']>
  hasNextPage: Scalars['Boolean']
  hasPreviousPage: Scalars['Boolean']
  startCursor?: Maybe<Scalars['String']>
}

export type Post = {
  __typename?: 'Post'
  comments?: Maybe<CommentConnection>
  /** when the model was created */
  createdAt: Scalars['DateTime']
  id: Scalars['ID']
  slug: Scalars['String']
  title: Scalars['String']
  /** when the model was updated */
  updatedAt: Scalars['DateTime']
}

export type PostCommentsArgs = {
  after?: InputMaybe<Scalars['String']>
  before?: InputMaybe<Scalars['String']>
  first?: InputMaybe<Scalars['Int']>
  last?: InputMaybe<Scalars['Int']>
}

export type PostByInput = {
  id?: InputMaybe<Scalars['ID']>
  slug?: InputMaybe<Scalars['String']>
}

/** Input to create a new PostCommentRelatePostComment */
export type PostCommentRelatePostCommentCreateInput = {
  message: Scalars['String']
}

/** Input to create a new PostCommentRelatePostComment relation */
export type PostCommentRelatePostCommentCreateRelationInput = {
  create?: InputMaybe<PostCommentRelatePostCommentCreateInput>
  link?: InputMaybe<Scalars['ID']>
}

/** Input to update a PostCommentRelatePostComment relation */
export type PostCommentRelatePostCommentUpdateRelationInput = {
  create?: InputMaybe<PostCommentRelatePostCommentCreateInput>
  link?: InputMaybe<Scalars['ID']>
  unlink?: InputMaybe<Scalars['ID']>
}

export type PostConnection = {
  __typename?: 'PostConnection'
  edges?: Maybe<Array<Maybe<PostEdge>>>
  /** Information to aid in pagination */
  pageInfo: PageInfo
}

/** Input to create a new Post */
export type PostCreateInput = {
  comments?: InputMaybe<
    Array<InputMaybe<PostCommentRelatePostCommentCreateRelationInput>>
  >
  slug: Scalars['String']
  title: Scalars['String']
}

export type PostCreatePayload = {
  __typename?: 'PostCreatePayload'
  post?: Maybe<Post>
}

export type PostDeletePayload = {
  __typename?: 'PostDeletePayload'
  deletedId: Scalars['ID']
}

export type PostEdge = {
  __typename?: 'PostEdge'
  cursor: Scalars['String']
  node: Post
}

/** Input to create a new Post */
export type PostUpdateInput = {
  comments?: InputMaybe<
    Array<InputMaybe<PostCommentRelatePostCommentUpdateRelationInput>>
  >
  slug?: InputMaybe<Scalars['String']>
  title?: InputMaybe<Scalars['String']>
}

export type PostUpdatePayload = {
  __typename?: 'PostUpdatePayload'
  post?: Maybe<Post>
}

export type Query = {
  __typename?: 'Query'
  /** Query a single Comment by an ID or a unique field */
  comment?: Maybe<Comment>
  /** Paginated query to fetch the whole list of `Comment`. */
  commentCollection?: Maybe<CommentConnection>
  /** Query a single Post by an ID or a unique field */
  post?: Maybe<Post>
  /** Paginated query to fetch the whole list of `Post`. */
  postCollection?: Maybe<PostConnection>
}

export type QueryCommentArgs = {
  by: CommentByInput
}

export type QueryCommentCollectionArgs = {
  after?: InputMaybe<Scalars['String']>
  before?: InputMaybe<Scalars['String']>
  first?: InputMaybe<Scalars['Int']>
  last?: InputMaybe<Scalars['Int']>
}

export type QueryPostArgs = {
  by: PostByInput
}

export type QueryPostCollectionArgs = {
  after?: InputMaybe<Scalars['String']>
  before?: InputMaybe<Scalars['String']>
  first?: InputMaybe<Scalars['Int']>
  last?: InputMaybe<Scalars['Int']>
}

export type GetAllPostsQueryVariables = Exact<{
  first: Scalars['Int']
}>

export type GetAllPostsQuery = {
  __typename?: 'Query'
  postCollection?: {
    __typename?: 'PostConnection'
    edges?: Array<{
      __typename?: 'PostEdge'
      node: { __typename?: 'Post'; id: string; title: string; slug: string }
    } | null> | null
  } | null
}

export type GetPostBySlugQueryVariables = Exact<{
  slug: Scalars['String']
}>

export type GetPostBySlugQuery = {
  __typename?: 'Query'
  post?: { __typename?: 'Post'; id: string; title: string; slug: string } | null
}

export const GetAllPostsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetAllPosts' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'first' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'postCollection' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'first' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'first' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'edges' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'node' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'id' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'title' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'slug' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetAllPostsQuery, GetAllPostsQueryVariables>
export const GetPostBySlugDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetPostBySlug' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'slug' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'post' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'by' },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'slug' },
                      value: {
                        kind: 'Variable',
                        name: { kind: 'Name', value: 'slug' },
                      },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetPostBySlugQuery, GetPostBySlugQueryVariables>

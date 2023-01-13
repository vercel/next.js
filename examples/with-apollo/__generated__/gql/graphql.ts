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
  DateTime: any
}

export type Mutation = {
  __typename?: 'Mutation'
  createPost: Post
  votePost: Post
}

export type MutationCreatePostArgs = {
  title: Scalars['String']
  url: Scalars['String']
}

export type MutationVotePostArgs = {
  id: Scalars['String']
}

export enum OrderBy {
  Asc = 'asc',
  Desc = 'desc',
}

export type Post = {
  __typename?: 'Post'
  createdAt: Scalars['DateTime']
  id: Scalars['String']
  title: Scalars['String']
  updatedAt: Scalars['DateTime']
  url: Scalars['String']
  votes: Scalars['Int']
}

export type PostOrderBy = {
  createdAt?: InputMaybe<OrderBy>
  title?: InputMaybe<OrderBy>
  updatedAt?: InputMaybe<OrderBy>
  votes?: InputMaybe<OrderBy>
}

export type Query = {
  __typename?: 'Query'
  Post: Post
  User: User
  _allPostsMeta: _QueryMeta
  _allUsersMeta: _QueryMeta
  allPosts: Array<Post>
  allUsers: Array<User>
}

export type QueryPostArgs = {
  id: Scalars['String']
}

export type QueryUserArgs = {
  id: Scalars['String']
}

export type QueryAllPostsArgs = {
  first?: InputMaybe<Scalars['Int']>
  orderBy?: InputMaybe<PostOrderBy>
  skip?: InputMaybe<Scalars['Int']>
}

export type QueryAllUsersArgs = {
  first?: InputMaybe<Scalars['Int']>
  orderBy?: InputMaybe<UserOrderBy>
  skip?: InputMaybe<Scalars['Int']>
}

export type User = {
  __typename?: 'User'
  createdAt: Scalars['DateTime']
  email: Scalars['String']
  firstName: Scalars['String']
  id: Scalars['String']
  lastName: Scalars['String']
  updatedAt: Scalars['DateTime']
}

export type UserOrderBy = {
  createdAt?: InputMaybe<OrderBy>
  firstName?: InputMaybe<OrderBy>
  lastName?: InputMaybe<OrderBy>
  updatedAt?: InputMaybe<OrderBy>
}

export type _QueryMeta = {
  __typename?: '_QueryMeta'
  count: Scalars['Int']
}

export type AllPostsQueryVariables = Exact<{
  first: Scalars['Int']
  skip: Scalars['Int']
}>

export type AllPostsQuery = {
  __typename?: 'Query'
  allPosts: Array<{
    __typename?: 'Post'
    id: string
    title: string
    votes: number
    url: string
    createdAt: any
  }>
  _allPostsMeta: { __typename?: '_QueryMeta'; count: number }
}

export type VotePostMutationVariables = Exact<{
  id: Scalars['String']
}>

export type VotePostMutation = {
  __typename?: 'Mutation'
  votePost: { __typename: 'Post'; id: string; votes: number }
}

export type CreatePostMutationVariables = Exact<{
  title: Scalars['String']
  url: Scalars['String']
}>

export type CreatePostMutation = {
  __typename?: 'Mutation'
  createPost: {
    __typename?: 'Post'
    id: string
    title: string
    votes: number
    url: string
    createdAt: any
  }
}

export type NewPostFragment = { __typename?: 'Post'; id: string } & {
  ' $fragmentName'?: 'NewPostFragment'
}

export const NewPostFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'NewPost' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Post' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [{ kind: 'Field', name: { kind: 'Name', value: 'id' } }],
      },
    },
  ],
} as unknown as DocumentNode<NewPostFragment, unknown>
export const AllPostsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'AllPosts' },
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
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'skip' } },
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
            name: { kind: 'Name', value: 'allPosts' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'orderBy' },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'createdAt' },
                      value: { kind: 'EnumValue', value: 'desc' },
                    },
                  ],
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'first' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'first' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'skip' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'skip' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                { kind: 'Field', name: { kind: 'Name', value: 'votes' } },
                { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: '_allPostsMeta' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'count' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AllPostsQuery, AllPostsQueryVariables>
export const VotePostDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'votePost' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
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
            name: { kind: 'Name', value: 'votePost' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'id' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'votes' } },
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<VotePostMutation, VotePostMutationVariables>
export const CreatePostDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreatePost' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'title' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'url' } },
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
            name: { kind: 'Name', value: 'createPost' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'title' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'title' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'url' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'url' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                { kind: 'Field', name: { kind: 'Name', value: 'votes' } },
                { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreatePostMutation, CreatePostMutationVariables>

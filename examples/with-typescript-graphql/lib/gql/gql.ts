/* eslint-disable */
import * as types from './graphql'
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core'

const documents = {
  '\n  mutation UpdateName($name: String!) {\n    updateName(name: $name) {\n      id\n      name\n      status\n    }\n  }\n':
    types.UpdateNameDocument,
  '\n  query Viewer {\n    viewer {\n      id\n      name\n      status\n    }\n  }\n':
    types.ViewerDocument,
}

export function graphql(
  source: '\n  mutation UpdateName($name: String!) {\n    updateName(name: $name) {\n      id\n      name\n      status\n    }\n  }\n'
): typeof documents['\n  mutation UpdateName($name: String!) {\n    updateName(name: $name) {\n      id\n      name\n      status\n    }\n  }\n']
export function graphql(
  source: '\n  query Viewer {\n    viewer {\n      id\n      name\n      status\n    }\n  }\n'
): typeof documents['\n  query Viewer {\n    viewer {\n      id\n      name\n      status\n    }\n  }\n']

export function graphql(source: string): unknown
export function graphql(source: string) {
  return (documents as any)[source] ?? {}
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> =
  TDocumentNode extends DocumentNode<infer TType, any> ? TType : never

/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

const documents = {
    "mutation UpdateName($name: String!) {\n  updateName(name: $name) {\n    id\n    name\n    status\n  }\n}\n": types.UpdateNameDocument,
    "\nfragment Partial on User {\n  id\n  name\n  status\n}\n": types.PartialFragmentDoc,
    "query Viewer {\n  viewer {\n    ...Partial\n  }\n}": types.ViewerDocument,
};

export function graphql(source: "mutation UpdateName($name: String!) {\n  updateName(name: $name) {\n    id\n    name\n    status\n  }\n}\n"): (typeof documents)["mutation UpdateName($name: String!) {\n  updateName(name: $name) {\n    id\n    name\n    status\n  }\n}\n"];
export function graphql(source: "\nfragment Partial on User {\n  id\n  name\n  status\n}\n"): (typeof documents)["\nfragment Partial on User {\n  id\n  name\n  status\n}\n"];
export function graphql(source: "query Viewer {\n  viewer {\n    ...Partial\n  }\n}"): (typeof documents)["query Viewer {\n  viewer {\n    ...Partial\n  }\n}"];

export function graphql(source: string): unknown;
export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;
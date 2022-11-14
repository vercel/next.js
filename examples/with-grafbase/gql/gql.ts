/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

const documents = {
    "\n  query GetAllPosts($first: Int!) {\n    postCollection(first: $first) {\n      edges {\n        node {\n          id\n          title\n          slug\n        }\n      }\n    }\n  }\n": types.GetAllPostsDocument,
    "\n  query GetPostBySlug($slug: String!) {\n    post(by: { slug: $slug }) {\n      id\n      title\n      slug\n    }\n  }\n": types.GetPostBySlugDocument,
};

export function graphql(source: "\n  query GetAllPosts($first: Int!) {\n    postCollection(first: $first) {\n      edges {\n        node {\n          id\n          title\n          slug\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query GetAllPosts($first: Int!) {\n    postCollection(first: $first) {\n      edges {\n        node {\n          id\n          title\n          slug\n        }\n      }\n    }\n  }\n"];
export function graphql(source: "\n  query GetPostBySlug($slug: String!) {\n    post(by: { slug: $slug }) {\n      id\n      title\n      slug\n    }\n  }\n"): (typeof documents)["\n  query GetPostBySlug($slug: String!) {\n    post(by: { slug: $slug }) {\n      id\n      title\n      slug\n    }\n  }\n"];

export function graphql(source: string): unknown;
export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;
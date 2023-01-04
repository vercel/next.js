/**
 * @generated SignedSource<<a6468d297da1928100bce80db9f1b8ab>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime'
export type pagesQuery$variables = {}
export type pagesQueryVariables = pagesQuery$variables
export type pagesQuery$data = {
  readonly viewer: {
    readonly user: {
      readonly id: string
      readonly name: string
    }
  }
}
export type pagesQueryResponse = pagesQuery$data
export type pagesQuery = {
  variables: pagesQueryVariables
  response: pagesQuery$data
}

const node: ConcreteRequest = (function () {
  var v0 = {
      alias: null,
      args: null,
      kind: 'ScalarField',
      name: 'id',
      storageKey: null,
    },
    v1 = {
      alias: null,
      args: null,
      concreteType: 'User',
      kind: 'LinkedField',
      name: 'user',
      plural: false,
      selections: [
        v0 /*: any*/,
        {
          alias: null,
          args: null,
          kind: 'ScalarField',
          name: 'name',
          storageKey: null,
        },
      ],
      storageKey: null,
    }
  return {
    fragment: {
      argumentDefinitions: [],
      kind: 'Fragment',
      metadata: null,
      name: 'pagesQuery',
      selections: [
        {
          alias: null,
          args: null,
          concreteType: 'Viewer',
          kind: 'LinkedField',
          name: 'viewer',
          plural: false,
          selections: [v1 /*: any*/],
          storageKey: null,
        },
      ],
      type: 'Query',
      abstractKey: null,
    },
    kind: 'Request',
    operation: {
      argumentDefinitions: [],
      kind: 'Operation',
      name: 'pagesQuery',
      selections: [
        {
          alias: null,
          args: null,
          concreteType: 'Viewer',
          kind: 'LinkedField',
          name: 'viewer',
          plural: false,
          selections: [v1 /*: any*/, v0 /*: any*/],
          storageKey: null,
        },
      ],
    },
    params: {
      cacheID: '5a14ce729d0deb2c3170bcdcba33a61a',
      id: null,
      metadata: {},
      name: 'pagesQuery',
      operationKind: 'query',
      text: 'query pagesQuery {\n  viewer {\n    user {\n      id\n      name\n    }\n    id\n  }\n}\n',
    },
  }
})()

;(node as any).hash = '00b43dedd685e716dda36f66f4d5e30e'

export default node

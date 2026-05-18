/**
 * @generated SignedSource<<afaeba3a661c4bb0d2a399327c82d32b>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime'
export type pagesAQuery$variables = {}
export type pagesAQueryVariables = pagesAQuery$variables
export type pagesAQuery$data = {
  readonly greeting: string
}
export type pagesAQueryResponse = pagesAQuery$data
export type pagesAQuery = {
  variables: pagesAQueryVariables
  response: pagesAQuery$data
}

const node: ConcreteRequest = (function () {
  var v0 = [
    {
      alias: null,
      args: null,
      kind: 'ScalarField',
      name: 'greeting',
      storageKey: null,
    },
  ]
  return {
    fragment: {
      argumentDefinitions: [],
      kind: 'Fragment',
      metadata: null,
      name: 'pagesAQuery',
      selections: v0 /*: any*/,
      type: 'Query',
      abstractKey: null,
    },
    kind: 'Request',
    operation: {
      argumentDefinitions: [],
      kind: 'Operation',
      name: 'pagesAQuery',
      selections: v0 /*: any*/,
    },
    params: {
      cacheID: 'bc59dc1b50eecd19488f004d5cd93913',
      id: null,
      metadata: {},
      name: 'pagesAQuery',
      operationKind: 'query',
      text: 'query pagesAQuery {\n  greeting\n}\n',
    },
  }
})()

;(node as any).hash = '7f699085b71746bb18cb74e3a0776f46'

export default node

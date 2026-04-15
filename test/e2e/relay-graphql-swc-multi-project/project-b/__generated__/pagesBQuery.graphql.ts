/**
 * @generated SignedSource<<9f92ea3ccfda1f64fa269e68b912abae>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime'
export type pagesBQuery$variables = {}
export type pagesBQueryVariables = pagesBQuery$variables
export type pagesBQuery$data = {
  readonly greeting: string
}
export type pagesBQueryResponse = pagesBQuery$data
export type pagesBQuery = {
  variables: pagesBQueryVariables
  response: pagesBQuery$data
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
      name: 'pagesBQuery',
      selections: v0 /*: any*/,
      type: 'Query',
      abstractKey: null,
    },
    kind: 'Request',
    operation: {
      argumentDefinitions: [],
      kind: 'Operation',
      name: 'pagesBQuery',
      selections: v0 /*: any*/,
    },
    params: {
      cacheID: 'e7cc6f8c55ef42783faec7a49b72ae71',
      id: null,
      metadata: {},
      name: 'pagesBQuery',
      operationKind: 'query',
      text: 'query pagesBQuery {\n  greeting\n}\n',
    },
  }
})()

;(node as any).hash = '83bf9452eafa7635d81bdc98603cd75f'

export default node

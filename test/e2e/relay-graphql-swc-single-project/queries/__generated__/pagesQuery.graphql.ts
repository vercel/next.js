/**
 * @generated SignedSource<<187ead9fb6e7b26d71c9161bda6ab902>>
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
  readonly greeting: string
}
export type pagesQueryResponse = pagesQuery$data
export type pagesQuery = {
  variables: pagesQueryVariables
  response: pagesQuery$data
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
      name: 'pagesQuery',
      selections: v0 /*: any*/,
      type: 'Query',
      abstractKey: null,
    },
    kind: 'Request',
    operation: {
      argumentDefinitions: [],
      kind: 'Operation',
      name: 'pagesQuery',
      selections: v0 /*: any*/,
    },
    params: {
      cacheID: '167b6de16340efeb876a7787c90e7cec',
      id: null,
      metadata: {},
      name: 'pagesQuery',
      operationKind: 'query',
      text: 'query pagesQuery {\n  greeting\n}\n',
    },
  }
})()

;(node as any).hash = '4017856344f36f61252354e2eb442d98'

export default node

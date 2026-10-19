/**
 * @generated SignedSource<<7364a156ed6067a8aadb7d1c484d0d44>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type pagesAQuery$variables = Record<PropertyKey, never>;
export type pagesAQuery$data = {
  readonly greeting: string;
};
export type pagesAQuery = {
  response: pagesAQuery$data;
  variables: pagesAQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "greeting",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "pagesAQuery",
    "selections": (v0/*:: as any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "pagesAQuery",
    "selections": (v0/*:: as any*/)
  },
  "params": {
    "cacheID": "bc59dc1b50eecd19488f004d5cd93913",
    "id": null,
    "metadata": {},
    "name": "pagesAQuery",
    "operationKind": "query",
    "text": "query pagesAQuery {\n  greeting\n}\n"
  }
};
})();

(node as any).hash = "7f699085b71746bb18cb74e3a0776f46";

export default node;

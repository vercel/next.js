/**
 * @generated SignedSource<<d54cc95ecdca6c472aeedb358edd52c3>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type pagesQuery$variables = Record<PropertyKey, never>;
export type pagesQuery$data = {
  readonly greeting: string;
};
export type pagesQuery = {
  response: pagesQuery$data;
  variables: pagesQuery$variables;
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
    "name": "pagesQuery",
    "selections": (v0/*:: as any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "pagesQuery",
    "selections": (v0/*:: as any*/)
  },
  "params": {
    "cacheID": "167b6de16340efeb876a7787c90e7cec",
    "id": null,
    "metadata": {},
    "name": "pagesQuery",
    "operationKind": "query",
    "text": "query pagesQuery {\n  greeting\n}\n"
  }
};
})();

(node as any).hash = "4017856344f36f61252354e2eb442d98";

export default node;

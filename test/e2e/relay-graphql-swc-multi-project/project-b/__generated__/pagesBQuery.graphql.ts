/**
 * @generated SignedSource<<b379ecb8d3a28edccf96b8fbbab39b39>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type pagesBQuery$variables = Record<PropertyKey, never>;
export type pagesBQuery$data = {
  readonly greeting: string;
};
export type pagesBQuery = {
  response: pagesBQuery$data;
  variables: pagesBQuery$variables;
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
    "name": "pagesBQuery",
    "selections": (v0/*:: as any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "pagesBQuery",
    "selections": (v0/*:: as any*/)
  },
  "params": {
    "cacheID": "e7cc6f8c55ef42783faec7a49b72ae71",
    "id": null,
    "metadata": {},
    "name": "pagesBQuery",
    "operationKind": "query",
    "text": "query pagesBQuery {\n  greeting\n}\n"
  }
};
})();

(node as any).hash = "83bf9452eafa7635d81bdc98603cd75f";

export default node;

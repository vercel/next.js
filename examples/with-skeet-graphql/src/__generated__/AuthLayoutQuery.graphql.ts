/**
 * @generated SignedSource<<b1b790385b79c4e9023d04a5db7f499d>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type AuthLayoutQuery$variables = {};
export type AuthLayoutQuery$data = {
  readonly me: {
    readonly iconUrl: string | null;
    readonly id: string | null;
    readonly username: string | null;
  } | null;
};
export type AuthLayoutQuery = {
  response: AuthLayoutQuery$data;
  variables: AuthLayoutQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "alias": null,
    "args": null,
    "concreteType": "User",
    "kind": "LinkedField",
    "name": "me",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "id",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "iconUrl",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "username",
        "storageKey": null
      }
    ],
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "AuthLayoutQuery",
    "selections": (v0/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "AuthLayoutQuery",
    "selections": (v0/*: any*/)
  },
  "params": {
    "cacheID": "382859540be0772e1c621aed0cf30231",
    "id": null,
    "metadata": {},
    "name": "AuthLayoutQuery",
    "operationKind": "query",
    "text": "query AuthLayoutQuery {\n  me {\n    id\n    iconUrl\n    username\n  }\n}\n"
  }
};
})();

(node as any).hash = "8d78b8056488a95b0a4b5f1af8876fe1";

export default node;

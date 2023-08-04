/**
 * @generated SignedSource<<f179f70740f893f3da4113b5dd14d511>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type EditUserProfileMutation$variables = {
  id?: string | null;
  username?: string | null;
};
export type EditUserProfileMutation$data = {
  readonly updateUser: {
    readonly username: string | null;
  } | null;
};
export type EditUserProfileMutation = {
  response: EditUserProfileMutation$data;
  variables: EditUserProfileMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "id"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "username"
  }
],
v1 = [
  {
    "kind": "Variable",
    "name": "id",
    "variableName": "id"
  },
  {
    "kind": "Variable",
    "name": "username",
    "variableName": "username"
  }
],
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "username",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "EditUserProfileMutation",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "updateUser",
        "plural": false,
        "selections": [
          (v2/*: any*/)
        ],
        "storageKey": null
      }
    ],
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "EditUserProfileMutation",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "updateUser",
        "plural": false,
        "selections": [
          (v2/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "id",
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "2b5d1459629219ec2993f9abffd9dbe0",
    "id": null,
    "metadata": {},
    "name": "EditUserProfileMutation",
    "operationKind": "mutation",
    "text": "mutation EditUserProfileMutation(\n  $id: String\n  $username: String\n) {\n  updateUser(id: $id, username: $username) {\n    username\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "7d14efc535cb2e13cab692564f36c121";

export default node;

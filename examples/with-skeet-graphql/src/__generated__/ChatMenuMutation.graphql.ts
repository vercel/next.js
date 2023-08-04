/**
 * @generated SignedSource<<21fca908d2835069b73d5a77b0860349>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type ChatMenuMutation$variables = {
  maxTokens?: number | null;
  model?: string | null;
  stream?: boolean | null;
  systemContent?: string | null;
  temperature?: number | null;
};
export type ChatMenuMutation$data = {
  readonly createChatRoom: {
    readonly id: string | null;
  } | null;
};
export type ChatMenuMutation = {
  response: ChatMenuMutation$data;
  variables: ChatMenuMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "maxTokens"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "model"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "stream"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "systemContent"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "temperature"
},
v5 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "maxTokens",
        "variableName": "maxTokens"
      },
      {
        "kind": "Variable",
        "name": "model",
        "variableName": "model"
      },
      {
        "kind": "Variable",
        "name": "stream",
        "variableName": "stream"
      },
      {
        "kind": "Variable",
        "name": "systemContent",
        "variableName": "systemContent"
      },
      {
        "kind": "Variable",
        "name": "temperature",
        "variableName": "temperature"
      }
    ],
    "concreteType": "ChatRoom",
    "kind": "LinkedField",
    "name": "createChatRoom",
    "plural": false,
    "selections": [
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
];
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v3/*: any*/),
      (v4/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "ChatMenuMutation",
    "selections": (v5/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v0/*: any*/),
      (v4/*: any*/),
      (v2/*: any*/),
      (v3/*: any*/)
    ],
    "kind": "Operation",
    "name": "ChatMenuMutation",
    "selections": (v5/*: any*/)
  },
  "params": {
    "cacheID": "b1f3a3665aba9f44149de2f385396456",
    "id": null,
    "metadata": {},
    "name": "ChatMenuMutation",
    "operationKind": "mutation",
    "text": "mutation ChatMenuMutation(\n  $model: String\n  $maxTokens: Int\n  $temperature: Int\n  $stream: Boolean\n  $systemContent: String\n) {\n  createChatRoom(model: $model, maxTokens: $maxTokens, temperature: $temperature, stream: $stream, systemContent: $systemContent) {\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "5fa285d511b0a232be48cd78981181a9";

export default node;

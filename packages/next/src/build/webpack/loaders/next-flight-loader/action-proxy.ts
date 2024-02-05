/* eslint-disable import/no-extraneous-dependencies */
import { registerServerReference } from 'react-server-dom-webpack/server.edge'

const SERVER_REFERENCE_TAG = Symbol.for('react.server.reference')

function isServerReference(reference: any) {
  return reference && reference.$$typeof === SERVER_REFERENCE_TAG
}

export function createActionProxy(id: string, action: any) {
  // Avoid registering the same action twice
  if (isServerReference(action)) {
    return action
  }

  return registerServerReference(action, id, null)
}

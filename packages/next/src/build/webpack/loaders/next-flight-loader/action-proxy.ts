/* eslint-disable import/no-extraneous-dependencies */
import { registerServerReference } from 'react-server-dom-webpack/server.edge'

export function createActionProxy(id: string, action: any) {
  return registerServerReference(action, id, null)
}

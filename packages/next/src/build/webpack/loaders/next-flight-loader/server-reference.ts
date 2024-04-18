/* eslint-disable import/no-extraneous-dependencies */
import { registerServerReference as flightRegisterServerReference } from 'react-server-dom-webpack/server.edge'

export function registerServerReference(id: string, action: any) {
  console.log(process.env.__NEXT_ENCRYPTION_KEY)

  return flightRegisterServerReference(action, id, null)
}

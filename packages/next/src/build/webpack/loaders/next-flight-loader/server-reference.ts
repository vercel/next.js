/* eslint-disable import/no-extraneous-dependencies */
import { registerServerReference as flightRegisterServerReference } from 'react-server-dom-webpack/server.edge'
import { getHashedActionId } from '../../../../server/app-render/encryption-utils'

export function registerServerReference(checksum: string, action: any) {
  return flightRegisterServerReference(
    action,
    getHashedActionId(checksum),
    null
  )
}

/* eslint-disable import/no-extraneous-dependencies */
import { registerServerReference as upstream } from 'react-server-dom-webpack/server'

export function registerServerReference<T>(
  reference: T,
  id: string,
  exportName: string | null
): T {
  upstream(reference, id, exportName)
  return reference
}

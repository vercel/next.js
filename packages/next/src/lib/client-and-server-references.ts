import { extractInfoFromServerReferenceId } from '../shared/lib/server-reference-info'

// Only contains the properties we're interested in.
export interface ServerReference {
  $$typeof: Symbol
  $$id: string
}

export type ServerFunction = ServerReference &
  ((...args: unknown[]) => Promise<unknown>)

export function isServerReference<T>(
  value: T & Partial<ServerReference>
): value is T & ServerFunction {
  return value.$$typeof === Symbol.for('react.server.reference')
}

export function isUseCacheFunction<T>(
  value: T & Partial<ServerReference>
): value is T & ServerFunction {
  if (!isServerReference(value)) {
    return false
  }

  const { type } = extractInfoFromServerReferenceId(value.$$id)

  return type === 'use-cache'
}

export function isClientReference(mod: any): boolean {
  const defaultExport = mod?.default || mod
  return defaultExport?.$$typeof === Symbol.for('react.client.reference')
}

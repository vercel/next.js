export function isClientReference(mod: any): boolean {
  const defaultExport = mod?.default || mod
  return defaultExport?.$$typeof === Symbol.for('react.client.reference')
}

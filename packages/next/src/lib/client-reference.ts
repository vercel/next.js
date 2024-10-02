export function isClientReference(mod: any): boolean {
  return mod?.$$typeof === Symbol.for('react.client.reference')
}

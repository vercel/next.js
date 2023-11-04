export function isClientReference(reference: any): boolean {
  return reference?.$$typeof === Symbol.for('react.client.reference')
}

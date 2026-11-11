const freezeNativeOpaqueIdentity = Object.freeze

export function createNativeOpaqueIdentity(): object {
  const identity = { __proto__: null }
  freezeNativeOpaqueIdentity(identity)
  return identity
}

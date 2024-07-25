export function interopDefault<T extends {} | { default: any }>(
  mod: T
): T extends { default: infer U } ? U : T {
  return 'default' in mod ? mod.default : mod
}

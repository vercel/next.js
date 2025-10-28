// This regex will have fast negatives meaning valid identifiers may not pass
// this test. However this is only used during static generation to provide hints
// about why a page bailed out of some or all prerendering and we can use bracket notation
// for example while `ಠ_ಠ` is a valid identifier it's ok to print `searchParams['ಠ_ಠ']`
// even if this would have been fine too `searchParams.ಠ_ಠ`
const isDefinitelyAValidIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/

export function describeStringPropertyAccess(target: string, prop: string) {
  if (isDefinitelyAValidIdentifier.test(prop)) {
    return `\`${target}.${prop}\``
  }
  return `\`${target}[${JSON.stringify(prop)}]\``
}

export function describeHasCheckingStringProperty(
  target: string,
  prop: string
) {
  const stringifiedProp = JSON.stringify(prop)
  return `\`Reflect.has(${target}, ${stringifiedProp})\`, \`${stringifiedProp} in ${target}\`, or similar`
}

export const wellKnownProperties = new Set([
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toString',
  'valueOf',
  'toLocaleString',

  // Promise prototype
  'then',
  'catch',
  'finally',

  // React Promise extension
  'status',
  // 'value',
  // 'error',

  // React introspection
  'displayName',
  '_debugInfo',

  // Common tested properties
  'toJSON',
  '$$typeof',
  '__esModule',
])

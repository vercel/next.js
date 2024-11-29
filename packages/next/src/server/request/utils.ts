import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import { workUnitSnapshotAsyncStorage } from '../app-render/work-unit-snapshot-async-storage.external'

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

export function throwWithStaticGenerationBailoutError(
  route: string,
  expression: string
): never {
  throw new StaticGenBailoutError(
    `Route ${route} couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
  )
}

export function throwWithStaticGenerationBailoutErrorWithDynamicError(
  route: string,
  expression: string
): never {
  throw new StaticGenBailoutError(
    `Route ${route} with \`dynamic = "error"\` couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
  )
}

export function isRequestAPICallableInsideAfter() {
  // const workStore = workAsyncStorage.getStore()
  // const workUnitStore = workUnitAsyncStorage.getStore()
  const workUnitSnapshotStore = workUnitSnapshotAsyncStorage.getStore()
  return (
    // workUnitStore?.type === 'request' &&
    workUnitSnapshotStore?.phase === 'action'
  )
}

export const wellKnownProperties = new Set([
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toString',
  'valueOf',
  'toLocaleString',

  // Promise prototype
  // fallthrough
  'then',
  'catch',
  'finally',

  // React Promise extension
  // fallthrough
  'status',

  // React introspection
  'displayName',

  // Common tested properties
  // fallthrough
  'toJSON',
  '$$typeof',
  '__esModule',
])

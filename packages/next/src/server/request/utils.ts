import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import { afterTaskAsyncStorage } from '../app-render/after-task-async-storage.external'

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

export function throwForSearchParamsAccessInUseCache(route: string): never {
  throw new Error(
    `Route ${route} used "searchParams" inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use "searchParams" outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`
  )
}

export function isRequestAPICallableInsideAfter() {
  const afterTaskStore = afterTaskAsyncStorage.getStore()
  return afterTaskStore?.rootTaskSpawnPhase === 'action'
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

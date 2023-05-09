import { staticGenerationBailout } from './static-generation-bailout'

export function createSearchParamsBailoutProxy() {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        // React adds some properties on the object when serializing for client components
        if (typeof prop === 'string') {
          staticGenerationBailout(`searchParams.${prop}`)
        }
      },
    }
  )
}

import type { FS, RestoreOriginalFunction } from './types'
import fs from 'fs'

type AllFsKeys = keyof typeof fs
type AllFsMethods = {
  [Key in AllFsKeys]: (typeof fs)[Key] extends Function ? Key : never
}[AllFsKeys]

const allFsMethodNames = Object.keys(fs).filter(
  (key) => typeof fs[key as AllFsKeys] === 'function'
)

// Generic function to reassign a method on an object
function reassignMethod<T extends keyof typeof fs>(
  obj: typeof fs,
  methodName: T,
  method: (typeof fs)[T]
) {
  obj[methodName] = method
}

// Use Pick to create a type with a subset of fs methods
type OriginalMethodsType = Pick<typeof fs, AllFsMethods>

/**
 * Proxy the fs module to track file system access during the build.
 * NOTE: This uses the internal binding of fs to avoid the overhead of
 * using a proxy.
 *
 * @param paths An object to track the paths that are accessed.
 * @returns A function that restores the original fs methods.
 */
export function fsProxy(paths: FS): RestoreOriginalFunction {
  // Store the original methods in an object
  const originalMethods: OriginalMethodsType = Object.fromEntries(
    allFsMethodNames.map((key) => [key, fs[key as AllFsMethods]])
  ) as OriginalMethodsType

  Object.keys(originalMethods).forEach((key) => {
    const methodName = key as AllFsMethods
    const originalMethod = originalMethods[methodName]

    const newMethod: typeof originalMethod = function (
      this: any,
      ...args: any[]
    ) {
      if (typeof args[0] === 'string' || Buffer.isBuffer(args[0])) {
        paths.add(args[0].toString())
      }
      // Treat the original method as a function with a flexible signature
      const methodWithFlexibleSignature = originalMethod as (
        ...args: any[]
      ) => any
      return methodWithFlexibleSignature.apply(this, args)
    }

    // Set the mocked method on the fs object
    reassignMethod(fs, methodName, newMethod)
  })

  return () => {
    // Restore the original methods
    Object.keys(originalMethods).forEach((key) => {
      const methodName = key as AllFsMethods
      const originalMethod = originalMethods[methodName]

      // Set the original method on the fs object
      reassignMethod(fs, methodName, originalMethod)
    })
  }
}

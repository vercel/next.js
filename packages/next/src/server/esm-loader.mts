import module from 'module'

const require = module.createRequire(import.meta.url)
const {
  overrideReact,
  hookPropertyMap,
} = require('next/dist/server/lib/import-overrides')

export function resolve(specifier: string, context: any, nextResolve: any) {
  // In case the environment variable is set after the module is loaded.
  overrideReact()

  const hookResolved = hookPropertyMap.get(specifier)
  if (hookResolved) {
    specifier = hookResolved
  }

  if (specifier.endsWith('next/dist/bin/next')) {
    return {
      url: specifier,
      shortCircuit: true,
      format: 'commonjs',
    }
  }

  return nextResolve(specifier, context)
}

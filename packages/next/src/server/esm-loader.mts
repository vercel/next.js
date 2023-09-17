import module from 'module'

const require = module.createRequire(import.meta.url)

export function resolve(specifier: string, context: any, nextResolve: any) {
  const { hookPropertyMap } = require(process.env.NEXT_YARN_PNP
    ? './import-overrides'
    : 'next/dist/server/import-overrides') as typeof import('./import-overrides')

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

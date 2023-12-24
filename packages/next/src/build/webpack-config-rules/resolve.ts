import {
  COMPILER_NAMES,
  type CompilerNameValues,
} from '../../shared/lib/constants'

// exports.<conditionName>
export const edgeConditionNames = [
  'edge-light',
  'worker',
  // inherits the default conditions
  '...',
]

const mainFieldsPerCompiler: Record<
  CompilerNameValues | 'server-esm',
  string[]
> = {
  // For default case, prefer CJS over ESM on server side. e.g. pages dir SSR
  [COMPILER_NAMES.server]: ['main', 'module'],
  [COMPILER_NAMES.client]: ['browser', 'module', 'main'],
  [COMPILER_NAMES.edgeServer]: edgeConditionNames,
  // For bundling-all strategy, prefer ESM over CJS
  'server-esm': ['module', 'main'],
}

export function getMainField(
  compilerType: CompilerNameValues,
  preferEsm: boolean
) {
  if (compilerType === COMPILER_NAMES.edgeServer) {
    return edgeConditionNames
  } else if (compilerType === COMPILER_NAMES.client) {
    return mainFieldsPerCompiler[COMPILER_NAMES.client]
  }

  // Prefer module fields over main fields for isomorphic packages on server layer
  return preferEsm
    ? mainFieldsPerCompiler['server-esm']
    : mainFieldsPerCompiler[COMPILER_NAMES.server]
}

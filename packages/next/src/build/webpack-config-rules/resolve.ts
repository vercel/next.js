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
  CompilerNameValues | 'app-router-server',
  string[]
> = {
  // For default case, prefer CJS over ESM on server side. e.g. pages dir SSR
  [COMPILER_NAMES.server]: ['main', 'module'],
  [COMPILER_NAMES.client]: ['browser', 'module', 'main'],
  [COMPILER_NAMES.edgeServer]: edgeConditionNames,
  // For app router since everything is bundled, prefer ESM over CJS
  'app-router-server': ['module', 'main'],
}

export function getMainField(
  pageType: 'app' | 'pages',
  compilerType: CompilerNameValues
) {
  if (compilerType === COMPILER_NAMES.edgeServer) {
    return edgeConditionNames
  } else if (compilerType === COMPILER_NAMES.client) {
    return mainFieldsPerCompiler[COMPILER_NAMES.client]
  }

  // Prefer module fields over main fields for isomorphic packages on server layer
  return pageType === 'app'
    ? mainFieldsPerCompiler['app-router-server']
    : mainFieldsPerCompiler[COMPILER_NAMES.server]
}

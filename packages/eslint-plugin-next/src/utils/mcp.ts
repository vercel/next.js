import type { Rule } from 'eslint'
import type * as ESTree from 'estree'

// Shared detection for the `@next/mcp` rules. Everything is syntactic: a file
// is a tool file because of what it imports and exports, never because of its
// name or location.

/** Modules whose `defineTool` export marks a tool definition. */
export const TOOL_MODULES = new Set([
  '@next/mcp',
  '@next/mcp/tools',
  'eve/tools',
])

/** The module that exports `mcpRoute`. */
export const ROUTE_MODULE = '@next/mcp'

export const HTTP_METHODS = new Set([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
])

type FunctionNode =
  | ESTree.FunctionDeclaration
  | ESTree.FunctionExpression
  | ESTree.ArrowFunctionExpression

export function isFunction(node: ESTree.Node | null): node is FunctionNode {
  return (
    node != null &&
    (node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression')
  )
}

/** The imported name of a specifier, including string-literal names. */
export function importedName(specifier: ESTree.ImportSpecifier): string {
  const imported = specifier.imported as ESTree.Identifier | ESTree.Literal
  return imported.type === 'Identifier'
    ? imported.name
    : String((imported as ESTree.Literal).value)
}

/** Local names bound to `exportName` imported from any of `modules`. */
export function localNamesFor(
  program: ESTree.Program,
  modules: ReadonlySet<string>,
  exportName: string
): Set<string> {
  const names = new Set<string>()
  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration') continue
    if (!modules.has(node.source.value as string)) continue
    for (const specifier of node.specifiers) {
      if (
        specifier.type === 'ImportSpecifier' &&
        importedName(specifier) === exportName
      ) {
        names.add(specifier.local.name)
      }
    }
  }
  return names
}

function isCallTo(
  node: ESTree.Node | null,
  names: ReadonlySet<string>
): node is ESTree.CallExpression {
  return (
    node?.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    names.has(node.callee.name)
  )
}

function propertyName(
  property: ESTree.Property | ESTree.SpreadElement
): string | undefined {
  if (property.type !== 'Property' || property.computed) return undefined
  if (property.key.type === 'Identifier') return property.key.name
  if (property.key.type === 'Literal') return String(property.key.value)
  return undefined
}

export interface ToolDefinition {
  call: ESTree.CallExpression
  /** The inline `execute` function, or `null` when it is not inline. */
  execute: FunctionNode | null
}

/**
 * Finds `export default defineTool({...})`, directly or through a
 * module-level `const tool = defineTool({...}); export default tool`.
 * Returns `null` when the file is not a tool file.
 */
export function findToolDefinition(
  program: ESTree.Program
): ToolDefinition | null {
  const defineTool = localNamesFor(program, TOOL_MODULES, 'defineTool')
  if (defineTool.size === 0) return null

  const exported = program.body.find(
    (node): node is ESTree.ExportDefaultDeclaration =>
      node.type === 'ExportDefaultDeclaration'
  )
  if (!exported) return null

  let call = unwrap(exported.declaration as ESTree.Node)
  if (call?.type === 'Identifier') {
    call = unwrap(findModuleInit(program, call.name))
  }
  if (!isCallTo(call, defineTool)) return null

  const definition = unwrap(call.arguments[0] ?? null)
  if (definition?.type !== 'ObjectExpression') return { call, execute: null }
  const property = definition.properties.find(
    (p) => propertyName(p) === 'execute'
  ) as ESTree.Property | undefined
  const value = unwrap(property?.value ?? null)
  return { call, execute: isFunction(value) ? value : null }
}

const TS_WRAPPERS = new Set([
  'TSSatisfiesExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
])

/**
 * Strips TypeScript expression wrappers (`x satisfies T`, `x as T`, `x!`,
 * `<T>x`), which ESTree does not model, so `export default defineTool({...})
 * satisfies T` is still recognized.
 */
export function unwrap(node: ESTree.Node | null): ESTree.Node | null {
  while (node && TS_WRAPPERS.has(node.type as string)) {
    node = (node as unknown as { expression: ESTree.Node }).expression
  }
  return node
}

function findModuleInit(
  program: ESTree.Program,
  name: string
): ESTree.Node | null {
  for (const node of program.body) {
    const declaration =
      node.type === 'ExportNamedDeclaration' ? node.declaration : node
    if (declaration?.type !== 'VariableDeclaration') continue
    for (const declarator of declaration.declarations) {
      if (declarator.id.type === 'Identifier' && declarator.id.name === name) {
        return declarator.init
      }
    }
  }
  return null
}

/** Whether the file imports a value from one of `modules`. */
export function importsFrom(
  program: ESTree.Program,
  modules: ReadonlySet<string>
): boolean {
  return program.body.some(
    (node) =>
      node.type === 'ImportDeclaration' &&
      (node as { importKind?: string }).importKind !== 'type' &&
      modules.has(node.source.value as string)
  )
}

/** Whether `inner` lies entirely within `outer`. */
export function within(inner: ESTree.Node, outer: ESTree.Node): boolean {
  return inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1]
}

/** Whether `node` is inside a function, so it does not run at module load. */
export function insideFunction(node: Rule.Node): boolean {
  for (let current = node.parent; current; current = current.parent) {
    if (isFunction(current)) return true
  }
  return false
}

/**
 * Module specifier patterns: an exact name (`zod`), or a prefix ending in
 * `/*` or `:*` (`next/*`, `node:*`).
 */
export function matchesPattern(source: string, pattern: string): boolean {
  if (pattern.endsWith('/*') || pattern.endsWith(':*')) {
    return source.startsWith(pattern.slice(0, -1))
  }
  return source === pattern
}

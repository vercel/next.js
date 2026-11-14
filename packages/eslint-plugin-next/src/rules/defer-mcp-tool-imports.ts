import { builtinModules } from 'module'
import type { Rule, Scope, SourceCode } from 'eslint'
import type * as ESTree from 'estree'
import { defineRule } from '../utils/define-rule'
import {
  findToolDefinition,
  importedName,
  isFunction,
  matchesPattern,
  unwrap,
  within,
} from '../utils/mcp'

const url = 'https://nextjs.org/docs/messages/defer-mcp-tool-imports'

/**
 * Imports that are cheap to load eagerly, or that the tool needs at module
 * load anyway. Extend with the `allow` option.
 */
const DEFAULT_ALLOW = [
  'next',
  'next/*',
  '@next/mcp',
  '@next/mcp/*',
  'eve',
  'eve/*',
  'zod',
  'zod/*',
  'node:*',
  ...builtinModules,
]

type FunctionNode =
  | ESTree.FunctionExpression
  | ESTree.ArrowFunctionExpression
  | ESTree.FunctionDeclaration

/**
 * Code that only runs because `execute()` runs: `execute` itself, a helper
 * function that only deferred code calls, or a module-level constant that
 * only deferred code reads.
 */
type DeferredScope =
  | { kind: 'execute'; node: FunctionNode }
  | { kind: 'helper'; name: string; node: FunctionNode }
  | { kind: 'setup'; name: string; node: ESTree.Node }

interface Candidate {
  scope: Exclude<DeferredScope, { kind: 'execute' }>
  variable: Scope.Variable
}

export default defineRule({
  meta: {
    docs: {
      description:
        'Load modules that only an `@next/mcp` tool’s `execute()` uses with `await import()`, so they do not lengthen the MCP route’s cold start.',
      recommended: true,
      url,
    },
    type: 'suggestion',
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          allow: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const allow = [...DEFAULT_ALLOW, ...(context.options[0]?.allow ?? [])]
    const { sourceCode } = context

    return {
      Program(program) {
        const tool = findToolDefinition(program)
        if (!tool?.execute) return
        const scopes = deferredScopes(sourceCode, program, tool.execute)

        for (const node of program.body) {
          if (node.type !== 'ImportDeclaration') continue
          if ((node as { importKind?: string }).importKind === 'type') continue
          if (node.specifiers.length === 0) continue // side-effect import: may be intentional
          const source = node.source.value as string
          if (allow.some((pattern) => matchesPattern(source, pattern))) continue

          const valueSpecifiers = node.specifiers.filter(
            (s) => (s as { importKind?: string }).importKind !== 'type'
          )
          if (valueSpecifiers.length === 0) continue

          // The deferred scope holding each reference, or null if any
          // reference runs at module load.
          const used = new Set<DeferredScope>()
          let deferrable = true
          for (const specifier of valueSpecifiers) {
            const holders = referenceScopes(sourceCode, specifier, scopes)
            if (holders === null) {
              deferrable = false
              break
            }
            for (const holder of holders) used.add(holder)
          }
          if (!deferrable) continue

          const names = valueSpecifiers
            .map((s) => `\`${s.local.name}\``)
            .join(', ')
          const verb = valueSpecifiers.length === 1 ? 'is' : 'are'
          // Source order, so messages read top to bottom.
          const users = [...used].sort(
            (a, b) => a.node.range![0] - b.node.range![0]
          )

          const setup = users.filter(
            (s): s is Extract<DeferredScope, { kind: 'setup' }> =>
              s.kind === 'setup'
          )
          if (setup.length > 0) {
            const setupNames = setup.map((s) => `\`${s.name}\``).join(', ')
            context.report({
              node,
              message: `${names} ${verb} only needed when \`execute()\` runs, through module-level ${setupNames}, which still runs on every cold start of the MCP route. Move ${setupNames} into a shared module and load that with \`await import()\` when the tool is called, or create it lazily on the first call. See: ${url}`,
            })
            continue
          }

          const functions = users as Exclude<DeferredScope, { kind: 'setup' }>[]
          if (functions.length > 1) {
            const list = functions.map(label).join(', ')
            context.report({
              node,
              message: `${names} ${verb} only used by ${list}, which only run when \`execute()\` is called. Import it where it is used with \`await import('${source}')\` so it loads when the tool is called, not on every cold start of the MCP route. See: ${url}`,
            })
            continue
          }

          const [target] = functions
          const where =
            target.kind === 'execute'
              ? '`execute()`'
              : `${label(target)}, which only \`execute()\` calls`
          const fn = target.node
          // Type-only specifiers in the same declaration would be lost by the move.
          const movable = valueSpecifiers.length === node.specifiers.length
          const canSuggest =
            movable && fn.async && fn.body.type === 'BlockStatement'

          context.report({
            node,
            message: fn.async
              ? `${names} ${verb} only used inside ${where}. Import it there with \`await import('${source}')\` so it loads when the tool is called, not on every cold start of the MCP route. See: ${url}`
              : `${names} ${verb} only used inside ${where}. Make ${label(target)} async and import it there with \`await import('${source}')\` so it loads when the tool is called, not on every cold start of the MCP route. See: ${url}`,
            suggest: canSuggest
              ? [
                  {
                    desc: `Move this import into ${label(target)} as \`await import('${source}')\`.`,
                    fix: (fixer) => deferFix(fixer, sourceCode, node, fn),
                  },
                ]
              : [],
          })
        }
      },
    }
  },
})

function label(scope: Exclude<DeferredScope, { kind: 'setup' }>): string {
  return scope.kind === 'execute' ? '`execute()`' : `\`${scope.name}()\``
}

/** The value references of the binding a declaration node introduces. */
function valueReferences(
  variable: Scope.Variable,
  ignore: (reference: Scope.Reference) => boolean = () => false
): Scope.Reference[] | null {
  const references = variable.references.filter((r) => !ignore(r))
  for (const reference of references) {
    const typed = reference as Scope.Reference & {
      isValueReference?: boolean
      isTypeReference?: boolean
    }
    // A type reference outside the deferred code pins the import in place.
    if (typed.isValueReference === false || typed.isTypeReference === true) {
      return null
    }
  }
  return references
}

/**
 * The deferred scope each reference to `specifier` sits in, or `null` when a
 * reference runs at module load. Unused imports return `null` too: they are
 * not this rule's concern.
 */
function referenceScopes(
  sourceCode: SourceCode,
  specifier: ESTree.Node,
  scopes: readonly DeferredScope[]
): Set<DeferredScope> | null {
  const [variable] = sourceCode.getDeclaredVariables(specifier)
  if (!variable) return null
  const references = valueReferences(variable)
  if (!references || references.length === 0) return null
  const holders = new Set<DeferredScope>()
  for (const reference of references) {
    const holder = scopes.find((s) => within(reference.identifier, s.node))
    if (!holder) return null
    holders.add(holder)
  }
  return holders
}

/**
 * Finds the code that only runs because `execute()` runs.
 *
 * Candidates are the module's top-level, non-exported helper functions
 * (`function f() {}`, `const f = () => {}`) and constants (`const s3 = new
 * S3Client({})`). This computes a greatest fixpoint: start from every
 * candidate and drop any referenced outside the deferred code, until nothing
 * changes. Starting from all of them lets mutually recursive helpers qualify.
 * Candidates that `execute` cannot reach are then discarded, so an unused
 * cycle of helpers does not count.
 */
function deferredScopes(
  sourceCode: SourceCode,
  program: ESTree.Program,
  execute: FunctionNode
): DeferredScope[] {
  const candidates: Candidate[] = []
  const add = (scope: Candidate['scope'], declaration: ESTree.Node) => {
    // Never treat the declaration that holds `execute` (`const tool =
    // defineTool({...})`) as deferred.
    if (within(execute, scope.node)) return
    const variable = sourceCode
      .getDeclaredVariables(declaration)
      .find((v) => v.name === scope.name)
    if (variable) candidates.push({ scope, variable })
  }

  for (const node of program.body) {
    if (node.type === 'FunctionDeclaration' && node.id) {
      add({ kind: 'helper', name: node.id.name, node }, node)
    } else if (node.type === 'VariableDeclaration') {
      for (const declarator of node.declarations) {
        if (declarator.id.type !== 'Identifier') continue
        const init = unwrap(declarator.init ?? null)
        const name = declarator.id.name
        if (isFunction(init)) {
          add({ kind: 'helper', name, node: init }, declarator)
        } else if (init) {
          add({ kind: 'setup', name, node: init }, declarator)
        } else {
          // `let client` with no initializer: nothing runs at load, and a
          // later assignment is a reference like any other.
          add({ kind: 'setup', name, node: declarator }, declarator)
        }
      }
    }
  }

  const executeScope: DeferredScope = { kind: 'execute', node: execute }
  const live = new Set(candidates)
  const inRegion = (identifier: ESTree.Node) =>
    within(identifier, execute) ||
    [...live].some((c) => within(identifier, c.scope.node))

  let changed = true
  while (changed) {
    changed = false
    for (const candidate of live) {
      const references = valueReferences(
        candidate.variable,
        (r) =>
          r.init === true || // the declaration's own write
          within(r.identifier, candidate.scope.node) // recursion
      )
      const deferred =
        references !== null &&
        references.length > 0 &&
        references.every((r) => inRegion(r.identifier))
      if (!deferred) {
        live.delete(candidate)
        changed = true
      }
    }
  }

  // Keep only what `execute` reaches.
  const reached: Candidate[] = []
  const frontier: ESTree.Node[] = [execute]
  while (frontier.length > 0) {
    const from = frontier.pop()!
    for (const candidate of live) {
      if (reached.includes(candidate)) continue
      if (
        candidate.variable.references.some(
          (r) =>
            !within(r.identifier, candidate.scope.node) &&
            within(r.identifier, from)
        )
      ) {
        reached.push(candidate)
        frontier.push(candidate.scope.node)
      }
    }
  }

  return [executeScope, ...reached.map((c) => c.scope)]
}

function deferFix(
  fixer: Rule.RuleFixer,
  sourceCode: SourceCode,
  declaration: ESTree.ImportDeclaration,
  target: FunctionNode
): Rule.Fix[] {
  const source = `'${declaration.source.value}'`
  const named: string[] = []
  let namespace: string | undefined
  for (const specifier of declaration.specifiers) {
    if (specifier.type === 'ImportNamespaceSpecifier') {
      namespace = specifier.local.name
    } else if (specifier.type === 'ImportDefaultSpecifier') {
      named.push(`default: ${specifier.local.name}`)
    } else {
      const imported = importedName(specifier)
      const key = /^[A-Za-z_$][\w$]*$/.test(imported)
        ? imported
        : JSON.stringify(imported)
      named.push(
        imported === specifier.local.name
          ? imported
          : `${key}: ${specifier.local.name}`
      )
    }
  }

  const statements: string[] = []
  if (namespace) {
    statements.push(`const ${namespace} = await import(${source})`)
    if (named.length > 0) {
      statements.push(`const { ${named.join(', ')} } = ${namespace}`)
    }
  } else {
    statements.push(`const { ${named.join(', ')} } = await import(${source})`)
  }

  const body = target.body as ESTree.BlockStatement
  const indent = bodyIndent(sourceCode, body)
  const insertion = statements.map((s) => `\n${indent}${s}`).join('')

  const text = sourceCode.getText()
  let end = declaration.range[1]
  if (text[end] === '\n') end += 1

  return [
    fixer.removeRange([declaration.range[0], end]),
    fixer.insertTextAfterRange([body.range[0], body.range[0] + 1], insertion),
  ]
}

function bodyIndent(sourceCode: SourceCode, body: ESTree.BlockStatement) {
  const first = body.body[0]
  if (first) {
    const line = sourceCode.lines[first.loc.start.line - 1]
    return line.slice(0, first.loc.start.column)
  }
  const line = sourceCode.lines[body.loc.start.line - 1]
  return `${line.match(/^\s*/)[0]}  `
}

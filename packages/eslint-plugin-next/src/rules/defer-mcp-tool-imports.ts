import { builtinModules } from 'module'
import type { Scope, SourceCode } from 'eslint'
import type * as ESTree from 'estree'
import { defineRule } from '../utils/define-rule'
import {
  findToolDefinition,
  isFunction,
  isTypeOnlyImport,
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
 * Code and data private to tool execution. Functions may run on demand, but
 * the module-level setup that constructs their inputs still runs eagerly.
 */
type DeferredScope =
  | { kind: 'execute'; node: FunctionNode }
  | { kind: 'helper'; name: string; node: FunctionNode }
  | { kind: 'setup'; name: string; node: ESTree.Node }

type FunctionScope = Exclude<DeferredScope, { kind: 'setup' }>
type SetupScope = Extract<DeferredScope, { kind: 'setup' }>

interface Candidate {
  scope: Exclude<DeferredScope, { kind: 'execute' }>
  variable: Scope.Variable
}

interface DeferredAnalysis {
  scopes: readonly DeferredScope[]
  setupConsumers: ReadonlyMap<DeferredScope, ReadonlySet<SetupScope>>
}

interface ScopeUses {
  scopes: ReadonlySet<DeferredScope>
  parameterDefaults: ReadonlySet<FunctionScope>
}

const preservationNote =
  'Preserve import attributes, live bindings, and initialization order.'

export default defineRule({
  meta: {
    docs: {
      description:
        'Load modules that only an `@next/mcp` tool’s `execute()` uses with `await import()`, so they do not lengthen the MCP route’s cold start.',
      recommended: true,
      url,
    },
    type: 'suggestion',
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
        const { scopes, setupConsumers } = deferredScopes(
          sourceCode,
          program,
          tool.execute
        )

        for (const node of program.body) {
          if (node.type !== 'ImportDeclaration') continue
          if (isTypeOnlyImport(node)) continue
          if (node.specifiers.length === 0) continue // side-effect import: may be intentional
          const source = node.source.value as string
          if (allow.some((pattern) => matchesPattern(source, pattern))) continue

          const valueSpecifiers = node.specifiers.filter(
            (specifier) => !isTypeOnlyImport(specifier)
          )
          if (valueSpecifiers.length === 0) continue

          // Only report imports whose consumers are private to tool execution.
          const used = new Set<DeferredScope>()
          const parameterDefaults = new Set<FunctionScope>()
          let deferrable = true
          for (const specifier of valueSpecifiers) {
            const uses = referenceScopes(sourceCode, specifier, scopes)
            if (uses === null) {
              deferrable = false
              break
            }
            for (const holder of uses.scopes) {
              used.add(holder)
              for (const setup of setupConsumers.get(holder) ?? []) {
                used.add(setup)
              }
            }
            for (const holder of uses.parameterDefaults) {
              parameterDefaults.add(holder)
            }
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

          const dynamicImport = `await import(${JSON.stringify(source)})`
          const defaults = [...parameterDefaults]
            .sort((a, b) => a.node.range![0] - b.node.range![0])
            .map(label)
            .join(', ')
          const defaultAdvice = defaults
            ? ` Move parameter-default computations in ${defaults} into the function bodies, preserving when defaults apply. Make the affected functions async and update their callers.`
            : ''
          const setup = users.filter(
            (s): s is Extract<DeferredScope, { kind: 'setup' }> =>
              s.kind === 'setup'
          )
          if (setup.length > 0) {
            const setupNames = setup.map((s) => `\`${s.name}\``).join(', ')
            context.report({
              node,
              message: `${names} ${verb} only needed by \`execute()\`, but this import is connected to module-level setup ${setupNames}, which is evaluated during cold starts. If setup invokes helpers or reads this dependency, move ${setupNames} into a shared module and load that module with \`await import()\` when the tool is called, or create and cache it lazily on the first call. If setup only stores helpers, lazy-load the dependency inside those helpers instead. Do not leave eager helper calls at module scope.${defaultAdvice} ${preservationNote} See: ${url}`,
            })
            continue
          }

          if (defaults) {
            context.report({
              node,
              message: `${names} ${verb} imported eagerly and used in parameter defaults of ${defaults}. Move those default-value computations into the function bodies before using \`${dynamicImport}\`. Preserve when defaults apply; make the affected functions async and update their callers. ${preservationNote} See: ${url}`,
            })
            continue
          }

          const functions = users.filter(
            (scope): scope is FunctionScope => scope.kind !== 'setup'
          )
          if (functions.length > 1) {
            const list = functions.map(label).join(', ')
            context.report({
              node,
              message: `${names} ${verb} only used by ${list}. Load the module with \`${dynamicImport}\` in those functions or in a shared, lazily loaded module, not during every cold start. Make affected functions async and update their callers. ${preservationNote} See: ${url}`,
            })
            continue
          }

          const [target] = functions
          const where = label(target)
          context.report({
            node,
            message: target.node.async
              ? `${names} ${verb} only used inside ${where}. Import it there with \`${dynamicImport}\` so it loads when that function runs, not on every cold start of the MCP route. ${preservationNote} See: ${url}`
              : `${names} ${verb} only used inside ${where}. Make ${where} async, update its callers, and import it there with \`${dynamicImport}\` so it loads when that function runs, not on every cold start of the MCP route. ${preservationNote} See: ${url}`,
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
    // Leave imports with type references alone; splitting type/value imports
    // is outside this rule's analysis.
    if (typed.isValueReference === false || typed.isTypeReference === true) {
      return null
    }
  }
  return references
}

/**
 * The execution-private scopes consuming an import, or `null` for an outside
 * use. Parameter defaults are recorded separately from function-body uses.
 * Unused imports are not this rule's concern.
 */
function referenceScopes(
  sourceCode: SourceCode,
  specifier: ESTree.Node,
  scopes: readonly DeferredScope[]
): ScopeUses | null {
  const [variable] = sourceCode.getDeclaredVariables(specifier)
  if (!variable) return null
  const references = valueReferences(variable)
  if (!references || references.length === 0) return null
  const holders = new Set<DeferredScope>()
  const parameterDefaults = new Set<FunctionScope>()
  for (const reference of references) {
    const holder = scopes.find((scope) =>
      within(reference.identifier, scope.node)
    )
    if (!holder) return null
    holders.add(holder)
    if (
      holder.kind !== 'setup' &&
      holder.node.params.some((param) => within(reference.identifier, param))
    ) {
      parameterDefaults.add(holder)
    }
  }
  return { scopes: holders, parameterDefaults }
}

/**
 * Finds private code and data whose consumers lead only to `execute()`.
 * Module-level setup initializers still run eagerly.
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
): DeferredAnalysis {
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

  // Keep only what `execute` reaches, then record helpers also referenced by
  // eager setup. Importing inside such a helper alone does not defer the setup.
  const reached = reachableCandidates(live, execute)
  const setupConsumers = new Map<DeferredScope, Set<SetupScope>>()
  for (const consumer of reached) {
    if (consumer.scope.kind !== 'setup') continue
    for (const dependency of reachableCandidates(
      reached,
      consumer.scope.node
    )) {
      if (dependency.scope.kind !== 'helper') continue
      let consumers = setupConsumers.get(dependency.scope)
      if (consumers === undefined) {
        consumers = new Set<SetupScope>()
        setupConsumers.set(dependency.scope, consumers)
      }
      consumers.add(consumer.scope)
    }
  }

  return {
    scopes: [executeScope, ...reached.map((candidate) => candidate.scope)],
    setupConsumers,
  }
}

function reachableCandidates(
  candidates: Iterable<Candidate>,
  root: ESTree.Node
): Candidate[] {
  const reached = new Set<Candidate>()
  const frontier = [root]
  while (frontier.length > 0) {
    const from = frontier.pop()!
    for (const candidate of candidates) {
      if (reached.has(candidate)) continue
      if (
        candidate.variable.references.some(
          (reference) =>
            !within(reference.identifier, candidate.scope.node) &&
            within(reference.identifier, from)
        )
      ) {
        reached.add(candidate)
        frontier.push(candidate.scope.node)
      }
    }
  }
  return [...reached]
}

const path = require('path')

/**
 * Resolve the module specifier used to import the canonical sleep helper into
 * `filename`.
 *
 * - `module`: a bare specifier (e.g. `next-test-utils`), used verbatim.
 * - `modulePath`: a repo-relative path (e.g. `packages/next/src/lib/wait`),
 *   turned into a relative specifier computed from the linted file.
 *
 * @param {{ module?: string, modulePath?: string }} options
 * @param {string} filename absolute path of the file being linted
 * @param {string} cwd
 * @returns {string}
 */
function resolveSpecifier(options, filename, cwd) {
  if (options.module) {
    return options.module
  }
  const target = path.resolve(cwd, options.modulePath)
  const relative = path
    .relative(path.dirname(filename), target)
    .split(path.sep)
    .join('/')
  return relative.startsWith('.') ? relative : `./${relative}`
}

/**
 * Match `new Promise((resolve) => setTimeout(resolve, ms))` and its variants,
 * and return the `ms` node. Returns `null` for anything that is not exactly a
 * sleep, so that the autofix can never change behaviour:
 *
 * - `setTimeout(resolve)` has no delay, and the canonical helpers treat a
 *   non-number as a condition to poll, so it would never resolve.
 * - `setTimeout(resolve, ms, arg)` forwards `arg` to `resolve`.
 * - `setTimeout(() => resolve(value), ms)` resolves with a value.
 * - an executor body that does anything else does more than sleep.
 *
 * @param {import('estree').NewExpression} node
 * @returns {import('estree').Node | null}
 */
function getSleepDelay(node) {
  if (node.callee.type !== 'Identifier' || node.callee.name !== 'Promise') {
    return null
  }
  if (node.arguments.length !== 1) {
    return null
  }

  const executor = node.arguments[0]
  if (
    executor.type !== 'ArrowFunctionExpression' &&
    executor.type !== 'FunctionExpression'
  ) {
    return null
  }
  if (
    executor.params.length !== 1 ||
    executor.params[0].type !== 'Identifier'
  ) {
    return null
  }
  const resolveName = executor.params[0].name

  let call = executor.body
  if (call.type === 'BlockStatement') {
    if (call.body.length !== 1) {
      return null
    }
    const statement = call.body[0]
    if (statement.type === 'ExpressionStatement') {
      call = statement.expression
    } else if (statement.type === 'ReturnStatement' && statement.argument) {
      call = statement.argument
    } else {
      return null
    }
  }

  if (call.type !== 'CallExpression') {
    return null
  }
  if (call.callee.type !== 'Identifier' || call.callee.name !== 'setTimeout') {
    return null
  }
  if (call.arguments.length !== 2) {
    return null
  }
  const [callback, delay] = call.arguments
  if (callback.type !== 'Identifier' || callback.name !== resolveName) {
    return null
  }
  if (delay.type === 'SpreadElement') {
    return null
  }

  return delay
}

/**
 * @type {import('eslint').Rule.RuleModule}
 */
const plugin = {
  name: 'no-adhoc-sleep',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Use the canonical sleep helper instead of hand-rolling `new Promise((resolve) => setTimeout(resolve, ms))`.',
      recommended: true,
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          // Name of the canonical helper, e.g. `wait` or `waitFor`.
          helper: { type: 'string' },
          // Bare module specifier, e.g. `next-test-utils`.
          module: { type: 'string' },
          // Repo-relative path, e.g. `packages/next/src/lib/wait`.
          modulePath: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      adhocSleep:
        "Use `{{helper}}({{delay}})` from '{{module}}' instead of hand-rolling a sleep promise. If you are waiting for something to become true, prefer `retry()` — see AGENTS.md, 'Writing Tests'.",
      adhocSleepShadowed:
        'Use the canonical sleep helper instead of hand-rolling a sleep promise. `{{helper}}` is already bound to something else in this scope, so this cannot be fixed automatically: rename that binding first.',
      adhocSleepComment:
        "Use `{{helper}}({{delay}})` from '{{module}}' instead of hand-rolling a sleep promise. Not fixed automatically because the expression contains a comment that would be lost.",
    },
  },

  create(context) {
    const options = context.options[0] || {}
    const helper = options.helper || 'wait'
    const sourceCode = context.sourceCode
    const filename = path.resolve(context.cwd, context.filename)
    const specifier = resolveSpecifier(options, filename, context.cwd)

    // The canonical helper's own module defines the helper with this very
    // pattern, so it must not lint itself.
    if (options.modulePath) {
      const target = path.resolve(context.cwd, options.modulePath)
      if (filename.replace(/\.[cm]?[jt]sx?$/, '') === target) {
        return {}
      }
    }

    /**
     * Is `helper` bound, at `node`, to anything other than a *value* import of
     * the canonical module? Walks the whole scope chain, so a function
     * parameter or a block-local variable named `helper` counts too —
     * rewriting inside such a scope would silently call that binding instead of
     * the helper. A type-only import counts as well: it produces no runtime
     * binding, and a second import with the same local name is invalid.
     */
    function isShadowedAt(node) {
      for (let scope = sourceCode.getScope(node); scope; scope = scope.upper) {
        const variable = scope.set.get(helper)
        if (!variable) {
          continue
        }
        return !variable.defs.every(
          (def) =>
            def.type === 'ImportBinding' &&
            def.parent.type === 'ImportDeclaration' &&
            def.parent.source.value === specifier &&
            def.parent.importKind !== 'type' &&
            def.node.importKind !== 'type'
        )
      }
      return false
    }

    // At most one report per pass may edit the import list, otherwise the
    // fixes overlap and ESLint discards all but one of them.
    let importFixQueued = false

    /**
     * The declaration a `{ helper }` specifier can be added to: a *value*
     * import of the canonical module that is not a namespace import.
     * `import def from '<module>'` is fine — it becomes
     * `import def, { helper } from '<module>'`.
     *
     * Skipped, so that a fresh value import is inserted instead:
     * - `import type { X } from '<module>'` — a specifier added there would
     *   stay type-only, leaving the call without a runtime binding.
     * - `import * as ns from '<module>'` — `* as ns, { helper }` is a syntax
     *   error.
     * - `import '<module>'` — a side-effect import has no specifier list to
     *   extend.
     */
    function findHelperImport() {
      return sourceCode.ast.body.find((statement) => {
        if (
          statement.type !== 'ImportDeclaration' ||
          statement.source.value !== specifier ||
          statement.importKind === 'type' ||
          statement.specifiers.length === 0
        ) {
          return false
        }
        return !statement.specifiers.some(
          (specifierNode) => specifierNode.type === 'ImportNamespaceSpecifier'
        )
      })
    }

    return {
      NewExpression(node) {
        const delay = getSleepDelay(node)
        if (!delay) {
          return
        }

        const data = {
          helper,
          delay: sourceCode.getText(delay),
          module: specifier,
        }

        if (isShadowedAt(node)) {
          context.report({ node, messageId: 'adhocSleepShadowed', data })
          return
        }

        // Rewriting would drop a comment that lives inside the expression.
        if (sourceCode.getCommentsInside(node).length > 0) {
          context.report({ node, messageId: 'adhocSleepComment', data })
          return
        }

        context.report({
          node,
          messageId: 'adhocSleep',
          data,
          *fix(fixer) {
            yield fixer.replaceText(node, `${helper}(${data.delay})`)

            if (importFixQueued) {
              return
            }

            const declaration = findHelperImport()
            if (declaration) {
              const alreadyImported = declaration.specifiers.some(
                (specifierNode) =>
                  specifierNode.type === 'ImportSpecifier' &&
                  specifierNode.local.name === helper
              )
              if (alreadyImported) {
                return
              }
              importFixQueued = true
              const named = declaration.specifiers.filter(
                (specifierNode) => specifierNode.type === 'ImportSpecifier'
              )
              if (named.length > 0) {
                yield fixer.insertTextBefore(named[0], `${helper}, `)
              } else {
                // `import def from 'x'` -> `import def, { helper } from 'x'`
                const last =
                  declaration.specifiers[declaration.specifiers.length - 1]
                yield fixer.insertTextAfter(last, `, { ${helper} }`)
              }
              return
            }

            importFixQueued = true
            const importLine = `import { ${helper} } from '${specifier}'`
            const firstImport = sourceCode.ast.body.find(
              (statement) => statement.type === 'ImportDeclaration'
            )
            if (firstImport) {
              yield fixer.insertTextBefore(firstImport, `${importLine}\n`)
            } else if (sourceCode.ast.body.length > 0) {
              yield fixer.insertTextBefore(
                sourceCode.ast.body[0],
                `${importLine}\n\n`
              )
            }
          },
        })
      },
    }
  },
}

module.exports = plugin

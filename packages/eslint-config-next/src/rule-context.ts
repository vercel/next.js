import type { ESLint, Rule } from 'eslint'

const patchedRules = new WeakSet<Rule.RuleModule>()

/**
 * ESLint 10 removed the deprecated `context.getCwd()`, `context.getFilename()`,
 * `context.getPhysicalFilename()`, `context.getSourceCode()`,
 * `context.parserOptions` and `context.parserPath` rule context members.
 * eslint-plugin-react (e.g. `settings.react.version: 'detect'`) and
 * eslint-plugin-import (e.g. `import/no-default-export`) still read them, and
 * have no release that supports ESLint 10 yet.
 *
 * The rules are patched in place instead of returning a wrapped plugin, so the
 * plugin keeps its identity. Users commonly combine this config with the
 * plugin's own configs (e.g. `react.configs.flat.recommended`), and ESLint
 * rejects two different objects registered under the same plugin name.
 *
 * On ESLint 9 the original context is passed through unchanged.
 */
export function fixupPluginRules<T extends ESLint.Plugin>(plugin: T): T {
  for (const rule of Object.values(plugin.rules ?? {}) as Rule.RuleModule[]) {
    if (typeof rule !== 'object' || patchedRules.has(rule)) continue
    patchedRules.add(rule)

    const create = rule.create
    rule.create = function (context) {
      return create.call(this, fixupRuleContext(context))
    }
  }
  return plugin
}

function fixupRuleContext(context: Rule.RuleContext): Rule.RuleContext {
  if (typeof context.getFilename === 'function') return context

  // The context is frozen, so extend it the same way ESLint does internally.
  return Object.freeze(
    Object.create(context, {
      getCwd: { value: () => context.cwd },
      getFilename: { value: () => context.filename },
      getPhysicalFilename: { value: () => context.physicalFilename },
      getSourceCode: { value: () => context.sourceCode },
      // Same values ESLint 9 provides for flat config.
      parserOptions: { value: { ...context.languageOptions.parserOptions } },
      parserPath: { value: undefined },
    })
  )
}

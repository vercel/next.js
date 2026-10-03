import type { ESLint, Rule } from 'eslint'

/**
 * Bridge the ESLint 9/10 rule-context differences used by eslint-plugin-react
 * 7.37.5. ESLint 10 removed the deprecated getFilename(), getPhysicalFilename(),
 * getCwd(), and getSourceCode() accessors; their replacement properties already
 * exist in ESLint 9. In particular, Next's react.version: 'detect' setting makes
 * the plugin call getFilename() while locating the application's React package,
 * so the unmodified plugin can throw before reporting any lint diagnostics.
 *
 * @eslint/compat 2.1.1 provides an official compatibility layer, but its Node
 * engine range excludes Node 20.9, which Next.js still supports with ESLint 9.
 * This narrower adapter restores the accessors without raising that minimum.
 * It is not a general replacement for @eslint/compat's legacy-rule support, and
 * it does not change the plugin's declared ESLint peer dependency range.
 *
 * eslint-config-next intentionally pins eslint-plugin-react to exactly 7.37.5.
 * Do not replace that pin with a version range: this patch covers this version's
 * deprecated API usage, not arbitrary future versions. Every intentional plugin
 * upgrade, including a patch release, requires reviewing this file and running
 * test/unit/eslint-config-next/compatibility under both engines. Remove this
 * patch after verifying an upstream ESLint 10-compatible release instead of
 * assuming a newer plugin still needs, or is fully covered by, these accessors.
 */
export function fixupReactPlugin(plugin: ESLint.Plugin): ESLint.Plugin {
  return {
    ...plugin,
    rules: Object.fromEntries(
      Object.entries(plugin.rules || {}).map(([name, rule]) => [
        name,
        {
          ...rule,
          create(context: Rule.RuleContext) {
            // ESLint 9 still supplies the old accessors. Preserve its original
            // context and rule execution instead of adding an unnecessary shim.
            if (typeof context.getFilename === 'function') {
              return rule.create(context)
            }

            // ESLint owns and freezes the context. An inheriting object preserves
            // its properties and methods without mutating it or the plugin's
            // original rules, which another configuration may also be using.
            const compatContext = Object.create(context)
            Object.defineProperties(compatContext, {
              getFilename: { value: () => context.filename },
              getPhysicalFilename: { value: () => context.physicalFilename },
              getCwd: { value: () => context.cwd },
              getSourceCode: { value: () => context.sourceCode },
            })

            // Keep the same immutable-context contract that ESLint exposes.
            return rule.create(Object.freeze(compatContext))
          },
        },
      ])
    ),
  }
}

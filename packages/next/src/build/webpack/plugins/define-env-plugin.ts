import type { webpack } from 'next/dist/compiled/webpack/webpack'
import getWebpackBundler from '../../../shared/lib/get-webpack-bundler'

const PLUGIN_NAME = 'NextDefineEnvPlugin'

// Only direct syntax is eligible. In particular, do not infer public keys from
// aliases, destructuring or computed expressions, even if they evaluate to a string.
function publicEnvName(expr: any): string | undefined {
  if (expr?.type !== 'MemberExpression' || expr.optional) return
  const env = expr.object
  if (
    env?.type !== 'MemberExpression' ||
    env.optional ||
    env.object.type !== 'Identifier' ||
    env.object.name !== 'process'
  )
    return
  const property = (node: any) =>
    !node.computed && node.property.type === 'Identifier'
      ? node.property.name
      : node.computed &&
          node.property.type === 'Literal' &&
          typeof node.property.value === 'string'
        ? node.property.value
        : undefined
  if (property(env) !== 'env') return
  const name = property(expr)
  return name?.startsWith('NEXT_PUBLIC_') ? `process.env.${name}` : undefined
}

export class DefineEnvPlugin {
  constructor(
    // Dev env-file reloads update this map in place, just as for DefinePlugin.
    public readonly definitions: Record<string, string | undefined>,
    private readonly inlineMissing: boolean
  ) {}

  apply(compiler: webpack.Compiler) {
    new (getWebpackBundler().DefinePlugin)(this.definitions).apply(compiler)
    if (!this.inlineMissing || process.env.NEXT_RSPACK) return

    const { BasicEvaluatedExpression, webpack: wp } =
      require('next/dist/compiled/webpack/webpack') as typeof import('next/dist/compiled/webpack/webpack')
    compiler.hooks.compilation.tap(
      PLUGIN_NAME,
      (compilation: any, { normalModuleFactory }: any) => {
        const handler = (parser: any) => {
          let reads = new WeakSet<object>()
          // Mark read positions before Webpack walks them. Assignment patterns,
          // updates, delete and optional chains must retain their runtime semantics.
          parser.hooks.program.tap(PLUGIN_NAME, (ast: any) => {
            reads = new WeakSet()
            const visit = (node: any, target = false) => {
              if (!node || typeof node !== 'object') return
              if (Array.isArray(node)) {
                node.forEach((child) => visit(child, target))
                return
              }
              if (
                node.type === 'ForInStatement' ||
                node.type === 'ForOfStatement'
              ) {
                visit(node.left, true)
                visit(node.right)
                visit(node.body)
                return
              }
              if (node.type === 'ChainExpression') return
              if (node.type === 'AssignmentExpression') {
                visit(node.left, true)
                visit(node.right)
                return
              }
              if (
                node.type === 'UpdateExpression' ||
                (node.type === 'UnaryExpression' && node.operator === 'delete')
              )
                return
              if (!target && publicEnvName(node)) {
                reads.add(node)
                // Track both present and absent keys: removing a formerly defined
                // key must invalidate the old DefinePlugin replacement as well.
                const info = parser.state.module.buildInfo
                info.valueDependencies ??= new Map()
                info.valueDependencies.set(
                  'next-public-env-keys',
                  compilation.valueCacheVersions.get('next-public-env-keys')
                )
              }
              for (const key of Object.keys(node)) {
                if (key !== 'loc' && key !== 'range') visit(node[key], target)
              }
            }
            visit(ast)
          })
          const missing = (expr: any) => {
            if (
              !reads.has(expr) ||
              parser.getVariableInfo('process') !== 'process'
            )
              return false
            const name = publicEnvName(expr)!
            if (
              name in this.definitions ||
              'process' in this.definitions ||
              'process.env' in this.definitions ||
              `typeof ${name}` in this.definitions
            )
              return false
            return true
          }
          parser.hooks.evaluate
            .for('MemberExpression')
            .tap({ name: PLUGIN_NAME, stage: -100 }, (expr: any) => {
              if (missing(expr))
                return new BasicEvaluatedExpression()
                  .setUndefined()
                  .setRange(expr.range)
            })
          parser.hooks.evaluate
            .for('UnaryExpression')
            .tap({ name: PLUGIN_NAME, stage: -100 }, (expr: any) => {
              if (expr.operator === 'typeof' && missing(expr.argument))
                return new BasicEvaluatedExpression()
                  .setString('undefined')
                  .setRange(expr.range)
            })
          parser.hooks.expressionMemberChain
            .for('process')
            .tap(PLUGIN_NAME, (expr: any) => {
              if (!missing(expr)) return
              const dep = new wp.dependencies.ConstDependency(
                '(void 0)',
                expr.range
              )
              dep.loc = expr.loc
              parser.state.module.addPresentationalDependency(dep)
              return true
            })
        }
        compilation.valueCacheVersions.set(
          'next-public-env-keys',
          Object.keys(this.definitions).sort().join(',')
        )
        for (const type of [
          'javascript/auto',
          'javascript/dynamic',
          'javascript/esm',
        ])
          normalModuleFactory.hooks.parser.for(type).tap(PLUGIN_NAME, handler)
      }
    )
  }
}

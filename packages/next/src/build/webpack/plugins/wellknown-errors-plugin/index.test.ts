import { WellKnownErrorsPlugin } from './index'

function makeWarning(name: string, context: string) {
  return { name, module: { context } }
}

function runPlugin(warnings: any[], errors: any[] = []) {
  const compilation: any = {
    warnings,
    errors,
    hooks: {
      afterSeal: {
        tapPromise: (_name: string, cb: () => Promise<void>) => {
          ;(compilation as any).__afterSeal = cb
        },
      },
    },
  }
  const compiler: any = {
    hooks: {
      compilation: {
        tap: (_name: string, cb: (c: any) => void) => cb(compilation),
      },
    },
  }
  new WellKnownErrorsPlugin().apply(compiler)
  return compilation.__afterSeal().then(() => compilation)
}

describe('WellKnownErrorsPlugin', () => {
  it('suppresses all adjacent node_modules ModuleDependencyWarnings and keeps first-party ones', async () => {
    const appWarning = makeWarning('SomeRealWarning', '/app/src/c.js')
    const otherAppWarning = makeWarning('DeprecationWarning', '/app/src/d.js')
    const compilation = await runPlugin([
      makeWarning('ModuleDependencyWarning', '/app/node_modules/a/index.js'),
      makeWarning('ModuleDependencyWarning', '/app/node_modules/b/index.js'),
      appWarning,
      makeWarning('ModuleDependencyWarning', '/app/node_modules/c/index.js'),
      otherAppWarning,
    ])

    // Previously, splicing during map skipped the warning right after a
    // removed one (leaving a node_modules warning in place) and deleted
    // unrelated warnings at stale indices.
    expect(compilation.warnings).toEqual([appWarning, otherAppWarning])
  })

  it('keeps ModuleDependencyWarnings from first-party code', async () => {
    const firstParty = makeWarning('ModuleDependencyWarning', '/app/src/e.js')
    const compilation = await runPlugin([firstParty])
    expect(compilation.warnings).toEqual([firstParty])
  })
})

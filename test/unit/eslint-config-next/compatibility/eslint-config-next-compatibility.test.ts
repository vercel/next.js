import { execFileSync } from 'child_process'
import { join } from 'path'

type Diagnostic = { ruleId: string | null; message: string; fatal: boolean }
type ParserCase = {
  name: string
  baseline: Diagnostic[]
  eslint9: Diagnostic[]
  eslint10: Diagnostic[]
}
type ConfigCase = {
  name: string
  engine: string
  diagnostics: Diagnostic[]
  expectedRules: string[]
}

describe('eslint-config-next compatibility', () => {
  // Run the built, consumer-facing exports in native Node rather than Jest's
  // module loader. ESLint 10 and its dependencies use newer module-loading
  // behavior, and the test must exercise real package resolution without mocks.
  // The eslint-10 alias is test-only; the repository's own lint engine stays on 9.
  const results: {
    engines: string[]
    dependencyVersions: {
      react: string
      installedReact: string
      babelParser: string
      babelCore: string
    }
    parserCases: ParserCase[]
    configCases: ConfigCase[]
    scopeManagerErrors: { name: string; message: string | null }[]
  } = JSON.parse(
    execFileSync(process.execPath, [join(__dirname, 'check.mjs')], {
      cwd: __dirname,
      encoding: 'utf8',
    })
  )

  it('runs against ESLint 9 and ESLint 10', () => {
    expect(results.engines).toEqual(['9.37.0', '10.11.0'])
  })

  it('keeps the patch targets exactly pinned until an upgrade is reviewed', () => {
    // A version change or range must force review of react-plugin.ts and
    // babel-scope.ts, even if the behavior tests still happen to pass.
    expect(results.dependencyVersions).toEqual({
      react: '7.37.5',
      installedReact: '7.37.5',
      babelParser: '7.24.6',
      babelCore: '7.26.10',
    })
  })

  it.each(results.parserCases)(
    'preserves Babel scope behavior for $name',
    ({ baseline, eslint9, eslint10 }) => {
      // Matching the unwrapped ESLint 9 baseline verifies scope semantics, not
      // just the absence of a crash. These cases include readonly/off globals,
      // inline declarations, shadowing, script bindings, JSX, and Flow syntax.
      expect(eslint9).toEqual(baseline)
      expect(eslint10).toEqual(baseline)
    }
  )

  it.each(results.configCases)(
    'runs $name under ESLint $engine',
    ({ diagnostics, expectedRules }) => {
      // A configuration that silently disables its rules would also avoid a
      // crash. Require genuine React, accessibility, Next.js, or TypeScript
      // diagnostics from the corresponding exported configuration instead.
      expect(diagnostics.some(({ fatal }) => fatal)).toBe(false)
      expect(diagnostics.map(({ ruleId }) => ruleId)).toEqual(
        expect.arrayContaining(expectedRules)
      )
    }
  )

  it.each(results.scopeManagerErrors)(
    'requires patch review for $name',
    ({ message }) => {
      expect(message).toBe(
        'Unsupported Babel scope manager. Review babel-scope.ts before upgrading the pinned @babel/eslint-parser@7.24.6 / eslint-scope@5.1.1 implementation.'
      )
    }
  )
})

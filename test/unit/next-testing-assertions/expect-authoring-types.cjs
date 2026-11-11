const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createTypeLab } = require('./type-programs.cjs')
const inputs = path.join(__dirname, 'fixtures/expect-authoring-types')
const next = process.argv[2] || path.join(__dirname, '../../../packages/next')
const primitiveTarget = fs.realpathSync(
  path.join(next, 'dist/experimental/testing/primitives/index.d.ts')
)
const primitiveDeclarationTarget = fs.realpathSync(
  path.join(next, 'dist/experimental/testing/primitives/expect/types.d.ts')
)
const assertionTarget = fs.realpathSync(
  path.join(next, 'dist/experimental/testing/assertions/index.d.ts')
)
const expected = JSON.parse(
  fs.readFileSync(path.join(inputs, 'reference.json'))
)
const lab = createTypeLab({
  name: 'expect-authoring-types',
  inputs,
  packageDir: next,
})
const { ts } = lab
try {
  let primitiveGraphChecked = false
  for (const row of expected.programs) {
    const {
      files: [file],
      sources: [source],
    } = lab.writePrograms([row])
    const { program, diagnostics } = lab.compile([file])
    const actual = diagnostics
      .filter((d) => d.file?.fileName === file)
      .map((d) => ({
        code: d.code,
        line: d.file.getLineAndCharacterOfPosition(d.start).line + 1,
      }))
    assert.deepEqual(actual, row.diagnostics, row.name)
    assert.equal(actual.length === 0, row.accepted, row.name)
    assert.deepEqual(fs.readFileSync(file), source)
    if (row.name === 'matcher-static-not-augmentation.ts') {
      const checker = program.getTypeChecker()
      const primitiveSource = program.getSourceFile(primitiveTarget)
      assert(primitiveSource)
      const moduleSymbol = checker.getSymbolAtLocation(primitiveSource)
      const exported = checker
        .getExportsOfModule(moduleSymbol)
        .find((s) => s.name === 'Matchers')
      assert(exported)
      const symbol =
        exported.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(exported)
          : exported
      const declarations = symbol
        .getDeclarations()
        .map((d) => fs.realpathSync(d.getSourceFile().fileName))
      assert(
        declarations.includes(primitiveDeclarationTarget),
        'actual primitive interface declaration'
      )
      assert(
        declarations.includes(assertionTarget),
        'actual emitted module augmentation'
      )
      const actualMatchers = checker.getDeclaredTypeOfSymbol(symbol)
      const authored = checker.getPropertyOfType(actualMatchers, 'toBePayload')
      assert(
        authored,
        'real compiled Matchers inherits the public facade augmentation'
      )
      assert(
        authored
          .getDeclarations()
          .some((d) => d.getSourceFile().fileName === file),
        'matcher originates in the unchanged authored program'
      )
      const actualExpect = checker
        .getExportsOfModule(moduleSymbol)
        .find((s) => s.name === 'ExpectStatic')
      assert(actualExpect)
      const expectSymbol =
        actualExpect.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(actualExpect)
          : actualExpect
      assert(
        checker.getPropertyOfType(
          checker.getDeclaredTypeOfSymbol(expectSymbol),
          'toBePayload'
        ),
        'actual primitive ExpectStatic sees the same matcher'
      )
      primitiveGraphChecked = true
    }
  }
  assert.equal(expected.programs.length, 37)
  assert(primitiveGraphChecked)
  const runtimeFacade = fs.readFileSync(
    path.join(next, 'dist/experimental/testing/vitest.js'),
    'utf8'
  )
  assert(!runtimeFacade.includes('ExpectStatic'))
  assert(!runtimeFacade.includes('ExpectPollOptions'))
  process.stdout.write(
    JSON.stringify({
      programs: 37,
      accepted: 20,
      rejected: 17,
      eachAugmentationIsolated: true,
      rootConfigAndGlobalAugmentations: true,
      publishedFacadeTarget: true,
      actualPrimitiveMatcherGraph: true,
      realUserAugmentationDeclarations: true,
      typeOnlyExports: true,
    }) + '\n'
  )
} finally {
  lab.dispose()
}

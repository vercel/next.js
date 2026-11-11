const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createTypeLab } = require('./type-programs.cjs')
const inputs = path.join(__dirname, 'bench-fn-records')
const expected = JSON.parse(
  fs.readFileSync(path.join(inputs, 'genuine-20.json'))
)
const names = JSON.parse(fs.readFileSync(path.join(inputs, 'PROGRAMS.json')))
const lab = createTypeLab({
  name: 'bench-fn-types',
  inputs,
  packageDir: path.resolve(
    process.argv[2] ?? path.join(__dirname, '../../../packages/next')
  ),
})
try {
  const { files } = lab.writePrograms(
    names.map((name) => ({ name, source: name + '.txt' })),
    { verifyHashes: false }
  )
  const { program, diagnostics } = lab.compile(files)
  const programs = files.map((file, index) => {
    const rows = diagnostics.filter(
      (diagnostic) => diagnostic.file?.fileName === file
    )
    return {
      name: names[index],
      accepted: rows.length === 0,
      diagnostics: rows.map((diagnostic) => ({
        code: diagnostic.code,
        line:
          diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line +
          1,
      })),
    }
  })
  assert.deepEqual(
    programs,
    expected.programs.map(({ name, accepted, diagnostics }) => ({
      name,
      accepted,
      diagnostics,
    }))
  )
  lab.assertNoDependencies(
    program,
    /node_modules\/(?:vitest|vite|prettier|tinybench|@vitest)(?:\/|$)/
  )
  process.stdout.write(
    JSON.stringify({
      runtime: process.version,
      rootConfigAndGlobalAugmentations: true,
      noExternalVitestViteFormatterDeclarations: true,
      typeOnlyNoBenchmarkExecution: true,
      dependencyFreeBenchmarkType: true,
      programs: programs.length,
      accepted: programs.filter((row) => row.accepted).length,
      rejected: programs.filter((row) => !row.accepted).length,
      rows: programs,
    }) + '\n'
  )
} finally {
  lab.dispose()
}

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createHash } = require('node:crypto')

function createTypeLab({
  name,
  inputs,
  repo = path.resolve(__dirname, '../../..'),
  packageDir = process.argv[2] ?? path.join(repo, 'packages/next'),
  realpathTemporary = false,
}) {
  const ts = require(path.join(repo, 'node_modules/typescript'))
  const target = fs.realpathSync(
    path.join(packageDir, 'experimental/testing/vitest.d.ts')
  )
  let temporary = fs.mkdtempSync(path.join(os.tmpdir(), `next-${name}-`))
  if (realpathTemporary) temporary = fs.realpathSync(temporary)
  const digest = (value) => createHash('sha256').update(value).digest('hex')
  const formatHost = {
    getCanonicalFileName: (file) => file,
    getCurrentDirectory: () => repo,
    getNewLine: () => '\n',
  }
  const lab = {
    ts,
    repo,
    packageDir,
    target,
    temporary,
    digest,
    writePrograms(rows, { verifyHashes = true } = {}) {
      const sources = rows.map((row) => {
        const source = fs.readFileSync(path.join(inputs, row.source))
        if (verifyHashes) assert.equal(digest(source), row.sourceSHA256)
        return source
      })
      const files = rows.map((row, index) => {
        const file = path.join(temporary, row.name)
        fs.writeFileSync(file, sources[index])
        return file
      })
      return { files, sources }
    },
    checkProgram(files, parsed, cwd = repo) {
      assert.deepEqual(parsed.errors, [])
      const program = ts.createProgram(parsed.fileNames, parsed.options)
      const diagnostics = ts.getPreEmitDiagnostics(program)
      const foreign = diagnostics.filter(
        (d) => !files.includes(d.file?.fileName)
      )
      assert.equal(
        foreign.length,
        0,
        ts.formatDiagnosticsWithColorAndContext(foreign, {
          ...formatHost,
          getCurrentDirectory: () => cwd,
        })
      )
      return { program, diagnostics }
    },
    compile(files, compilerOptions = {}) {
      const config = ts.readConfigFile(
        path.join(repo, 'tsconfig.json'),
        ts.sys.readFile
      )
      assert.equal(config.error, undefined)
      const parsed = ts.parseJsonConfigFileContent(
        {
          ...config.config,
          compilerOptions: {
            ...config.config.compilerOptions,
            strict: true,
            skipLibCheck: true,
            types: ['node'],
            typeRoots: [path.join(repo, 'node_modules/@types')],
            paths: { vitest: [target] },
            ...compilerOptions,
          },
          files: [...files, path.join(packageDir, 'types/global.d.ts')],
          include: [],
          exclude: [],
        },
        ts.sys,
        repo
      )
      return lab.checkProgram(files, parsed)
    },
    diagnosticRow(diagnostic) {
      const location = diagnostic.file.getLineAndCharacterOfPosition(
        diagnostic.start
      )
      return {
        code: diagnostic.code,
        category: diagnostic.category,
        line: location.line + 1,
        column: location.character + 1,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      }
    },
    assertTypeOnlyImports(sources, names, message) {
      sources.forEach((source, index) => {
        const emitted = ts.transpileModule(source.toString(), {
          fileName: names[index],
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            verbatimModuleSyntax: true,
          },
        }).outputText
        assert(
          !emitted.includes("from 'vitest'") &&
            !emitted.includes('require("vitest")'),
          message
        )
      })
    },
    assertNoDependencies(program, pattern) {
      assert(
        !program
          .getSourceFiles()
          .some((file) => pattern.test(file.fileName.split(path.sep).join('/')))
      )
    },
    dispose() {
      fs.rmSync(temporary, { recursive: true, force: true })
    },
  }
  return lab
}

function verifyTypePrograms(name, options) {
  const inputs = path.join(__dirname, 'fixtures', name)
  const expected = JSON.parse(
    fs.readFileSync(path.join(inputs, 'reference.json'))
  )
  const lab = createTypeLab({
    name,
    inputs,
    packageDir:
      process.argv[2] || path.join(__dirname, '../../../packages/next'),
  })
  try {
    const { files, sources } = lab.writePrograms(expected.programs)
    const { program, diagnostics } = lab.compile(files, {
      paths: { vitest: [lab.target], ...options.paths?.(lab) },
    })
    if (options.typeOnly)
      lab.assertTypeOnlyImports(
        sources,
        expected.programs.map((row) => row.name),
        'Type-only imports must not load a runtime'
      )
    if (options.noDependencies) {
      const foreignDependencies = program
        .getSourceFiles()
        .map((file) => file.fileName)
        .filter((file) => options.noDependencies.test(file))
      assert.deepEqual(
        foreignDependencies,
        [],
        'Published types must be independent of Vitest, Vite and formatter packages'
      )
    }
    if (options.capture && process.argv[3])
      fs.writeFileSync(
        process.argv[3],
        JSON.stringify(
          {
            runtime: process.version,
            typescript: lab.ts.version,
            target: lab.target,
            sourceFiles: program.getSourceFiles().map((file) => file.fileName),
            programs: files.map((file, index) => ({
              name: expected.programs[index].name,
              sourceSHA256: lab.digest(fs.readFileSync(file)),
              diagnostics: diagnostics
                .filter((d) => d.file?.fileName === file)
                .map((d) => {
                  const { code, line, message } = lab.diagnosticRow(d)
                  return { code, line, message }
                }),
            })),
          },
          null,
          2
        ) + '\n'
      )
    files.forEach((file, index) => {
      const row = expected.programs[index]
      const actual = diagnostics
        .filter((d) => d.file?.fileName === file)
        .map((d) => ({
          code: d.code,
          line: d.file.getLineAndCharacterOfPosition(d.start).line + 1,
        }))
      assert.deepEqual(actual, row.diagnostics, row.name)
      assert.equal(actual.length === 0, row.accepted, row.name)
      assert.deepEqual(
        fs.readFileSync(file),
        fs.readFileSync(path.join(inputs, row.source))
      )
    })
    assert.equal(expected.programs.length, options.summary.programs)
    process.stdout.write(JSON.stringify(options.summary) + '\n')
  } finally {
    lab.dispose()
  }
}

module.exports = { createTypeLab, verifyTypePrograms }

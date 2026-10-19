'use strict'
const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const ts = require('typescript')
const assert = require('node:assert/strict')
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex')

async function checkWhenTypes({
  facadeDts,
  inputFile,
  evidenceDir,
  lowerLib = false,
}) {
  await fs.mkdir(evidenceDir, { recursive: true })
  const inputBytes = await fs.readFile(inputFile)
  const facadeBytes = await fs.readFile(facadeDts)
  const resolvedFacadeDts = await fs.realpath(facadeDts)
  const rows = []
  for (const exact of [false, true]) {
    const directory = await fs.mkdtemp(
      path.join(evidenceDir, exact ? 'exact-' : 'loose-')
    )
    const input = path.join(directory, 'input.ts')
    await fs.writeFile(input, inputBytes)
    const config = {
      compilerOptions: {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: lowerLib ? 'ES2020' : 'ESNext',
        ...(lowerLib ? { lib: ['ES2020', 'DOM'] } : {}),
        module: 'ESNext',
        moduleResolution: 'bundler',
        exactOptionalPropertyTypes: exact,
        types: [],
        paths: { vitest: [facadeDts] },
      },
      files: ['input.ts'],
    }
    await fs.writeFile(
      path.join(directory, 'tsconfig.json'),
      JSON.stringify(config, null, 2) + '\n'
    )
    const parsed = ts.parseJsonConfigFileContent(config, ts.sys, directory)
    const program = ts.createProgram(parsed.fileNames, parsed.options)
    const diagnostics = [
      ...parsed.errors,
      ...ts.getPreEmitDiagnostics(program),
    ].map((item) => ({
      code: item.code,
      category: ts.DiagnosticCategory[item.category],
      file: item.file?.fileName ?? null,
      start: item.start ?? null,
      message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
    }))
    const used =
      program.getSourceFile(facadeDts) ??
      program.getSourceFile(resolvedFacadeDts)
    const actual = {
      exact,
      typescript: ts.version,
      lowerLib,
      requestedLib: parsed.options.lib ?? null,
      actualDisposableLibPresent: program
        .getSourceFiles()
        .some((source) =>
          source.fileName.endsWith('lib.esnext.disposable.d.ts')
        ),
      inputSHA256: sha(inputBytes),
      facadeDts,
      resolvedFacadeDts,
      facadeSHA256: sha(facadeBytes),
      consumedFacadeSHA256: used ? sha(used.text) : null,
      diagnostics,
    }
    await fs.writeFile(
      path.join(directory, 'raw-result.json'),
      JSON.stringify(actual, null, 2) + '\n'
    )
    rows.push(actual)
    console.log(JSON.stringify({ actualWhenTypeProgram: actual }))
    assert.deepEqual(diagnostics, [])
    assert.equal(actual.consumedFacadeSHA256, actual.facadeSHA256)
  }
  return rows
}
module.exports = { checkWhenTypes }

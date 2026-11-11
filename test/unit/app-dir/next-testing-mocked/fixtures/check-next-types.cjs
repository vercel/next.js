'use strict'
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const ts = require('typescript')
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')
const save = (file, value) =>
  fs.writeFile(file, JSON.stringify(value, null, 2) + '\n')

/** Maintained CI consumer check. TypeScript reads the actual Next declaration;
 * no facade code, reference declaration, runtime/controller, or type bridge runs.
 */
async function checkNextTypeControls({ facadeDts, inputDir, evidenceDir }) {
  await fs.mkdir(evidenceDir, { recursive: true })
  try {
    assert(path.isAbsolute(facadeDts) && facadeDts.endsWith('.d.ts'))
    const actualFacade = await fs.readFile(facadeDts)
    const expected = JSON.parse(
      await fs.readFile(path.join(inputDir, 'expected-inference.json'), 'utf8')
    )
    const cases = [
      ['main-loose', 'mocked.txt', false, 'main'],
      ['main-exact', 'mocked.txt', true, 'main'],
      ['optionals-loose', 'mocked-optionals-loose.txt', false, 'none'],
      ['optionals-exact', 'mocked-optionals-exact.txt', true, 'none'],
      ['readonly-loose', 'mocked-readonly-observation.txt', false, 'readonly'],
      ['readonly-exact', 'mocked-readonly-observation.txt', true, 'readonly'],
    ]
    await save(path.join(evidenceDir, 'provenance.json'), {
      pid: process.pid,
      node: process.version,
      typescript: ts.version,
      facadeDts,
      facadeSHA256: hash(actualFacade),
      helperSHA256: hash(await fs.readFile(__filename)),
      expectedInferenceSHA256: hash(
        await fs.readFile(path.join(inputDir, 'expected-inference.json'))
      ),
      standaloneConsumerConfig: true,
      publicEditorGlobalBridge: false,
      facadeCodeEvaluated: false,
      referenceDeclarationCopied: false,
    })
    const results = []
    for (const [name, filename, exact, family] of cases) {
      const consumer = await fs.mkdtemp(path.join(evidenceDir, name + '-'))
      const input = path.join(consumer, 'input.ts')
      const bytes = await fs.readFile(path.join(inputDir, filename))
      await fs.writeFile(input, bytes)
      const config = {
        compilerOptions: {
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          target: 'ESNext',
          module: 'ESNext',
          moduleResolution: 'bundler',
          types: [],
          exactOptionalPropertyTypes: exact,
          paths: { vitest: [facadeDts] },
        },
        files: ['input.ts'],
      }
      const configFile = path.join(consumer, 'tsconfig.json')
      await save(configFile, config)
      const parsed = ts.parseJsonConfigFileContent(
        config,
        ts.sys,
        consumer,
        undefined,
        configFile
      )
      const host = ts.createCompilerHost(parsed.options, true)
      const program = ts.createProgram({
        rootNames: parsed.fileNames,
        options: parsed.options,
        host,
      })
      const encode = (diagnostic) => ({
        category: ts.DiagnosticCategory[diagnostic.category],
        code: diagnostic.code,
        file: diagnostic.file?.fileName ?? null,
        start: diagnostic.start ?? null,
        length: diagnostic.length ?? null,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        relatedInformation: (diagnostic.relatedInformation || []).map(encode),
      })
      const diagnostics = [
        ...parsed.errors,
        ...ts.getPreEmitDiagnostics(program),
      ].map(encode)
      const resolution =
        ts.resolveModuleName('vitest', input, parsed.options, host)
          .resolvedModule ?? null
      await save(path.join(consumer, 'raw-diagnostics.json'), {
        name,
        inputSHA256: hash(bytes),
        options: parsed.options,
        resolution,
        diagnostics,
        sourceFiles: program.getSourceFiles().map((source) => source.fileName),
      })
      const checker = program.getTypeChecker()
      const source = program.getSourceFile(input)
      assert(source)
      const probes = []
      const visit = (node) => {
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text.startsWith('probe')
        ) {
          probes.push({
            name: node.name.text,
            type: checker.typeToString(
              checker.getTypeAtLocation(node.name),
              node,
              ts.TypeFormatFlags.NoTruncation
            ),
          })
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
      await save(path.join(consumer, 'raw-inference.json'), probes)
      results.push({
        name,
        diagnostics,
        probes,
        expected: family === 'none' ? [] : expected[family],
        resolution,
      })
    }
    // Every full raw program result exists before any conformance comparison.
    await save(path.join(evidenceDir, 'all-results.json'), results)
    for (const result of results) {
      assert.deepEqual(
        result.diagnostics,
        [],
        result.name + ' complete diagnostics'
      )
      assert.deepEqual(
        result.probes,
        result.expected,
        result.name + ' complete inference probes'
      )
      assert.equal(result.resolution?.resolvedFileName, facadeDts)
    }
    assert.equal(hash(await fs.readFile(facadeDts)), hash(actualFacade))
    return {
      programs: results.length,
      diagnostics: 0,
      probes: results.reduce(
        (count, result) => count + result.probes.length,
        0
      ),
      complete: true,
    }
  } catch (error) {
    await save(path.join(evidenceDir, 'failure.json'), {
      name: error.name,
      message: error.message,
      stack: error.stack,
    })
    throw error
  }
}
module.exports = { checkNextTypeControls }

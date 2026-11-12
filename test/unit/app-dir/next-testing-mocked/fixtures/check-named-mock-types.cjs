'use strict'
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const typeScriptModulePath = require.resolve('typescript')
const ts = require(typeScriptModulePath)
const typeScriptPackagePath = require.resolve('typescript/package.json')

// The committed helper and the release matrix use this same actual namespace,
// not independently accepted compilers that merely report a version string.
function getNamedMockTypeScriptIdentity() {
  assert.equal(
    ts.version,
    '6.0.2',
    'Named mock controls require pinned TypeScript6.0.2'
  )
  assert.equal(require.resolve('typescript'), typeScriptModulePath)
  assert.equal(
    require(typeScriptModulePath),
    ts,
    'Original actual checker module identity must remain unchanged'
  )
  const actualModulePath = fsSync.realpathSync(typeScriptModulePath)
  const actualPackagePath = fsSync.realpathSync(typeScriptPackagePath)
  assert.equal(
    actualPackagePath,
    path.join(path.dirname(path.dirname(actualModulePath)), 'package.json')
  )
  assert.equal(
    JSON.parse(fsSync.readFileSync(actualPackagePath, 'utf8')).version,
    '6.0.2'
  )
  return {
    compiler: ts,
    modulePath: actualModulePath,
    packagePath: actualPackagePath,
    version: ts.version,
  }
}
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')
const save = (file, value) =>
  fs.writeFile(file, JSON.stringify(value, null, 2) + '\n')
const normalize = (value, consumer) => {
  if (typeof value === 'string') return value.split(consumer).join('<consumer>')
  if (Array.isArray(value))
    return value.map((item) => normalize(item, consumer))
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalize(item, consumer),
      ])
    )
  return value
}
const encode = (diagnostic) => ({
  category: ts.DiagnosticCategory[diagnostic.category],
  code: diagnostic.code,
  file: diagnostic.file?.fileName ?? null,
  start: diagnostic.start ?? null,
  length: diagnostic.length ?? null,
  message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  relatedInformation: (diagnostic.relatedInformation || []).map(encode),
})

// Pure TypeScript capture: no facade evaluation or mocked declarations. The
// release host uses exactly this reader for reference/common/client programs.
async function captureNamedMockPrograms({
  facadeDts,
  inputDir,
  evidenceDir,
  lane,
}) {
  const checkerIdentity = getNamedMockTypeScriptIdentity()
  assert(path.isAbsolute(facadeDts) && facadeDts.endsWith('.d.ts'))
  await fs.mkdir(evidenceDir, { recursive: true })
  const facadeBefore = await fs.readFile(facadeDts)
  const definitions = [
    ['main-loose', 'named-mocks.txt', false, 'main'],
    ['main-exact', 'named-mocks.txt', true, 'main'],
    [
      'augmentation-loose',
      'named-mocks-augmentation.txt',
      false,
      'augmentation',
    ],
    [
      'augmentation-exact',
      'named-mocks-augmentation.txt',
      true,
      'augmentation',
    ],
  ]
  const inputsBefore = []
  for (const filename of [...new Set(definitions.map((row) => row[1]))]) {
    const bytes = await fs.readFile(path.join(inputDir, filename))
    inputsBefore.push({ filename, sha256: hash(bytes) })
  }
  await save(path.join(evidenceDir, 'provenance-before.json'), {
    pid: process.pid,
    node: process.version,
    typescript: checkerIdentity.version,
    typeScriptModulePath: checkerIdentity.modulePath,
    typeScriptModuleSHA256: hash(await fs.readFile(checkerIdentity.modulePath)),
    typeScriptPackagePath: checkerIdentity.packagePath,
    lane,
    facadeDts,
    facadeSHA256: hash(facadeBefore),
    inputs: inputsBefore,
    helperSHA256: hash(await fs.readFile(__filename)),
    standaloneConsumerConfig: true,
    publicEditorGlobalBridge: false,
    facadeCodeEvaluated: false,
    referenceDeclarationCopied: false,
  })
  const results = []
  for (const [name, filename, exact, family] of definitions) {
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
    const actualReadFile = host.readFile.bind(host)
    const readInputs = new Map()
    host.readFile = (file) => {
      const text = actualReadFile(file)
      if (text !== undefined)
        readInputs.set(file, {
          file,
          usedTextSHA256: hash(Buffer.from(text)),
          diskBytesSHA256BeforeCompilerConsumption: hash(
            fsSync.readFileSync(file)
          ),
        })
      return text
    }
    const program = ts.createProgram({
      rootNames: parsed.fileNames,
      options: parsed.options,
      host,
    })
    const diagnostics = [
      ...parsed.errors,
      ...ts.getPreEmitDiagnostics(program),
    ].map(encode)
    const resolution =
      ts.resolveModuleName('vitest', input, parsed.options, host)
        .resolvedModule ?? null
    const sourceInputs = []
    for (const source of program.getSourceFiles()) {
      const actual = await fs.readFile(source.fileName)
      sourceInputs.push({
        file: source.fileName,
        sha256: hash(actual),
        actualCompilerTextSHA256: hash(Buffer.from(source.text)),
      })
    }
    await save(path.join(consumer, 'raw-diagnostics.json'), {
      lane,
      name,
      family,
      inputSHA256: hash(bytes),
      options: parsed.options,
      resolution,
      diagnostics,
      sourceInputs,
      compilerReadsBeforeConsumption: [...readInputs.values()],
    })
    const checker = program.getTypeChecker()
    const source = program.getSourceFile(input)
    assert(source, 'Actual literal consumer source must be present')
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
    for (const row of sourceInputs)
      assert.equal(
        hash(await fs.readFile(row.file)),
        row.sha256,
        'Actual program input changed: ' + row.file
      )
    for (const row of readInputs.values())
      assert.equal(
        hash(await fs.readFile(row.file)),
        row.diskBytesSHA256BeforeCompilerConsumption,
        'Observed compiler input changed: ' + row.file
      )
    results.push({
      lane,
      name,
      family,
      exact,
      inputSHA256: hash(bytes),
      options: parsed.options,
      resolution,
      diagnostics,
      normalizedDiagnostics: normalize(diagnostics, consumer),
      probes,
    })
  }
  // Preserve all full raw results, including observation errors, before any
  // conformance or baseline qualification comparison.
  await save(path.join(evidenceDir, 'all-results.json'), results)
  assert.equal(hash(await fs.readFile(facadeDts)), hash(facadeBefore))
  for (const row of inputsBefore)
    assert.equal(
      hash(await fs.readFile(path.join(inputDir, row.filename))),
      row.sha256
    )
  await save(path.join(evidenceDir, 'provenance-after.json'), {
    facadeSHA256: hash(await fs.readFile(facadeDts)),
    inputs: inputsBefore,
    completePrograms: results.length,
  })
  return results
}

async function checkNamedMockTypeControls({
  commonDts,
  clientDts,
  inputDir,
  evidenceDir,
}) {
  await fs.mkdir(evidenceDir, { recursive: true })
  try {
    const results = [
      ...(await captureNamedMockPrograms({
        facadeDts: commonDts,
        inputDir,
        evidenceDir: path.join(evidenceDir, 'common'),
        lane: 'common',
      })),
      ...(await captureNamedMockPrograms({
        facadeDts: clientDts,
        inputDir,
        evidenceDir: path.join(evidenceDir, 'client'),
        lane: 'client',
      })),
    ]
    await save(path.join(evidenceDir, 'all-results.json'), results)
    const expectedBytes = await fs.readFile(
      path.join(inputDir, 'named-mocks-expected.json')
    )
    const expected = JSON.parse(expectedBytes.toString())
    await save(path.join(evidenceDir, 'baseline-data.json'), {
      sha256: hash(expectedBytes),
      value: expected,
    })
    assert.equal(
      expected.qualified,
      true,
      'Named-type upstream observations have not been qualified'
    )
    assert.equal(expected.vitest, '5.0.4')
    assert.equal(expected.typescript, ts.version)
    for (const result of results) {
      const expectedResult = expected.results[result.name]
      assert(expectedResult, 'Every exact-mode/family baseline must be present')
      if (result.family === 'main')
        assert.deepEqual(
          result.diagnostics,
          [],
          result.lane + '/' + result.name + ' complete positive diagnostics'
        )
      assert.deepEqual(
        result.normalizedDiagnostics,
        expectedResult.diagnostics,
        result.lane + '/' + result.name + ' full diagnostics'
      )
      assert.deepEqual(
        result.probes,
        expectedResult.probes,
        result.lane + '/' + result.name + ' all probes'
      )
      assert.equal(
        result.resolution?.resolvedFileName,
        result.lane === 'common' ? commonDts : clientDts
      )
    }
    return {
      programs: results.length,
      positivePrograms: 4,
      observationPrograms: 4,
      positiveDiagnostics: 0,
      probes: results.reduce((n, row) => n + row.probes.length, 0),
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
module.exports = {
  getNamedMockTypeScriptIdentity,
  captureNamedMockPrograms,
  checkNamedMockTypeControls,
}

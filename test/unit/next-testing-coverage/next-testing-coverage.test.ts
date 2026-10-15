import { promises as customFileSystem } from 'fs'
import { mkdtemp, writeFile, rm, readFile, realpath } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'
import {
  buildCoverageMetadata,
  coverageHash,
} from 'next/dist/experimental/testing/coverage/artifact'
import { decodeCoverageMap } from 'next/dist/experimental/testing/coverage/maps'
import { remapCoverage } from 'next/dist/experimental/testing/coverage/remap'
import {
  createCoverageReport,
  writeCoverageReport,
} from 'next/dist/experimental/testing/coverage/report'
import type { CompiledTestArtifact } from 'next/dist/experimental/testing/contracts'
import type {
  CoverageCapture,
  CoverageArtifactMetadata,
} from 'next/dist/experimental/testing/coverage/types'

const profile = {
  id: 'node',
  mode: 'development',
  environment: 'node',
  runtime: 'nodejs',
  bundler: 'turbopack',
} as const
const source =
  'export function choose(flag: boolean) {\n  if (flag) return 1\n  return 0\n}\n'
const generated =
  'function choose(flag) {\n  if (flag) return 1;\n  return 0;\n}\nchoose(true);\n'

function makeMap(file: string, content = source) {
  return {
    version: 3,
    sources: [pathToFileURL(file).href],
    sourcesContent: [content],
    names: [],
    mappings: 'AAAA;AACA;AACA;AACA;A',
  }
}

async function fixture(mapTransform = (map: any): any => map) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'next-line-coverage-'))
  )
  const subject = join(root, 'subject.ts')
  const entry = join(root, 'entry.test.ts')
  await writeFile(subject, source)
  await writeFile(entry, '')
  await writeFile(join(root, 'entry.js'), generated)
  await writeFile(
    join(root, 'entry.js.map'),
    JSON.stringify(mapTransform(makeMap(subject)))
  )
  const files = ['entry.js', 'entry.js.map']
  const coverage = await buildCoverageMetadata({
    rootDir: root,
    files,
    projectDir: root,
    sourceRootDir: root,
    entryFile: entry,
    setupFiles: [],
  })
  const artifact: CompiledTestArtifact & {
    coverage: CoverageArtifactMetadata
  } = {
    version: 2,
    kind: 'node',
    profile,
    entryId: 'one',
    revision: 'r1',
    rootDir: root,
    entryPath: 'entry.js',
    files,
    diagnostics: [],
    coverage,
  }
  const capture: CoverageCapture = {
    version: 1,
    scripts: [
      {
        path: 'entry.js',
        sha256: coverageHash(generated),
        functions: [
          {
            isBlockCoverage: true,
            ranges: [
              { startOffset: 0, endOffset: generated.length, count: 1 },
              {
                startOffset: generated.indexOf('  return 0'),
                endOffset: generated.indexOf(
                  '\n}',
                  generated.indexOf('return 0')
                ),
                count: 0,
              },
            ],
          },
        ],
      },
    ],
  }
  return { root, subject, artifact, capture }
}

it.each(['flat', 'indexed'])(
  'maps %s source ranges and excludes the generated invocation',
  async (kind) => {
    const f = await fixture((map) =>
      kind === 'flat'
        ? map
        : { version: 3, sections: [{ offset: { line: 0, column: 0 }, map }] }
    )
    try {
      const result = await remapCoverage(f.artifact, f.capture)
      expect(result.files).toEqual([
        {
          file: f.subject,
          sha256: coverageHash(source),
          executableLines: [1, 2, 3, 4],
          coveredLines: [1, 2, 4],
        },
      ])
      const report = createCoverageReport(['one', 'two'])
      report.add(result)
      report.add({
        ...result,
        entryId: 'two',
        files: [{ ...result.files[0], coveredLines: [3] }],
      })
      const merged = report.finish()
      expect(merged.totals).toEqual({ executable: 4, covered: 4, percent: 100 })
      const output = await writeCoverageReport(merged, tmpdir())
      await rm(f.root, { recursive: true, force: true })
      expect(JSON.parse(await readFile(output.jsonPath, 'utf8'))).toEqual(
        merged
      )
      expect(await readFile(output.textPath, 'utf8')).toContain('4/4 (100.00%)')
      await rm(join(output.jsonPath, '..'), { recursive: true, force: true })
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  }
)

it('rejects changed emitted bytes, changed maps, missing capture and malformed ranges', async () => {
  const f = await fixture()
  try {
    await expect(
      remapCoverage(f.artifact, { version: 1, scripts: [] })
    ).rejects.toThrow('missing the entry')
    const bad = structuredClone(f.capture)
    bad.scripts[0].functions[0].ranges[0].endOffset++
    await expect(remapCoverage(f.artifact, bad)).rejects.toThrow('Invalid V8')
    const crossing = structuredClone(f.capture)
    crossing.scripts[0].functions[0].ranges = [
      { startOffset: 0, endOffset: generated.length, count: 1 },
      { startOffset: 1, endOffset: 40, count: 0 },
      { startOffset: 30, endOffset: 50, count: 1 },
    ]
    await expect(remapCoverage(f.artifact, crossing)).rejects.toThrow(
      'Crossing V8'
    )
    await writeFile(join(f.root, 'entry.js'), generated + '//changed')
    await expect(remapCoverage(f.artifact, f.capture)).rejects.toThrow(
      'changed before remapping'
    )
    await writeFile(join(f.root, 'entry.js'), generated)
    await writeFile(join(f.root, 'entry.js.map'), '{}')
    await expect(remapCoverage(f.artifact, f.capture)).rejects.toThrow(
      'changed before remapping'
    )
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it('validates original source content and indexed section ordering', async () => {
  await expect(
    fixture((map) => ({ ...map, sourcesContent: ['incorrect'] }))
  ).rejects.toThrow('content mismatch')
  const map = makeMap('/project/subject.ts')
  expect(() =>
    decodeCoverageMap({
      version: 3,
      sections: [
        { offset: { line: 0, column: 0 }, map },
        { offset: { line: 1, column: 0 }, map },
      ],
    })
  ).toThrow('Overlapping')
  expect(() => decodeCoverageMap({ ...map, mappings: '!' })).toThrow()
})

it('does not publish a percentage when a file or source revision is missing', async () => {
  const f = await fixture()
  try {
    const result = await remapCoverage(f.artifact, f.capture)
    const missing = createCoverageReport(['one', 'two'])
    missing.add(result)
    expect(missing.finish()).toMatchObject({
      complete: false,
      totals: { percent: null },
    })
    const changed = createCoverageReport(['one', 'two'])
    changed.add(result)
    changed.add({
      ...result,
      entryId: 'two',
      files: [{ ...result.files[0], sha256: 'changed' }],
    })
    expect(changed.finish()).toMatchObject({
      complete: false,
      totals: { percent: null },
    })
    expect(() => changed.add(result)).toThrow('duplicate')
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it('collects actual V8 ranges and verifies loaded bytes in a fresh process', async () => {
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  const f = await fixture()
  try {
    const artifactPath = join(f.root, 'artifact.json')
    const capturePath = join(f.root, 'capture.json')
    await writeFile(artifactPath, JSON.stringify(f.artifact))
    await promisify(execFile)(process.execPath, [
      join(__dirname, 'collector-worker.cjs'),
      artifactPath,
      capturePath,
    ])
    const capture = JSON.parse(await readFile(capturePath, 'utf8'))
    const result = await remapCoverage(f.artifact, capture)
    expect(result.files[0].executableLines).toEqual([1, 2, 3, 4])
    expect(result.files[0].coveredLines).toEqual([1, 2, 4])
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it('removes only its unpublished directory when a report write fails or is aborted', async () => {
  const fs = require('fs/promises') as typeof import('fs/promises')
  const directory = await mkdtemp(join(tmpdir(), 'next-coverage-output-'))
  const report = createCoverageReport([]).finish()
  const originalWrite = fs.writeFile
  try {
    await writeFile(join(directory, 'user-file'), 'keep')
    const failure = new Error('text write failed')
    const write = jest
      .spyOn(fs, 'writeFile')
      .mockImplementationOnce(originalWrite)
      .mockRejectedValueOnce(failure)
    await expect(writeCoverageReport(report, directory)).rejects.toBe(failure)
    write.mockRestore()
    expect(await fs.readdir(directory)).toEqual(['user-file'])
    const controller = new AbortController()
    const reason = new Error('coverage cancelled')
    const abortWrite = jest
      .spyOn(fs, 'writeFile')
      .mockImplementationOnce(async (...args) => {
        await originalWrite(...args)
        controller.abort(reason)
      })
    await expect(
      writeCoverageReport(report, directory, controller.signal)
    ).rejects.toBe(reason)
    abortWrite.mockRestore()
    expect(await fs.readdir(directory)).toEqual(['user-file'])
  } finally {
    jest.restoreAllMocks()
    await rm(directory, { recursive: true, force: true })
  }
})

it('excludes spec, setup and framework sources without hiding project content errors', async () => {
  const f = await fixture()
  try {
    const options = {
      rootDir: f.root,
      files: f.artifact.files,
      projectDir: f.root,
      sourceRootDir: f.root,
      entryFile: join(f.root, 'entry.test.ts'),
      setupFiles: [f.subject],
    }
    const metadata = await buildCoverageMetadata(options)
    expect(metadata.sources[pathToFileURL(f.subject).href]).toBeNull()
    const specMap = makeMap(options.entryFile, '')
    await writeFile(join(f.root, 'entry.js.map'), JSON.stringify(specMap))
    expect(
      (await buildCoverageMetadata(options)).sources[
        pathToFileURL(options.entryFile).href
      ]
    ).toBeNull()
    await writeFile(
      join(f.root, 'entry.js.map'),
      JSON.stringify({
        ...specMap,
        sources: ['turbopack:///[next]/runtime.js'],
      })
    )
    expect(
      (await buildCoverageMetadata(options)).sources[
        'turbopack:///[next]/runtime.js'
      ]
    ).toBeNull()
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it('preserves indexed column offsets and separate sources', () => {
  const flat = (name: string) => ({
    version: 3,
    sources: [name],
    sourcesContent: ['x'],
    names: [],
    mappings: 'AAAA',
  })
  const result = decodeCoverageMap({
    version: 3,
    sections: [
      { offset: { line: 0, column: 3 }, map: flat('/first.ts') },
      { offset: { line: 1, column: 5 }, map: flat('/second.ts') },
    ],
  })
  expect(result.mappings.filter((item) => item.source)).toEqual([
    expect.objectContaining({
      source: '/first.ts',
      generatedLine: 1,
      generatedColumn: 3,
      originalLine: 1,
    }),
    expect.objectContaining({
      source: '/second.ts',
      generatedLine: 2,
      generatedColumn: 5,
      originalLine: 1,
    }),
  ])
  expect([...result.sources.keys()]).toEqual(['/first.ts', '/second.ts'])
})

it.each([
  ['app.ts', 'app.ts'],
  ['app.ts', './app.ts'],
])(
  'rejects duplicate normalized source indices %s %s with conflicting content',
  (first, second) => {
    expect(() =>
      decodeCoverageMap({
        version: 3,
        sources: [first, second],
        sourcesContent: ['one', 'two'],
        names: [],
        mappings: 'AAAA,CCAA',
      })
    ).toThrow('Conflicting coverage source content')
  }
)

it('excludes symlinks whose canonical identity is inside node_modules', async () => {
  const { mkdir, symlink } = await import('fs/promises')
  const f = await fixture()
  try {
    const directory = join(f.root, 'node_modules', 'package')
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'index.js'), source)
    const alias = join(f.root, 'vendor-link.js')
    await symlink(join(directory, 'index.js'), alias)
    await writeFile(
      join(f.root, 'entry.js.map'),
      JSON.stringify(makeMap(alias))
    )
    const metadata = await buildCoverageMetadata({
      rootDir: f.root,
      files: f.artifact.files,
      projectDir: f.root,
      sourceRootDir: f.root,
      entryFile: join(f.root, 'entry.test.ts'),
      setupFiles: [],
    })
    expect(metadata.sources[pathToFileURL(alias).href]).toBeNull()
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it('recognizes original sources reached through the configured project symlink', async () => {
  const { symlink } = await import('fs/promises')
  const f = await fixture()
  const alias = f.root + '-alias'
  try {
    await symlink(f.root, alias)
    const subjectAlias = join(alias, 'subject.ts')
    await writeFile(
      join(f.root, 'entry.js.map'),
      JSON.stringify(makeMap(subjectAlias))
    )
    const metadata = await buildCoverageMetadata({
      rootDir: f.root,
      files: f.artifact.files,
      projectDir: alias,
      sourceRootDir: alias,
      entryFile: join(alias, 'entry.test.ts'),
      setupFiles: [],
    })
    expect(metadata.sources[pathToFileURL(subjectAlias).href]).toEqual({
      file: f.subject,
      sha256: coverageHash(source),
    })
  } finally {
    await rm(alias, { force: true })
    await rm(f.root, { recursive: true, force: true })
  }
})

it('accepts nested indexed maps without mistaking parent boundaries for overlapping siblings', () => {
  const flat = {
    version: 3,
    sources: ['/subject.ts'],
    sourcesContent: ['x'],
    names: [],
    mappings: 'AAAA',
  }
  const result = decodeCoverageMap({
    version: 3,
    sections: [
      {
        offset: { line: 1, column: 2 },
        map: {
          version: 3,
          sections: [{ offset: { line: 0, column: 3 }, map: flat }],
        },
      },
    ],
  })
  expect(result.mappings.filter((item) => item.source)).toEqual([
    expect.objectContaining({
      source: '/subject.ts',
      generatedLine: 2,
      generatedColumn: 5,
      originalLine: 1,
    }),
  ])
})

it('accepts Next indexed-map compatibility fields and explicit unmapped sentinels', () => {
  const result = decodeCoverageMap({
    version: 3,
    sources: [],
    sections: [
      {
        offset: { line: 0, column: 0 },
        map: { version: 3, sources: [], names: [], mappings: 'A' },
      },
      {
        offset: { line: 1, column: 0 },
        map: {
          version: 3,
          sources: ['/app.ts'],
          sourcesContent: ['x'],
          names: [],
          mappings: 'AAAA',
        },
      },
    ],
  })
  expect(result.mappings.filter((mapping) => mapping.source)).toEqual([
    expect.objectContaining({
      source: '/app.ts',
      generatedLine: 2,
      originalLine: 1,
    }),
  ])
  expect(() =>
    decodeCoverageMap({ version: 3, sources: ['/hidden.ts'], sections: [] })
  ).toThrow('Mixed indexed')
  expect(() =>
    decodeCoverageMap({
      version: 3,
      sources: ['/missing.ts'],
      names: [],
      mappings: 'AAAA',
    })
  ).toThrow('sources or content')
})

it('derives standard statement, branch and function counts from actual V8 ranges', async () => {
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  // The fixture consumes the vendored runtime; its public subpath has no types.
  const { SourceMapGenerator } = (await import(
    'next/dist/compiled/source-map'
  )) as unknown as {
    SourceMapGenerator: new () => {
      addMapping(mapping: {
        generated: { line: number; column: number }
        original?: { line: number; column: number }
        source?: string
      }): void
      setSourceContent(file: string, content: string): void
      toString(): string
    }
  }
  const { remapStandardCoverage, createUncoveredJavaScript } = await import(
    'next/dist/experimental/testing/coverage/istanbul'
  )
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'next-standard-coverage-'))
  )
  const original =
    'function choose(flag) {\n  if (flag) return 1\n  return 0\n}\nfunction unused() {\n  return 7\n}\n'
  const code = original + 'choose(true)\n'
  const subject = join(root, 'subject.mjs')
  const entry = join(root, 'entry.test.mjs')
  try {
    await writeFile(subject, original)
    await writeFile(entry, '')
    await writeFile(join(root, 'entry.js'), code)
    const map = new SourceMapGenerator()
    for (const [index, line] of original.split('\n').entries()) {
      let column = 0
      for (const token of line.matchAll(/\w+|\s|[^\w\s]/g)) {
        const position = { line: index + 1, column }
        map.addMapping({
          generated: position,
          source: pathToFileURL(subject).href,
          original: position,
        })
        column += token[0].length
      }
    }
    map.addMapping({ generated: { line: 8, column: 0 } })
    map.setSourceContent(pathToFileURL(subject).href, original)
    await writeFile(join(root, 'entry.js.map'), map.toString())
    const files = ['entry.js', 'entry.js.map']
    const coverage = await buildCoverageMetadata({
      rootDir: root,
      files,
      projectDir: root,
      sourceRootDir: root,
      entryFile: entry,
      setupFiles: [],
    })
    const artifact: CompiledTestArtifact = {
      version: 2,
      kind: 'node',
      profile,
      entryId: 'standard',
      revision: 'r1',
      rootDir: root,
      entryPath: 'entry.js',
      files,
      diagnostics: [],
      coverage,
    }
    const artifactPath = join(root, 'artifact.json')
    const capturePath = join(root, 'capture.json')
    await writeFile(artifactPath, JSON.stringify(artifact))
    await promisify(execFile)(process.execPath, [
      join(__dirname, 'collector-worker.cjs'),
      artifactPath,
      capturePath,
    ])
    const capture = JSON.parse(await readFile(capturePath, 'utf8'))
    const result = await remapStandardCoverage(artifact, capture)
    expect(result.files).toHaveLength(1)
    const data = result.files[0].data
    expect(data.path).toBe(subject)
    expect(data.s).toEqual({ 0: 1, 1: 1, 2: 0, 3: 0 })
    expect(data.f).toEqual({ 0: 1, 1: 0 })
    expect(data.b).toEqual({ 0: [1, 0] })
    expect(Object.values(data.fnMap).map((fn) => fn.name)).toEqual([
      'choose',
      'unused',
    ])
    expect(data.fnMap).toEqual(
      (await createUncoveredJavaScript(subject, original)).fnMap
    )
    const invalid = structuredClone(capture)
    invalid.scripts[0].sha256 = '0'.repeat(64)
    await expect(remapStandardCoverage(artifact, invalid)).rejects.toThrow(
      'Missing, duplicate or unmapped'
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('creates zero standard metrics without executing an unimported source and rejects transformed syntax', async () => {
  const { createUncoveredJavaScript } = await import(
    'next/dist/experimental/testing/coverage/istanbul'
  )
  const file = join(tmpdir(), 'unimported.mjs')
  const data = await createUncoveredJavaScript(
    file,
    'throw new Error("must never run")\nexport function untouched() {\n  return 9\n}\n'
  )
  expect(data.path).toBe(file)
  expect(data.s).toEqual({ 0: 0, 1: 0 })
  expect(data.f).toEqual({ 0: 0 })
  expect(data.fnMap[0].name).toBe('untouched')
  await expect(
    createUncoveredJavaScript(file, 'const x: number = 1')
  ).rejects.toThrow('syntax-preserved JavaScript')
  await expect(
    createUncoveredJavaScript(file, 'export default <div/>')
  ).rejects.toThrow('syntax-preserved JavaScript')
  await expect(
    createUncoveredJavaScript(file.replace('.mjs', '.ts'), 'export const x = 1')
  ).rejects.toThrow('JavaScript source file')
})

it('parses explicit standard coverage flags without changing bare coverage', async () => {
  const { parseStandardCoverageOptions } = await import(
    'next/dist/experimental/testing/coverage/options'
  )
  expect(parseStandardCoverageOptions({ coverage: true })).toBeUndefined()
  expect(
    parseStandardCoverageOptions({
      'coverage.reporter': ['json', 'lcov', 'json'],
      'coverage.include': ['subject.mjs'],
      'coverage.exclude': ['excluded.mjs'],
      'coverage.thresholds.branches': '100',
      'coverage.reportOnFailure': 'false',
    })
  ).toEqual({
    reporter: ['json', 'lcov'],
    include: ['subject.mjs'],
    exclude: ['excluded.mjs'],
    reportsDirectory: 'coverage',
    reportOnFailure: false,
    thresholds: { branches: 100 },
  })
  expect(() =>
    parseStandardCoverageOptions({ 'coverage.thresholds.lines': '101' })
  ).toThrow('between 0 and 100')
  expect(() =>
    parseStandardCoverageOptions({ 'coverage.reporter': ['html'] })
  ).toThrow('unsupported')
})

async function standardReportFixture() {
  const { createUncoveredJavaScript } = await import(
    'next/dist/experimental/testing/coverage/istanbul'
  )
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'next-standard-report-'))
  )
  const file = join(root, 'subject.mjs')
  const source =
    'export function choose(value) {\n  if (value) return 1\n  return 0\n}\nexport function unused() {\n  return 7\n}\n'
  await writeFile(file, source)
  await writeFile(
    join(root, 'unimported.mjs'),
    'throw new Error("must not execute")\nexport function untouched() { return 9 }\n'
  )
  await writeFile(join(root, 'excluded.mjs'), 'export const excluded = 1\n')
  // Explicit unit inputs exercise count arithmetic independently of V8, which
  // the adjacent native collector test and public compiler proof validate.
  const data = await createUncoveredJavaScript(file, source)
  data.f['0'] = 1
  data.s['0'] = 1
  data.s['1'] = 1
  data.b['0'] = [1, 0]
  const facts = [
    {
      version: 1 as const,
      entryId: 'one',
      revision: 'r1',
      complete: true,
      errors: [],
      files: [{ file, sha256: coverageHash(source), data }],
    },
  ]
  const config = {
    reporter: ['json', 'lcov'] as ('json' | 'lcov')[],
    include: ['*.mjs'],
    exclude: ['excluded.mjs'],
    reportsDirectory: 'coverage',
    reportOnFailure: false,
    thresholds: { branches: 100 },
  }
  return {
    root,
    file,
    source,
    data,
    facts,
    config,
    expected: new Set(['one']),
    excludedFiles: [],
  }
}

it('merges standard hits by original location and derives Istanbul line and branch totals', async () => {
  const { mergeStandardCoverageData, standardCoverageSummary } = await import(
    'next/dist/experimental/testing/coverage/report-standard'
  )
  const f = await standardReportFixture()
  try {
    const other = structuredClone(f.data)
    // Numeric IDs are generated-file details; association uses source locations.
    ;[other.fnMap['0'], other.fnMap['1']] = [other.fnMap['1'], other.fnMap['0']]
    ;[other.f['0'], other.f['1']] = [other.f['1'], other.f['0']]
    const merged = mergeStandardCoverageData(f.data, other)
    expect(merged.f).toEqual({ 0: 2, 1: 0 })
    expect(merged.b).toEqual({ 0: [2, 0] })
    expect(merged.s).toEqual({ 0: 2, 1: 2, 2: 0, 3: 0 })
    expect(standardCoverageSummary({ [f.file]: merged })).toEqual({
      statements: { total: 4, covered: 2, percent: 50 },
      functions: { total: 2, covered: 1, percent: 50 },
      branches: { total: 2, covered: 1, percent: 50 },
      lines: { total: 3, covered: 1, percent: 33.33 },
    })
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it('publishes complete standard JSON and LCOV including unimported sources before reporting threshold failure', async () => {
  const { publishStandardCoverage } = await import(
    'next/dist/experimental/testing/coverage/report-standard'
  )
  const f = await standardReportFixture()
  try {
    const result = await publishStandardCoverage({
      projectDir: f.root,
      ...f,
      status: 'passed',
    })
    expect(result.published).toBe(true)
    expect(result.thresholdErrors).toEqual([
      'Coverage for branches (50%) does not meet global threshold (100%).',
    ])
    const data = JSON.parse(
      await readFile(join(f.root, 'coverage/coverage-final.json'), 'utf8')
    )
    expect(
      Object.keys(data).map((file) => file.slice(f.root.length + 1))
    ).toEqual(['subject.mjs', 'unimported.mjs'])
    for (const [file, value] of Object.entries(data) as [string, any][])
      expect(value.path).toBe(file)
    expect(Object.values(data[join(f.root, 'unimported.mjs')].f)).toEqual([0])
    expect(
      await readFile(join(f.root, 'coverage/lcov.info'), 'utf8')
    ).toContain('BRDA:2,0,1,0')
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it('rejects unowned standard facts, changed sources, invalid coordinates and incomplete entries', async () => {
  const { assertStandardCoverageFacts } = await import(
    'next/dist/experimental/testing/coverage/report-standard'
  )
  const f = await standardReportFixture()
  try {
    await assertStandardCoverageFacts(
      f.facts,
      f.root,
      f.expected,
      new Map([['one', 'r1']])
    )
    await expect(
      assertStandardCoverageFacts(
        f.facts,
        f.root,
        f.expected,
        new Map([['one', 'forged']])
      )
    ).rejects.toThrow('unowned')
    await expect(
      assertStandardCoverageFacts([], f.root, f.expected)
    ).rejects.toThrow('omitted')
    const forged = structuredClone(f.facts)
    forged[0].files[0].data.path = join(tmpdir(), 'foreign.mjs')
    await expect(
      assertStandardCoverageFacts(forged, f.root, f.expected)
    ).rejects.toThrow('does not match')
    const invalid = structuredClone(f.facts)
    invalid[0].files[0].data.statementMap['0'].start.column = 10000
    await expect(
      assertStandardCoverageFacts(invalid, f.root, f.expected)
    ).rejects.toThrow('exceeds original source')
    await writeFile(f.file, f.source + '//changed')
    await expect(
      assertStandardCoverageFacts(f.facts, f.root, f.expected)
    ).rejects.toThrow('changed after capture')
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it('preserves previous standard reports on cancellation and refuses unrelated output directories', async () => {
  const { publishStandardCoverage } = await import(
    'next/dist/experimental/testing/coverage/report-standard'
  )
  const f = await standardReportFixture()
  try {
    await publishStandardCoverage({
      projectDir: f.root,
      ...f,
      status: 'passed',
    })
    const report = join(f.root, 'coverage/coverage-final.json')
    const previous = await readFile(report)
    const controller = new AbortController()
    controller.abort(new Error('cancelled before publication'))
    await expect(
      publishStandardCoverage({
        projectDir: f.root,
        ...f,
        status: 'passed',
        signal: controller.signal,
      })
    ).rejects.toThrow('cancelled before publication')
    expect(await readFile(report)).toEqual(previous)
    await writeFile(join(f.root, 'coverage/unrelated.txt'), 'preserve me')
    await expect(
      publishStandardCoverage({ projectDir: f.root, ...f, status: 'passed' })
    ).rejects.toThrow('unrelated file')
    expect(await readFile(report)).toEqual(previous)
    expect(await readFile(join(f.root, 'coverage/unrelated.txt'), 'utf8')).toBe(
      'preserve me'
    )
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it('gates failed-test standard publication on reportOnFailure', async () => {
  const { publishStandardCoverage } = await import(
    'next/dist/experimental/testing/coverage/report-standard'
  )
  const f = await standardReportFixture()
  try {
    expect(
      await publishStandardCoverage({
        projectDir: f.root,
        ...f,
        status: 'failed',
      })
    ).toEqual({ published: false, thresholdErrors: [] })
    await expect(
      readFile(join(f.root, 'coverage/coverage-final.json'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    const result = await publishStandardCoverage({
      projectDir: f.root,
      ...f,
      config: { ...f.config, reportOnFailure: true },
      status: 'failed',
    })
    expect(result.published).toBe(true)
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it('validates the entire capture before excluding standard coverage sources', async () => {
  const { remapStandardCoverage } = await import(
    'next/dist/experimental/testing/coverage/istanbul'
  )
  const f = await fixture()
  try {
    expect(
      (await remapStandardCoverage(f.artifact, f.capture, () => false)).files
    ).toEqual([])
    const hash = structuredClone(f.capture)
    hash.scripts[0].sha256 = '0'.repeat(64)
    await expect(
      remapStandardCoverage(f.artifact, hash, () => false)
    ).rejects.toThrow('Missing, duplicate or unmapped')
    const range = structuredClone(f.capture)
    range.scripts[0].functions[0].ranges[0].endOffset++
    await expect(
      remapStandardCoverage(f.artifact, range, () => false)
    ).rejects.toThrow('Invalid V8')
    const metadata = structuredClone(f.artifact)
    metadata.coverage!.sources = {}
    await expect(
      remapStandardCoverage(metadata, f.capture, () => false)
    ).rejects.toThrow('Unknown coverage source')
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it('rejects duplicate standard sources within an entry while retaining legitimate cross-entry aggregation', async () => {
  const { assertStandardCoverageFacts } = await import(
    'next/dist/experimental/testing/coverage/report-standard'
  )
  const f = await standardReportFixture()
  try {
    const duplicate = structuredClone(f.facts)
    duplicate[0].files.push(structuredClone(duplicate[0].files[0]))
    await expect(
      assertStandardCoverageFacts(duplicate, f.root, f.expected)
    ).rejects.toThrow('Duplicate standard coverage source within an entry')
    await assertStandardCoverageFacts(
      [f.facts[0], { ...structuredClone(f.facts[0]), entryId: 'two' }],
      f.root,
      new Set(['one', 'two'])
    )
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it.each(['fnMap', 'branchMap'] as const)(
  'bounds standard %s line metadata to its original source',
  async (field) => {
    const { assertStandardCoverageFacts } = await import(
      'next/dist/experimental/testing/coverage/report-standard'
    )
    const f = await standardReportFixture()
    try {
      for (const line of [0, f.source.split('\n').length + 1]) {
        const invalid = structuredClone(f.facts)
        invalid[0].files[0].data[field]['0'].line = line
        await expect(
          assertStandardCoverageFacts(invalid, f.root, f.expected)
        ).rejects.toThrow(
          field === 'fnMap'
            ? 'Invalid standard function'
            : 'Invalid standard branch'
        )
      }
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  }
)

describe('real custom coverage provider ownership', () => {
  const config = {
    enabled: true as const,
    provider: 'custom' as const,
    customProviderModule: './provider.mjs',
    clean: true,
    reportsDirectory: './coverage',
    reportOnFailure: false,
  }
  async function customFixture(mode = 'normal', providerExtra = '') {
    const root = await realpath(
      await mkdtemp(join(tmpdir(), 'next-custom-coverage-'))
    )
    const fs = await import('node:fs/promises')
    const original = join(
      process.cwd(),
      'test/unit/app-dir/next-testing-stable-release-gaps/fixtures/custom-coverage-provider'
    )
    await fs.copyFile(
      join(original, 'contract.case.mjs'),
      join(root, 'contract.case.mjs')
    )
    await fs.copyFile(
      join(original, 'coverage-provider.mjs'),
      join(root, 'provider.mjs')
    )
    if (providerExtra)
      await fs.appendFile(join(root, 'provider.mjs'), providerExtra)
    await fs.copyFile(
      join(__dirname, 'custom-entry.cjs'),
      join(root, 'entry.cjs')
    )
    await writeFile(
      join(root, 'runtime-paths.json'),
      JSON.stringify({
        runner: require.resolve('next/dist/experimental/testing/runner'),
        project: root,
        mode,
      })
    )
    const entry = {
      id: 'custom:one',
      file: join(root, 'contract.case.mjs'),
      profile,
    }
    const artifact: CompiledTestArtifact = {
      version: 2,
      kind: 'node',
      profile,
      entryId: entry.id,
      revision: 'custom-r1',
      rootDir: root,
      entryPath: 'entry.cjs',
      files: ['entry.cjs', 'runtime-paths.json'],
      diagnostics: [],
      sourceHash: coverageHash(await readFile(entry.file, 'utf8')),
    }
    return { root, entry, artifact }
  }
  const openSession = async (
    root: string,
    signal = new AbortController().signal,
    overrides = {}
  ) => {
    const { openCustomCoverageSession } = await import(
      'next/dist/experimental/testing/coverage/custom-session'
    )
    return openCustomCoverageSession({
      projectDir: root,
      config: { ...config, ...overrides },
      signal,
    })
  }
  async function runFile(
    f: Awaited<ReturnType<typeof customFixture>>,
    session: Awaited<ReturnType<typeof openSession>>,
    signal = new AbortController().signal
  ) {
    const { execute } = await import(
      'next/dist/experimental/testing/execution/execute'
    )
    const facts: import('next/dist/experimental/testing/coverage/custom-types').CustomCoverageFact[] =
      []
    const result = await execute(f.artifact, {
      runId: 'custom-run',
      projectDir: f.root,
      entry: f.entry,
      setupFiles: [],
      signal,
      testTimeout: 2000,
      hookTimeout: 1000,
      fileTimeout: 5000,
      snapshotUpdateMode: 'none',
      customCoverage: session.request,
      onEvent() {},
      async onCustomCoverage(completion) {
        const pid = JSON.parse(
          await readFile(join(f.root, 'body-pid.json'), 'utf8')
        )
        expect(() => process.kill(pid, 0)).toThrow()
        facts.push({
          completion,
          testFiles: ['contract.case.mjs'],
          environment: 'ssr',
        })
      },
    })
    return { result, facts }
  }
  it.each(['normal', 'body-failure'])(
    'retains the original provider payload after real worker closure for %s',
    async (mode) => {
      const f = await customFixture(mode)
      let session: Awaited<ReturnType<typeof openSession>> | undefined
      try {
        session = await openSession(f.root, undefined, {
          reportOnFailure: true,
        })
        const { result, facts } = await runFile(f, session)
        expect(result.status).toBe(mode === 'normal' ? 'passed' : 'failed')
        expect(facts).toEqual([
          expect.objectContaining({
            completion: expect.objectContaining({
              complete: true,
              payload: { releasePayload: 42 },
            }),
          }),
        ])
        await expect(
          readFile(join(f.root, 'custom-coverage.json'))
        ).rejects.toMatchObject({ code: 'ENOENT' })
        await session.finish(facts, result.status as 'passed' | 'failed', true)
        await session.dispose()
        session = undefined
        expect(
          JSON.parse(
            await readFile(join(f.root, 'custom-coverage.json'), 'utf8')
          )
        ).toEqual({ payloads: [{ releasePayload: 42 }] })
        const trace = (
          await readFile(join(f.root, 'provider-trace.jsonl'), 'utf8')
        )
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
        for (const hook of [
          'get-provider',
          'initialize',
          'resolve',
          'clean',
          'run-start',
          'start',
          'take',
          'stop',
          'suite',
          'generate',
          'report',
        ])
          expect(trace.some((event) => event.name === hook)).toBe(true)
      } finally {
        await session?.dispose()
        await rm(f.root, { recursive: true, force: true })
      }
    }
  )
  it.each([
    'cleanup-failure',
    'source-mutation',
    'source-retarget',
    'output-mutation',
    'provider-mutation',
  ])('vetoes opaque publication after %s', async (mode) => {
    const f = await customFixture(mode)
    let session: Awaited<ReturnType<typeof openSession>> | undefined
    try {
      session = await openSession(f.root)
      const { result, facts } = await runFile(f, session)
      expect(result.status).toBe('failed')
      expect(facts).toEqual([])
      await expect(
        readFile(join(f.root, 'custom-coverage.json'))
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await session?.dispose().catch(() => {})
      await rm(f.root, { recursive: true, force: true })
    }
  })
  it('cancels the actual file worker and retains no payload/report', async () => {
    const f = await customFixture('cancel')
    let session: Awaited<ReturnType<typeof openSession>> | undefined
    const controller = new AbortController()
    try {
      session = await openSession(f.root)
      const run = runFile(f, session, controller.signal)
      const { retry } = await import('next-test-utils')
      await retry(async () =>
        expect(await readFile(join(f.root, 'body-pid.json'), 'utf8')).toMatch(
          /^\d+$/
        )
      )
      controller.abort(new Error('custom cancellation sentinel'))
      const { result, facts } = await run
      expect(result.status).toBe('cancelled')
      expect(facts).toEqual([])
      await expect(
        readFile(join(f.root, 'custom-coverage.json'))
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await session?.dispose()
      await rm(f.root, { recursive: true, force: true })
    }
  })
  it('closes a provider and file worker sharing the same parent cancellation without a cleanup error', async () => {
    const f = await customFixture(
      'cancel',
      `\nconst initial=ReleaseProvider.prototype.initialize;ReleaseProvider.prototype.initialize=function(ctx){writeFileSync('provider-pid.json',String(process.pid));return initial.call(this,ctx)}`
    )
    const controller = new AbortController()
    let session: Awaited<ReturnType<typeof openSession>> | undefined
    try {
      session = await openSession(f.root, controller.signal)
      const directory = session.request.coverageFilesDirectory
      const run = runFile(f, session, controller.signal)
      const { retry } = await import('next-test-utils')
      await retry(async () =>
        expect(await readFile(join(f.root, 'body-pid.json'), 'utf8')).toMatch(
          /^\d+$/
        )
      )
      controller.abort(new Error('shared custom parent cancellation'))
      const { result, facts } = await run
      expect(result.status).toBe('cancelled')
      expect(facts).toEqual([])
      await expect(session.dispose()).resolves.toBeUndefined()
      session = undefined
      for (const file of ['provider-pid.json', 'body-pid.json']) {
        const pid = Number(await readFile(join(f.root, file), 'utf8'))
        expect(() => process.kill(pid, 0)).toThrow()
      }
      await expect(
        readFile(join(f.root, 'custom-coverage.json'))
      ).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(customFileSystem.stat(directory)).rejects.toMatchObject({
        code: 'ENOENT',
      })
    } finally {
      await session?.dispose({ retainPayloads: true })
      await rm(f.root, { recursive: true, force: true })
    }
  })
  it('does not report failed bodies by default', async () => {
    const f = await customFixture('body-failure')
    let session: Awaited<ReturnType<typeof openSession>> | undefined
    try {
      session = await openSession(f.root)
      const { facts } = await runFile(f, session)
      await session.finish(facts, 'failed', true)
      await session.dispose()
      session = undefined
      await expect(
        readFile(join(f.root, 'custom-coverage.json'))
      ).rejects.toMatchObject({ code: 'ENOENT' })
      expect(
        await readFile(join(f.root, 'provider-trace.jsonl'), 'utf8')
      ).toContain('generate')
    } finally {
      await session?.dispose()
      await rm(f.root, { recursive: true, force: true })
    }
  })
  it.each([
    '\nReleaseProvider.prototype.onFileTransform = () => {};',
    '\nReleaseProvider.prototype.initialize = function(ctx) {ctx.vite.moduleGraph};',
    "\nReleaseProvider.prototype.generateCoverage = function() {throw new Error('custom generate sentinel')};",
    "\nReleaseProvider.prototype.reportCoverage = function() {throw new Error('custom report sentinel')};",
  ])(
    'fails closed on unsupported service or failing real hook %s',
    async (extra) => {
      const f = await customFixture('normal', extra)
      let session: Awaited<ReturnType<typeof openSession>> | undefined
      try {
        if (extra.includes('onFileTransform') || extra.includes('ctx.vite'))
          await expect(openSession(f.root)).rejects.toThrow(
            /unqualified|unavailable/
          )
        else {
          session = await openSession(f.root)
          const { facts } = await runFile(f, session)
          await expect(session.finish(facts, 'passed', true)).rejects.toThrow(
            /custom (generate|report) sentinel/
          )
        }
        await expect(
          readFile(join(f.root, 'custom-coverage.json'))
        ).rejects.toMatchObject({ code: 'ENOENT' })
      } finally {
        await session?.dispose().catch(() => {})
        await rm(f.root, { recursive: true, force: true })
      }
    }
  )
  it.each(['startCoverage', 'takeCoverage', 'stopCoverage'])(
    'runs real %s failure cleanup and vetoes its payload',
    async (hook) => {
      const f = await customFixture(
        'normal',
        `\nimport self from './provider.mjs'; self.${hook}=()=>{throw new Error('custom runtime hook sentinel')}`
      )
      let session: Awaited<ReturnType<typeof openSession>> | undefined
      try {
        session = await openSession(f.root)
        const { result, facts } = await runFile(f, session)
        expect(result.status).toBe('failed')
        expect(facts).toEqual([])
        if (hook === 'startCoverage')
          await expect(
            readFile(join(f.root, 'body-pid.json'))
          ).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(
          readFile(join(f.root, 'custom-coverage.json'))
        ).rejects.toMatchObject({ code: 'ENOENT' })
      } finally {
        await session?.dispose()
        await rm(f.root, { recursive: true, force: true })
      }
    }
  )
  it('closes the real provider host before rejecting initialization cancellation', async () => {
    const f = await customFixture(
      'normal',
      `\nReleaseProvider.prototype.initialize=async function(){writeFileSync('provider-pid.json',String(process.pid));await new Promise(()=>{})}`
    )
    const controller = new AbortController()
    try {
      const opened = openSession(f.root, controller.signal).then(
        (value) => ({ value }),
        (error) => ({ error })
      )
      const { retry } = await import('next-test-utils')
      await retry(async () =>
        expect(
          await readFile(join(f.root, 'provider-pid.json'), 'utf8')
        ).toMatch(/^\d+$/)
      )
      controller.abort(new Error('provider initialization cancellation'))
      expect(await opened).toHaveProperty('error')
      const pid = Number(
        await readFile(join(f.root, 'provider-pid.json'), 'utf8')
      )
      expect(() => process.kill(pid, 0)).toThrow()
      await expect(
        readFile(join(f.root, 'custom-coverage.json'))
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })
  it('retains payload storage after an uncertain file lease even when the provider host closes', async () => {
    const f = await customFixture()
    let session: Awaited<ReturnType<typeof openSession>> | undefined
    const fs = customFileSystem,
      originalRemove = fs.rm
    let retainedCache: string | undefined
    try {
      session = await openSession(f.root)
      fs.rm = (async (file, options) => {
        if (
          typeof file === 'string' &&
          file.includes('next-test-cache-') &&
          !retainedCache
        ) {
          retainedCache = file
          throw new Error('uncertain custom file-cache lease')
        }
        return originalRemove(file, options)
      }) as typeof fs.rm
      await expect(runFile(f, session)).rejects.toThrow(
        'uncertain custom file-cache lease'
      )
      fs.rm = originalRemove
      const directory = session.request.coverageFilesDirectory
      await writeFile(join(directory, 'provider-owned-payload.json'), '42')
      await session.dispose({ retainPayloads: true })
      session = undefined
      expect(
        await readFile(join(directory, 'provider-owned-payload.json'), 'utf8')
      ).toBe('42')
      await expect(
        readFile(join(f.root, 'custom-coverage.json'))
      ).rejects.toMatchObject({ code: 'ENOENT' })
      const workerPid = Number(
        await readFile(join(f.root, 'body-pid.json'), 'utf8')
      )
      expect(() => process.kill(workerPid, 0)).toThrow()
      await originalRemove(directory, { recursive: true, force: true })
    } finally {
      fs.rm = originalRemove
      await session?.dispose({ retainPayloads: true })
      if (retainedCache)
        await originalRemove(retainedCache, { recursive: true, force: true })
      await rm(f.root, { recursive: true, force: true })
    }
  })
  it('fails closed before provider evaluation when native loader hooks are absent', async () => {
    const f = await customFixture(
      'normal',
      `\nwriteFileSync('provider-evaluated','bad')`
    )
    const module = require('node:module') as { registerHooks?: unknown }
    const original = module.registerHooks
    try {
      module.registerHooks = undefined
      const { resolveCustomCoverageProvider, loadCustomCoverageModule } =
        await import('next/dist/experimental/testing/coverage/custom-runtime')
      const identity = await resolveCustomCoverageProvider(
        f.root,
        './provider.mjs'
      )
      await expect(loadCustomCoverageModule(identity)).rejects.toThrow(
        /runtime cannot certify provider imports/
      )
      await expect(
        readFile(join(f.root, 'provider-evaluated'))
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      module.registerHooks = original
      await rm(f.root, { recursive: true, force: true })
    }
  })
  it.each(['static-esm', 'dynamic-esm', 'commonjs'])(
    'rejects uncertified provider helpers through the real loader for %s',
    async (mode) => {
      const f = await customFixture()
      try {
        await writeFile(
          join(f.root, 'helper.mjs'),
          `import {writeFileSync} from 'node:fs';writeFileSync('helper-evaluated','bad');export default 42`
        )
        if (mode === 'static-esm')
          await writeFile(
            join(f.root, 'provider.mjs'),
            `import './helper.mjs';export default {getProvider(){},startCoverage(){},takeCoverage(){},stopCoverage(){}}`
          )
        if (mode === 'dynamic-esm')
          await writeFile(
            join(f.root, 'provider.mjs'),
            `export default {async getProvider(){await import('./helper.mjs')},startCoverage(){},takeCoverage(){},stopCoverage(){}}`
          )
        if (mode === 'commonjs') {
          await writeFile(
            join(f.root, 'helper.cjs'),
            `require('node:fs').writeFileSync('helper-evaluated','bad')`
          )
          await writeFile(
            join(f.root, 'provider.cjs'),
            `require('./helper.cjs');module.exports={getProvider(){},startCoverage(){},takeCoverage(){},stopCoverage(){}}`
          )
        }
        await expect(
          openSession(
            f.root,
            undefined,
            mode === 'commonjs'
              ? { customProviderModule: './provider.cjs' }
              : {}
          )
        ).rejects.toThrow(/helper imports are unqualified/)
        await expect(
          readFile(join(f.root, 'helper-evaluated'))
        ).rejects.toMatchObject({ code: 'ENOENT' })
      } finally {
        await rm(f.root, { recursive: true, force: true })
      }
    }
  )
  it.each([
    'normal',
    'snapshot-new',
    'snapshot-all',
    'snapshot-legacy',
    'snapshot-cancel',
    'snapshot-cancel-uncertain',
    'missing-facts',
    'mismatched-facts',
    'unsafe-cleanup',
  ])(
    'supervises actual custom payload IPC and rejects %s ownership failures',
    async (mode) => {
      const cancelling = mode.startsWith('snapshot-cancel')
      const controller = new AbortController()
      const f = await customFixture(cancelling ? 'cancel' : 'normal')
      let session: Awaited<ReturnType<typeof openSession>> | undefined
      let retainedCache: string | undefined
      try {
        session = await openSession(f.root, controller.signal)
        const runtime = join(
          require.resolve('next/dist/experimental/testing/runner'),
          '../..'
        )
        await writeFile(
          join(f.root, 'producer-input.json'),
          JSON.stringify({ ...f, runtime, mode })
        )
        const request = {
          operation: 'run',
          projectDir: f.root,
          isolatedProfile: true,
          customCoverageRequests: { [profile.id]: session.request },
          ...(mode === 'snapshot-new' || cancelling
            ? { snapshotUpdateMode: 'new' }
            : mode === 'snapshot-all'
              ? { snapshotUpdateMode: 'all' }
              : mode === 'snapshot-legacy'
                ? { updateSnapshots: true }
                : { snapshotUpdateMode: 'none' }),
          projects: [
            {
              profile,
              customCoverage: config,
              entries: [f.entry],
              setupFiles: [],
              include: [],
              exclude: [],
              testTimeout: 2000,
              hookTimeout: 1000,
              fileTimeout: 5000,
            },
          ],
        }
        const { runTestProcess } = await import(
          'next/dist/experimental/testing/execution/process'
        )
        let outcome: any
        const pending = runTestProcess(
          join(__dirname, 'custom-supervisor.cjs'),
          {
            cwd: f.root,
            env: process.env,
            input: {
              request,
              runtime,
              producer: join(__dirname, 'custom-producer.cjs'),
              uncertainCancellation: mode === 'snapshot-cancel-uncertain',
            },
            signal: controller.signal,
            timeoutMs: 15000,
            shutdownGraceMs: 5000,
            onMessage(message) {
              outcome = message
            },
          }
        )
        if (cancelling) {
          const { retry } = await import('next-test-utils')
          await retry(async () =>
            expect(
              await readFile(join(f.root, 'body-pid.json'), 'utf8')
            ).toMatch(/^\d+$/)
          )
          controller.abort(new Error('custom shared parent cancellation'))
        }
        const exit = await pending
        expect(exit).toMatchObject({
          reason: cancelling ? 'cancelled' : 'exit',
          code: 0,
        })
        if (mode === 'normal' || mode === 'snapshot-new')
          expect(outcome.value.result.customCoverage).toEqual([
            expect.objectContaining({
              completion: expect.objectContaining({
                payload: { releasePayload: 42 },
                complete: true,
              }),
            }),
          ])
        else if (cancelling) {
          expect(outcome).not.toHaveProperty('value')
          if (mode === 'snapshot-cancel') {
            expect(outcome).toMatchObject({ cancelled: true, uncertain: false })
            expect(outcome.error).not.toMatch(
              /missing selected files|cleanup failed/
            )
          } else {
            expect(outcome).toMatchObject({ cancelled: false, uncertain: true })
            retainedCache = outcome.retainedCache
            expect(retainedCache).toContain('next-test-cache-')
          }
        } else expect(outcome.error).toMatch(/custom coverage|Custom coverage/)
        const producerPid = JSON.parse(
          await readFile(join(f.root, 'producer-pid.json'), 'utf8')
        )
        expect(() => process.kill(producerPid, 0)).toThrow()
        if (mode === 'snapshot-all' || mode === 'snapshot-legacy') {
          expect(outcome.error).toContain('snapshot updates')
          await expect(
            readFile(join(f.root, 'body-pid.json'))
          ).rejects.toMatchObject({ code: 'ENOENT' })
        } else {
          const workerPid = JSON.parse(
            await readFile(join(f.root, 'body-pid.json'), 'utf8')
          )
          expect(() => process.kill(workerPid, 0)).toThrow()
        }
        await expect(
          readFile(join(f.root, 'custom-coverage.json'))
        ).rejects.toMatchObject({ code: 'ENOENT' })
        if (cancelling) {
          const directory = session.request.coverageFilesDirectory
          await session.dispose({
            retainPayloads: mode === 'snapshot-cancel-uncertain',
          })
          session = undefined
          if (mode === 'snapshot-cancel-uncertain') {
            await writeFile(join(directory, 'retained-payload'), '42')
            expect(
              await readFile(join(directory, 'retained-payload'), 'utf8')
            ).toBe('42')
            await rm(directory, { recursive: true, force: true })
          } else
            await expect(readFile(directory)).rejects.toMatchObject({
              code: 'ENOENT',
            })
        }
      } finally {
        await session?.dispose({
          retainPayloads: mode === 'snapshot-cancel-uncertain',
        })
        if (retainedCache)
          await rm(retainedCache, { recursive: true, force: true })
        await rm(f.root, { recursive: true, force: true })
      }
    }
  )
  it('validates the complete identity set before forwarding provider-owned payloads', async () => {
    const f = await customFixture()
    let session: Awaited<ReturnType<typeof openSession>> | undefined
    try {
      session = await openSession(f.root)
      const { facts } = await runFile(f, session)
      const { assertCustomCoverageFacts } = await import(
        'next/dist/experimental/testing/coverage/custom-facts'
      )
      const projects = [
        { profile, customCoverage: config, entries: [f.entry] },
      ] as import('next/dist/experimental/testing/discovery').DiscoveredTestProject[]
      const requests = { [profile.id]: session.request },
        revisions = new Map([[f.entry.id, f.artifact.revision]])
      expect(
        assertCustomCoverageFacts(
          facts,
          f.root,
          projects,
          requests,
          revisions,
          'custom-run'
        )
      ).toBe(facts)
      for (const bad of [
        [],
        [...facts, ...facts],
        [{ ...facts[0], testFiles: ['wrong'] }],
        [
          {
            ...facts[0],
            completion: { ...facts[0].completion, revision: 'wrong' },
          },
        ],
      ])
        expect(() =>
          assertCustomCoverageFacts(
            bad,
            f.root,
            projects,
            requests,
            revisions,
            'custom-run'
          )
        ).toThrow(/missing|Invalid/)
    } finally {
      await session?.dispose()
      await rm(f.root, { recursive: true, force: true })
    }
  })
})

it.each([
  undefined,
  { enabled: false, provider: 'custom' },
  { enabled: true, provider: 'custom', customProviderModule: './provider.mjs' },
  {
    enabled: true,
    provider: 'custom',
    customProviderModule: './provider.mjs',
    clean: false,
    reportOnFailure: true,
    reportsDirectory: './actual',
  },
])(
  'parses bounded custom coverage config %j without evaluating its module',
  async (value) => {
    const { parseCustomCoverageConfig } = await import(
      'next/dist/experimental/testing/coverage/custom-options'
    )
    const result = parseCustomCoverageConfig(value)
    if (!value || value.enabled === false) expect(result).toBeUndefined()
    else expect(result).toMatchObject(value)
  }
)
it.each([
  true,
  { provider: 'v8' },
  { provider: 'custom' },
  { provider: 'custom', customProviderModule: '' },
  {
    provider: 'custom',
    customProviderModule: './provider',
    reporter: ['json'],
  },
  {
    provider: 'custom',
    customProviderModule: './provider',
    reportOnFailure: 'true',
  },
])('rejects unsupported custom coverage config %j', async (value) => {
  const { parseCustomCoverageConfig } = await import(
    'next/dist/experimental/testing/coverage/custom-options'
  )
  expect(() => parseCustomCoverageConfig(value)).toThrow(
    /custom coverage|Custom coverage|Project coverage|Unsupported custom/
  )
})

it.each([
  ['fully-mocked', 'turbopack'],
  ['loaded-original', 'turbopack'],
  ['actual-original', 'turbopack'],
  ['fully-mocked', 'native-file'],
  ['loaded-original', 'native-file'],
  ['actual-original', 'native-file'],
])(
  'keeps original V8 counts separate from certified generated proxies for %s with %s identities',
  async (mode, identity) => {
    const { promisify } = await import('node:util')
    const { execFile } = await import('node:child_process')
    const { SourceMapGenerator } = require('next/dist/compiled/source-map')
    const { remapStandardCoverage, createUncoveredJavaScript } = await import(
      'next/dist/experimental/testing/coverage/istanbul'
    )
    const { readNativeMockCoverageSources } = await import(
      'next/dist/experimental/testing/coverage/mock-sources'
    )
    const root = await realpath(
      await mkdtemp(join(tmpdir(), 'next-mock-coverage-'))
    )
    const subject = join(root, 'subject.mjs')
    const entry = join(root, 'contract.case.mjs')
    const originalDirectory = join(
      process.cwd(),
      'test/unit/app-dir/next-testing-stable-release-gaps/fixtures/coverage-module-mock'
    )
    const original = await readFile(
      join(originalDirectory, 'subject.mjs'),
      'utf8'
    )
    const proxy = `exports.choose = () => 'mocked';\n`
    const synthetic =
      identity === 'native-file'
        ? pathToFileURL(join(root, 'subject.mjs.next-test-mock.js')).href
        : `turbopack:///[project]/subject.mjs.next-test-mock.js`
    const provenance = readNativeMockCoverageSources({
      version: 1,
      sources: [{ source: synthetic, code: proxy }],
    })
    try {
      await writeFile(subject, original)
      await writeFile(
        entry,
        await readFile(join(originalDirectory, 'contract.case.mjs'))
      )
      const transformed =
        original.replace(/^export /gm, '       ') +
        '\nexports.choose=choose;exports.unused=unused;\n'
      const code = `${mode === 'fully-mocked' ? '' : "const original = require('./original.js');\n"}${mode === 'actual-original' ? "if(original.choose(true)!=='yes')throw Error('actual branch');\n" : ''}const mocked = require('./proxy.js');if(mocked.choose(true)!=='mocked')throw Error('mocked branch');\n`
      const files: string[] = []
      for (const [name, generatedCode, identity, content] of [
        [
          'entry.js',
          code,
          pathToFileURL(entry).href,
          await readFile(entry, 'utf8'),
        ],
        ['proxy.js', proxy, synthetic, proxy],
        ['original.js', transformed, pathToFileURL(subject).href, original],
      ]) {
        const map = new SourceMapGenerator()
        if (name !== 'entry.js') {
          for (const [index, line] of content.split('\n').entries()) {
            let column = 0
            for (const token of line.matchAll(/\w+|\s|[^\w\s]/g)) {
              const position = { line: index + 1, column }
              map.addMapping({
                generated: position,
                source: identity,
                original: position,
              })
              column += token[0].length
            }
          }
          map.addMapping({
            generated: { line: content.split('\n').length, column: 0 },
          })
          map.setSourceContent(identity, content)
        }
        await writeFile(join(root, name), generatedCode)
        await writeFile(join(root, name + '.map'), map.toString())
        files.push(name, name + '.map')
      }
      const coverage = await buildCoverageMetadata({
        rootDir: root,
        files,
        projectDir: root,
        sourceRootDir: root,
        entryFile: entry,
        setupFiles: [],
        syntheticSources: provenance,
      })
      expect(coverage.syntheticSources).toEqual({
        [synthetic]: { sha256: coverageHash(proxy) },
      })
      expect(coverage.sources[synthetic]).toBeNull()
      const nativeBytes = JSON.stringify({
        moduleMocking: {
          version: 1,
          coverage: {
            version: 1,
            sources: [{ source: synthetic, code: proxy }],
          },
        },
      })
      await writeFile(join(root, 'metadata.json'), nativeBytes)
      files.push('metadata.json')
      const artifact: CompiledTestArtifact = {
        version: 2,
        kind: 'node',
        profile,
        entryId: 'mock-coverage',
        revision: 'real-v8',
        rootDir: root,
        entryPath: 'entry.js',
        files,
        diagnostics: [],
        moduleMocking: {
          version: 1,
          coverage: {
            ...provenance,
            nativeMetadata: {
              path: 'metadata.json',
              sha256: coverageHash(nativeBytes),
            },
          },
        },
        coverage,
      }
      const artifactPath = join(root, 'artifact.json'),
        capturePath = join(root, 'capture.json')
      await writeFile(artifactPath, JSON.stringify(artifact))
      await promisify(execFile)(process.execPath, [
        join(__dirname, 'collector-worker.cjs'),
        artifactPath,
        capturePath,
      ])
      const capture = JSON.parse(await readFile(capturePath, 'utf8'))
      expect(capture.scripts.some((script) => script.path === 'proxy.js')).toBe(
        true
      )
      expect(
        capture.scripts.some((script) => script.path === 'original.js')
      ).toBe(mode !== 'fully-mocked')
      const mapped = await remapStandardCoverage(artifact, capture)
      expect(
        mapped.files.some((file) => file.file.endsWith('.next-test-mock.js'))
      ).toBe(false)
      const data =
        mapped.files.find((file) => file.file === subject)?.data ??
        (await createUncoveredJavaScript(subject, original))
      if (mode === 'actual-original') {
        expect(data.f).toEqual({ 0: 1, 1: 0 })
        expect(data.b).toEqual({ 0: [1, 0] })
      } else {
        expect(Object.values(data.f)).toEqual([0, 0])
        expect(Object.values(data.s).every((value) => value === 0)).toBe(true)
        expect(data.b).toEqual({ 0: [0, 0] })
      }
      expect(await readFile(subject, 'utf8')).toBe(original)
      // Matching the generated filename is insufficient to erase an unknown
      // project source, and an exact identity cannot hide changed code bytes.
      await expect(
        buildCoverageMetadata({
          rootDir: root,
          files,
          projectDir: root,
          sourceRootDir: root,
          entryFile: entry,
          setupFiles: [],
        })
      ).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(
        buildCoverageMetadata({
          rootDir: root,
          files,
          projectDir: root,
          sourceRootDir: root,
          entryFile: entry,
          setupFiles: [],
          syntheticSources: {
            version: 1,
            sources: [
              { source: synthetic, sha256: coverageHash(proxy + 'changed') },
            ],
          },
        })
      ).rejects.toThrow('Native generated coverage source mismatch')
      const { assertCoverageRequest } = await import(
        'next/dist/experimental/testing/execution/coverage'
      )
      expect(() =>
        assertCoverageRequest(
          { ...artifact, moduleMocking: { version: 1 } },
          {
            coverage: { version: 1, kind: 'node-line' },
            onCoverage: async () => {},
          }
        )
      ).toThrow('native generated-source provenance')
      const invalid = structuredClone(artifact)
      invalid.coverage!.syntheticSources![synthetic].sha256 =
        coverageHash('unbound')
      await expect(remapStandardCoverage(invalid, capture)).rejects.toThrow(
        'lost its native coverage provenance'
      )
      const erased = structuredClone(artifact)
      erased.moduleMocking!.coverage!.sources = []
      erased.coverage!.syntheticSources = {}
      await expect(remapStandardCoverage(erased, capture)).rejects.toThrow(
        'differ from the retained native inventory'
      )
      await writeFile(join(root, 'metadata.json'), nativeBytes + '\n')
      await expect(remapStandardCoverage(artifact, capture)).rejects.toThrow(
        'Native mock coverage inventory changed after compilation'
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
)

it.each([
  'https://example.com/proxy.js',
  'file://localhost/tmp/proxy.js',
  'file:///tmp/proxy.js?other',
  'file:///tmp/proxy.js#other',
  'file:///tmp/%00proxy.js',
  'file:///tmp/a%2Fb.js',
  'relative/proxy.js',
  'turbopack:///[unknown]/proxy.js',
])('rejects noncanonical native mock coverage source %s', async (source) => {
  const { readNativeMockCoverageSources } = await import(
    'next/dist/experimental/testing/coverage/mock-sources'
  )
  expect(() =>
    readNativeMockCoverageSources({
      version: 1,
      sources: [{ source, code: 'generated proxy' }],
    })
  ).toThrow('Invalid native generated mock source')
})

const {
  expandExpectedCoverageFixture,
  parseExpectedCoverageFixture,
} = require('./expected-coverage-fixtures.cjs')
import {
  runNodeHelper,
  runNodeHelperSync,
  withOutputDirectory,
} from '../../lib/next-testing-node-helpers'
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
import type { ResultEvent } from 'next/dist/experimental/testing/reporting/events'
import type {
  CoverageCapture,
  CoverageArtifactMetadata,
  StandardCoverageData,
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
  const f = await fixture()
  try {
    const artifactPath = join(f.root, 'artifact.json')
    const capturePath = join(f.root, 'capture.json')
    await writeFile(artifactPath, JSON.stringify(f.artifact))
    await runNodeHelper([
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
    await runNodeHelper([
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

it.each([false, true])(
  'restores authored statement spans from actual V8 ranges and rejects missing associations (generated semicolon: %s)',
  async (semicolon) => {
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
      await mkdtemp(join(tmpdir(), 'next-standard-span-'))
    )
    const subject = join(root, 'subject.mjs'),
      entry = join(root, 'entry.test.mjs')
    const original =
      'function called() { return "used" }\nfunction untouched() { return "unused" }\n'
    const generated =
      original
        .split('\n')
        .map((line) => (semicolon ? line.replace('" }', '"; }') : line))
        .join('\n') + 'called()\n'
    try {
      await writeFile(subject, original)
      await writeFile(entry, '')
      await writeFile(join(root, 'entry.js'), generated)
      async function artifactFor(
        shiftStatementStart = false
      ): Promise<CompiledTestArtifact> {
        const map = new SourceMapGenerator()
        for (const [index, line] of original.split('\n').entries()) {
          const insertion = line.lastIndexOf('"') + 1
          const generatedLine = semicolon ? line.replace('" }', '"; }') : line
          for (let column = 0; column < generatedLine.length; column++) {
            let authored = semicolon && column > insertion ? column - 1 : column
            // A compiler-added semicolon's end can carry the enclosing brace span.
            if (semicolon && column === insertion + 1)
              authored = line.indexOf('}')
            if (
              shiftStatementStart &&
              index === 0 &&
              authored === line.indexOf('return')
            )
              authored++
            map.addMapping({
              generated: { line: index + 1, column },
              source: pathToFileURL(subject).href,
              original: { line: index + 1, column: authored },
            })
          }
        }
        map.addMapping({ generated: { line: 3, column: 0 } })
        map.setSourceContent(pathToFileURL(subject).href, original)
        await writeFile(join(root, 'entry.js.map'), map.toString())
        const files = ['entry.js', 'entry.js.map']
        return {
          version: 2,
          kind: 'node',
          profile,
          entryId: 'standard-span',
          revision: 'r1',
          rootDir: root,
          entryPath: 'entry.js',
          files,
          diagnostics: [],
          coverage: await buildCoverageMetadata({
            rootDir: root,
            files,
            projectDir: root,
            sourceRootDir: root,
            entryFile: entry,
            setupFiles: [],
          }),
        }
      }
      const artifact = await artifactFor()
      const artifactPath = join(root, 'artifact.json'),
        capturePath = join(root, 'capture.json')
      await writeFile(artifactPath, JSON.stringify(artifact))
      await runNodeHelper([
        join(__dirname, 'collector-worker.cjs'),
        artifactPath,
        capturePath,
      ])
      const capture = JSON.parse(await readFile(capturePath, 'utf8'))
      const result = await remapStandardCoverage(artifact, capture)
      expect(result.files).toHaveLength(1)
      const expected = await createUncoveredJavaScript(subject, original)
      expect(result.files[0].data.statementMap).toEqual(expected.statementMap)
      expect(result.files[0].data.fnMap).toEqual(expected.fnMap)
      expect(result.files[0].data.s).toEqual({ 0: 1, 1: 0 })
      expect(result.files[0].data.f).toEqual({ 0: 1, 1: 0 })
      expect(
        Object.fromEntries(
          Object.entries(result.files[0].data.meta!.seen).filter(([key]) =>
            key.startsWith('s:')
          )
        )
      ).toEqual(
        Object.fromEntries(
          Object.entries(expected.meta!.seen).filter(([key]) =>
            key.startsWith('s:')
          )
        )
      )
      const shifted = await artifactFor(true)
      await expect(remapStandardCoverage(shifted, capture)).rejects.toThrow(
        'statement association is ambiguous or absent'
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
)

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

async function actualTypeScriptCapture(
  original: string,
  detailed = false,
  shiftedStart = false
) {
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
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'next-typed-capture-'))
  )
  const subject = join(root, 'subject.ts'),
    entry = join(root, 'entry.test.mjs')
  const code = 'function typed(value) {\n  return value;\n}\ntyped(1)\n'
  await writeFile(subject, original)
  await writeFile(entry, '')
  await writeFile(join(root, 'entry.js'), code)
  const map = new SourceMapGenerator()
  if (detailed) {
    const signature = original.split('\n')[1]
    for (const [generated, authored] of [
      [0, 0],
      [9, signature.indexOf('typed')],
      [14, signature.indexOf('value')],
      [21, signature.indexOf(': T {')],
    ])
      map.addMapping({
        generated: { line: 1, column: generated },
        source: pathToFileURL(subject).href,
        original: {
          line: 2,
          column: authored + (shiftedStart && generated === 9 ? 1 : 0),
        },
      })
    for (let column = 0; column < 14; column++)
      map.addMapping({
        generated: { line: 2, column },
        source: pathToFileURL(subject).href,
        original: { line: 3, column },
      })
    map.addMapping({
      generated: { line: 3, column: 0 },
      source: pathToFileURL(subject).href,
      original: { line: 4, column: 0 },
    })
  } else
    for (let line = 1; line <= 3; line++)
      map.addMapping({
        generated: { line, column: 0 },
        source: pathToFileURL(subject).href,
        original: { line: 1, column: 0 },
      })
  map.addMapping({ generated: { line: 4, column: 0 } })
  map.setSourceContent(pathToFileURL(subject).href, original)
  await writeFile(join(root, 'entry.js.map'), map.toString())
  const files = ['entry.js', 'entry.js.map']
  const artifact: CompiledTestArtifact = {
    version: 2,
    kind: 'node',
    profile,
    entryId: 'typed',
    revision: 'r1',
    rootDir: root,
    entryPath: 'entry.js',
    files,
    diagnostics: [],
    coverage: await buildCoverageMetadata({
      rootDir: root,
      files,
      projectDir: root,
      sourceRootDir: root,
      entryFile: entry,
      setupFiles: [],
    }),
  }
  const artifactPath = join(root, 'artifact.json'),
    capturePath = join(root, 'capture.json')
  await writeFile(artifactPath, JSON.stringify(artifact))
  await runNodeHelper([
    join(__dirname, 'collector-worker.cjs'),
    artifactPath,
    capturePath,
  ])
  return {
    root,
    subject,
    artifact,
    capture: JSON.parse(await readFile(capturePath, 'utf8')),
  }
}

it('retains V8 TypeScript declaration spans and hits while associating the authored function body', async () => {
  const { remapStandardCoverage } = await import(
    'next/dist/experimental/testing/coverage/istanbul'
  )
  const source =
    'type Identity<T> = T\nfunction typed<T>(value: T): T {\n  return value\n}\n'
  const owned = await actualTypeScriptCapture(source, true)
  try {
    const result = await remapStandardCoverage(owned.artifact, owned.capture)
    const data = result.files[0].data
    expect(data.f).toEqual({ 0: 1 })
    expect(data.s).toEqual({ 0: 1 })
    expect(data.fnMap[0].decl).toEqual({
      start: { line: 2, column: 9 },
      end: { line: 2, column: 18 },
    })
    expect(data.fnMap[0].loc.start).toEqual({ line: 2, column: 31 })
    const invalid = structuredClone(owned.capture)
    invalid.scripts[0].functions = []
    await expect(
      remapStandardCoverage(owned.artifact, invalid)
    ).rejects.toThrow()
  } finally {
    await rm(owned.root, { recursive: true, force: true })
  }
})

it('rejects a TypeScript function whose mapped declaration start does not identify the authored function', async () => {
  const { remapStandardCoverage } = await import(
    'next/dist/experimental/testing/coverage/istanbul'
  )
  const owned = await actualTypeScriptCapture(
    'type Identity<T> = T\nfunction typed<T>(value: T): T {\n  return value\n}\n',
    true,
    true
  )
  try {
    await expect(
      remapStandardCoverage(owned.artifact, owned.capture)
    ).rejects.toThrow(
      `Standard coverage function association is ambiguous or absent: ${owned.subject}:2:9`
    )
  } finally {
    await rm(owned.root, { recursive: true, force: true })
  }
})

it('rejects a typed source branch absent from the actual V8-derived map', async () => {
  const { remapStandardCoverage } = await import(
    'next/dist/experimental/testing/coverage/istanbul'
  )
  const owned = await actualTypeScriptCapture(
    'type Identity<T> = T\nfunction typed<T>(value: T): T {\n  return value ? 1 : 0\n}\n',
    true
  )
  try {
    await expect(
      remapStandardCoverage(owned.artifact, owned.capture)
    ).rejects.toThrow(
      `Standard coverage generated and original branch counts differ: ${owned.subject}`
    )
  } finally {
    await rm(owned.root, { recursive: true, force: true })
  }
})

it.each([
  ['enum Mode { Value }\n', 'TSEnumDeclaration', 0],
  ['namespace Box { export const value = 1 }\n', 'TSModuleDeclaration', 0],
  ['import value = require("package")\n', 'TSImportEqualsDeclaration', 0],
  ['export = value\n', 'TSExportAssignment', 0],
  [
    'class Box { constructor(public value: number) {} }\n',
    'TSParameterProperty',
    24,
  ],
  ['@decorate\nclass Box {}\n', 'Decorator', 0],
] as const)(
  'rejects unqualified generated TypeScript bodies: %s',
  async (source, type, column) => {
    const { remapStandardCoverage } = await import(
      'next/dist/experimental/testing/coverage/istanbul'
    )
    const owned = await actualTypeScriptCapture(source)
    try {
      await expect(
        remapStandardCoverage(owned.artifact, owned.capture)
      ).rejects.toThrow(
        `Standard coverage cannot associate generated ${type} bodies: ${owned.subject}:1:${column}`
      )
    } finally {
      await rm(owned.root, { recursive: true, force: true })
    }
  }
)

async function typedCompilerAnalysisFixture() {
  const { sourceAnalysisEntryId } = await import(
    'next/dist/experimental/testing/coverage/source-analysis'
  )
  const source =
    'type Identity<T> = T\nfunction typed<T>(value: T): T {\n  return value\n}\n'
  const owned = await actualTypeScriptCapture(source, true)
  const selected = { file: owned.subject, sha256: coverageHash(source) }
  const artifact = {
    ...owned.artifact,
    sourceHash: selected.sha256,
    entryId: sourceAnalysisEntryId(profile, selected.file),
    coverage: {
      ...owned.artifact.coverage!,
      sourceAnalysis: { version: 1 as const, ...selected },
    },
  }
  return {
    ...owned,
    compiled: {
      version: 1 as const,
      kind: 'next-compiler-source' as const,
      source: selected,
      artifact,
    },
    expected: {
      projectDir: owned.root,
      artifactRoot: owned.root,
      revision: artifact.revision,
      profile,
      source: selected,
    },
  }
}

it('derives separate compiler declaration metadata from emitted typed AST/maps without borrowing observed hits', async () => {
  const { analyzeCompiledCoverageSource } = await import(
    'next/dist/experimental/testing/coverage/source-analysis'
  )
  const { remapStandardCoverage } = await import(
    'next/dist/experimental/testing/coverage/istanbul'
  )
  const owned = await typedCompilerAnalysisFixture()
  try {
    const observed = await remapStandardCoverage(owned.artifact, owned.capture)
    expect(observed.files[0].data.f[0]).toBe(1)
    const result = await analyzeCompiledCoverageSource(
      owned.compiled,
      owned.expected,
      new AbortController().signal
    )
    expect(result.kind).toBe('next-compiler-declarations')
    expect(result.source).toEqual(owned.compiled.source)
    expect(result.data.f).toEqual({ 0: 0 })
    expect(result.data.s).toEqual({ 0: 0 })
    expect(result.data.fnMap[0].decl).toEqual(
      observed.files[0].data.fnMap[0].decl
    )
    expect(result.data.fnMap[0].loc).toEqual(
      observed.files[0].data.fnMap[0].loc
    )
    expect(result.data.fnMap[0].decl.end.column).toBe(18)
  } finally {
    await rm(owned.root, { recursive: true, force: true })
  }
})

it.each(['profile', 'source', 'root', 'revision', 'compiler-tag'] as const)(
  'rejects compiler declaration analysis without parent %s authorization',
  async (field) => {
    const { analyzeCompiledCoverageSource } = await import(
      'next/dist/experimental/testing/coverage/source-analysis'
    )
    const owned = await typedCompilerAnalysisFixture()
    try {
      const expected: import('next/dist/experimental/testing/coverage/source-analysis').CoverageSourceAuthorization =
          structuredClone(owned.expected),
        compiled = structuredClone(owned.compiled)
      if (field === 'profile') expected.profile.id = 'another-profile'
      else if (field === 'source') expected.source.sha256 = '0'.repeat(64)
      else if (field === 'root')
        expected.artifactRoot = join(owned.root, 'not-parent-owned')
      else if (field === 'revision') expected.revision = 'not-parent-issued'
      else delete compiled.artifact.coverage!.sourceAnalysis
      await expect(
        analyzeCompiledCoverageSource(
          compiled,
          expected,
          new AbortController().signal
        )
      ).rejects.toThrow(
        'Unrequested or incompatible compiler coverage source analysis'
      )
    } finally {
      await rm(owned.root, { recursive: true, force: true })
    }
  }
)

it('rejects cancellation and source mutation after actual compilation', async () => {
  const { analyzeCompiledCoverageSource } = await import(
    'next/dist/experimental/testing/coverage/source-analysis'
  )
  const owned = await typedCompilerAnalysisFixture()
  try {
    const controller = new AbortController()
    controller.abort(new Error('analysis cancelled'))
    await expect(
      analyzeCompiledCoverageSource(
        owned.compiled,
        owned.expected,
        controller.signal
      )
    ).rejects.toThrow('analysis cancelled')
    await writeFile(owned.subject, 'export const changed: number = 1')
    await expect(
      analyzeCompiledCoverageSource(
        owned.compiled,
        owned.expected,
        new AbortController().signal
      )
    ).rejects.toThrow('source changed after parent selection')
  } finally {
    await rm(owned.root, { recursive: true, force: true })
  }
})

it('rejects out-of-bounds compiler map coordinates even when declared hashes match', async () => {
  const { analyzeCompiledCoverageSource } = await import(
    'next/dist/experimental/testing/coverage/source-analysis'
  )
  const owned = await typedCompilerAnalysisFixture()
  try {
    const invalid = makeMap(
      owned.subject,
      await readFile(owned.subject, 'utf8')
    )
    // Valid VLQ decoding, but original line 999 is outside the retained source.
    invalid.mappings = 'AAw+BA'
    await writeFile(join(owned.root, 'entry.js.map'), JSON.stringify(invalid))
    const rebuilt = await buildCoverageMetadata({
      rootDir: owned.root,
      files: owned.compiled.artifact.files,
      projectDir: owned.root,
      sourceRootDir: owned.root,
      entryFile: owned.subject,
      setupFiles: [],
      includeEntrySource: true,
    })
    owned.compiled.artifact.coverage = {
      ...rebuilt,
      sourceAnalysis: { version: 1, ...owned.compiled.source },
    }
    await expect(
      analyzeCompiledCoverageSource(
        owned.compiled,
        owned.expected,
        new AbortController().signal
      )
    ).rejects.toThrow('coordinate exceeds retained content')
  } finally {
    await rm(owned.root, { recursive: true, force: true })
  }
})

it('accepts exact compiler analysis metadata after a serialized dictionary round trip', async () => {
  const { analyzeCompiledCoverageSource } = await import(
    'next/dist/experimental/testing/coverage/source-analysis'
  )
  const owned = await typedCompilerAnalysisFixture()
  try {
    // Node IPC serialization recreates null-prototype dictionary records as objects.
    const transported = JSON.parse(
      JSON.stringify(owned.compiled)
    ) as typeof owned.compiled
    const original = await analyzeCompiledCoverageSource(
      owned.compiled,
      owned.expected,
      new AbortController().signal
    )
    expect(
      await analyzeCompiledCoverageSource(
        transported,
        owned.expected,
        new AbortController().signal
      )
    ).toEqual(original)
    transported.artifact.coverage!.sources['borrowed-source'] = null
    await expect(
      analyzeCompiledCoverageSource(
        transported,
        owned.expected,
        new AbortController().signal
      )
    ).rejects.toThrow('metadata does not match its emitted closure')
  } finally {
    await rm(owned.root, { recursive: true, force: true })
  }
})

async function compilerSourcePlanFixture() {
  const { createCoverageSourcePlan } = await import(
    'next/dist/experimental/testing/coverage/source-analysis-plan'
  )
  const { analyzeCompiledCoverageSource, sourceAnalysisEntryId } = await import(
    'next/dist/experimental/testing/coverage/source-analysis'
  )
  const owned = await typedCompilerAnalysisFixture(),
    signal = new AbortController().signal
  const config = {
    reporter: ['json'] as ['json'],
    include: ['**/*.{ts,tsx,jsx}'],
    exclude: [],
    reportsDirectory: 'coverage',
    reportOnFailure: false,
    thresholds: {},
  }
  const projects = [
    profile,
    { ...profile, id: 'production', mode: 'production' as const },
  ].map((profile) => ({
    profile,
    include: ['**/*.case.ts'],
    exclude: [],
    setupFiles: [] as string[],
    snapshotSerializers: [] as string[],
    entries: [],
  }))
  await writeFile(join(owned.root, 'next.config.mjs'), 'export default {}')
  const plan = await createCoverageSourcePlan({
    projectDir: owned.root,
    projects,
    config,
    signal,
  })
  const analyzed = await analyzeCompiledCoverageSource(
    owned.compiled,
    owned.expected,
    signal
  )
  const facts = plan.requests.map((request) => ({
    ...structuredClone(analyzed),
    source: { ...request.source },
    profile: { ...request.profile },
    compiler: {
      entryId: sourceAnalysisEntryId(request.profile, request.source.file),
      revision: request.revision,
      configurationImports: {
        request: request.configurationImports!,
        graph: {
          version: 1 as const,
          configFile: join(owned.root, 'next.config.mjs'),
          inputs: [
            {
              file: join(owned.root, 'next.config.mjs'),
              sha256: coverageHash('export default {}'),
            },
          ],
          imports: [],
        },
      },
    },
  }))
  return { ...owned, config, projects, plan, facts, signal }
}

it('selects complete typed analysis from parent filesystem/configuration without consulting runtime hits', async () => {
  const { createCoverageSourcePlan, assertCompilerSourceCoverage } =
    await import('next/dist/experimental/testing/coverage/source-analysis-plan')
  const owned = await compilerSourcePlanFixture()
  try {
    await writeFile(
      join(owned.root, 'selected.case.ts'),
      'throw new Error("must not execute a test")'
    )
    await writeFile(
      join(owned.root, 'types.d.ts'),
      'export type Answer = number'
    )
    await writeFile(
      join(owned.root, 'setup.ts'),
      'throw new Error("must not execute setup")'
    )
    await writeFile(
      join(owned.root, 'marker.source.ts'),
      'if (import.meta.vitest) throw new Error("must not execute marker")'
    )
    const projects = owned.projects.map((project) => ({
      ...project,
      setupFiles: [join(owned.root, 'setup.ts')],
      includeSource: ['*.source.ts'],
    }))
    const plan = await createCoverageSourcePlan({
      projectDir: owned.root,
      projects,
      config: owned.config,
      signal: owned.signal,
    })
    expect(plan.requests.map((request) => request.source.file)).toEqual([
      owned.subject,
      owned.subject,
    ])
    expect(plan.requests.map((request) => request.profile.id)).toEqual([
      'node',
      'production',
    ])
    expect(new Set(plan.requests.map((request) => request.revision)).size).toBe(
      2
    )
    expect(plan.inputs.map((input) => input.file)).toEqual([
      join(owned.root, 'next.config.mjs'),
      join(owned.root, 'setup.ts'),
    ])
    expect(
      await assertCompilerSourceCoverage(owned.facts, owned.plan, owned.signal)
    ).toHaveLength(1)
    expect(
      await createCoverageSourcePlan({
        projectDir: owned.root,
        projects,
        config: owned.config,
        signal: owned.signal,
        includeUnimported: false,
      })
    ).toEqual({ version: 1, requests: [], inputs: [] })
  } finally {
    await rm(owned.root, { recursive: true, force: true })
  }
})

it.each([
  'missing-profile',
  'duplicate-profile',
  'source-hash',
  'revision',
  'entry-id',
  'nonzero-hits',
  'descriptor-map',
  'descriptor-meta',
  'descriptor-function-names',
] as const)(
  'rejects incomplete or borrowed compiler declaration provenance: %s',
  async (field) => {
    const { assertCompilerSourceCoverage } = await import(
      'next/dist/experimental/testing/coverage/source-analysis-plan'
    )
    const owned = await compilerSourcePlanFixture()
    try {
      const facts = owned.facts.map((fact) => ({
        ...structuredClone(fact),
        source: { ...fact.source },
        profile: { ...fact.profile },
        compiler: {
          ...fact.compiler,
          configurationImports: {
            ...fact.compiler.configurationImports,
            request: { ...fact.compiler.configurationImports.request },
          },
        },
      }))
      await expect(
        assertCompilerSourceCoverage(facts, owned.plan, owned.signal)
      ).resolves.toHaveLength(1)
      if (field === 'missing-profile') facts.pop()
      else if (field === 'duplicate-profile') facts[1] = facts[0]
      else if (field === 'source-hash') facts[1].source.sha256 = '0'.repeat(64)
      else if (field === 'revision') facts[1].compiler.revision = 'borrowed'
      else if (field === 'entry-id') facts[1].compiler.entryId = 'runtime-entry'
      else if (field === 'nonzero-hits') facts[1].data.f[0] = 1
      else if (field === 'descriptor-map')
        facts[1].data.fnMap[0].decl.end.column++
      else if (field === 'descriptor-meta')
        facts[1].data.meta!.seen['extra-id'] = 0
      else
        (facts[1].data.meta!.fnNames as unknown as Map<string, number>).set(
          'borrowed-name',
          1
        )
      await expect(
        assertCompilerSourceCoverage(facts, owned.plan, owned.signal)
      ).rejects.toThrow(
        field.startsWith('descriptor-')
          ? 'Selected compiler profiles disagree'
          : field === 'missing-profile'
            ? 'Incomplete compiler coverage source analysis'
            : 'Unrequested or incompatible compiler coverage declaration fact'
      )
    } finally {
      await rm(owned.root, { recursive: true, force: true })
    }
  }
)

it.each(['source', 'configuration', 'cancellation'] as const)(
  'vetoes parent declaration publication after late %s changes',
  async (field) => {
    const { assertCompilerSourceCoverage } = await import(
      'next/dist/experimental/testing/coverage/source-analysis-plan'
    )
    const owned = await compilerSourcePlanFixture()
    try {
      const controller = new AbortController()
      if (field === 'cancellation')
        controller.abort(new Error('parent analysis cancelled'))
      else
        await writeFile(
          field === 'source'
            ? owned.subject
            : join(owned.root, 'next.config.mjs'),
          'changed bytes'
        )
      await expect(
        assertCompilerSourceCoverage(owned.facts, owned.plan, controller.signal)
      ).rejects.toThrow(
        field === 'cancellation'
          ? 'parent analysis cancelled'
          : 'Compiler coverage analysis inputs changed after selection'
      )
    } finally {
      await rm(owned.root, { recursive: true, force: true })
    }
  }
)

it('requires effective compiler source analysis before uncovered TypeScript or JSX expansion', async () => {
  const { createUncoveredSource } = await import(
    'next/dist/experimental/testing/coverage/istanbul'
  )
  for (const extension of ['ts', 'tsx', 'jsx'])
    await expect(
      createUncoveredSource(
        join(tmpdir(), `unimported.${extension}`),
        'throw new Error("must not execute")'
      )
    ).rejects.toThrow(
      'Unimported TypeScript/JSX coverage requires profile-bound compiler source analysis'
    )
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
    cleanOnRerun: true,
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
  expect(
    parseStandardCoverageOptions({ 'coverage.reporter': ['html'] })
  ).toMatchObject({ formatterReports: true, clean: true, reporter: ['html'] })
})

it.each([
  [undefined, true],
  [true, true],
  ['true', true],
  [false, false],
  ['false', false],
])(
  'preserves the scalar cleanOnRerun flag %s as %s',
  async (input, expected) => {
    const { parseStandardCoverageOptions } = await import(
      'next/dist/experimental/testing/coverage/options'
    )
    expect(
      parseStandardCoverageOptions({
        'coverage.reporter': ['json'],
        'coverage.cleanOnRerun': input,
      })?.cleanOnRerun
    ).toBe(expected)
    expect(() =>
      parseStandardCoverageOptions({ 'coverage.cleanOnRerun': 'sometimes' })
    ).toThrow('true or false')
  }
)

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

describe('actual standard merged-map observer', () => {
  function expectActualMap(value: unknown, expected: unknown) {
    const { isDeepStrictEqual } = require('node:util')
    // Genuine converter metadata contains Maps from a separate compiled realm.
    expect(
      isDeepStrictEqual(structuredClone(value), structuredClone(expected))
    ).toBe(true)
  }
  it.each(['passed', 'failed'] as const)(
    'observes V8 data before file publication for a %s run',
    async (status) => {
      const { publishStandardCoverage } = await import(
        'next/dist/experimental/testing/coverage/report-standard'
      )
      const f = await standardReportFixture()
      try {
        const seen: unknown[] = []
        const result = await publishStandardCoverage({
          ...f,
          projectDir: f.root,
          status,
          config: { ...f.config, include: ['subject.mjs'] },
          onCoverageMap: async (map) => {
            await expect(
              readFile(join(f.root, 'coverage', 'coverage-final.json'))
            ).rejects.toMatchObject({ code: 'ENOENT' })
            expectActualMap(map, { [f.file]: f.data })
            seen.push(structuredClone(map))
            map[f.file].s['0'] = 876
            await Promise.resolve()
          },
        })
        expectActualMap(seen, [{ [f.file]: f.data }])
        if (status === 'failed') {
          expect(result).toEqual({ published: false, thresholdErrors: [] })
          await expect(
            readFile(join(f.root, 'coverage', 'coverage-final.json'))
          ).rejects.toMatchObject({ code: 'ENOENT' })
        } else {
          expect(result.published).toBe(true)
          expect(result.thresholdErrors.length).toBeGreaterThan(0)
          expect(
            JSON.parse(
              await readFile(
                join(f.root, 'coverage', 'coverage-final.json'),
                'utf8'
              )
            )
          ).toEqual(JSON.parse(JSON.stringify({ [f.file]: f.data })))
        }
      } finally {
        await rm(f.root, { recursive: true, force: true })
      }
    }
  )
  it.each(['passed', 'failed'] as const)(
    'prepares the actual V8 map without changing prior files or evaluating thresholds for %s',
    async (status) => {
      const { publishStandardCoverage } = await import(
        'next/dist/experimental/testing/coverage/report-standard'
      )
      const { mkdir, readdir } = await import('fs/promises')
      const f = await standardReportFixture()
      try {
        const output = join(f.root, 'coverage')
        await mkdir(output)
        await writeFile(
          join(output, 'coverage-final.json'),
          'prior coverage bytes'
        )
        const seen: unknown[] = []
        const result = await publishStandardCoverage({
          ...f,
          projectDir: f.root,
          status,
          config: {
            ...f.config,
            include: ['subject.mjs'],
            reportOnFailure: true,
            thresholds: { lines: 100, functions: 0, autoUpdate: true },
          },
          prepareOnly: true,
          onCoverageMap: async (map) => {
            seen.push(map)
            await Promise.resolve()
            expect(
              await readFile(join(output, 'coverage-final.json'), 'utf8')
            ).toBe('prior coverage bytes')
          },
        })
        expectActualMap(seen, [{ [f.file]: f.data }])
        expect(result).toEqual({ published: false, thresholdErrors: [] })
        expect(await readdir(output)).toEqual(['coverage-final.json'])
        expect(
          await readFile(join(output, 'coverage-final.json'), 'utf8')
        ).toBe('prior coverage bytes')
      } finally {
        await rm(f.root, { recursive: true, force: true })
      }
    }
  )
  it('requires the explicit V8 prepare option and its actual observer before reading facts', async () => {
    const { publishStandardCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-standard'
    )
    const options = {
      projectDir: '/missing-standard-preparation',
      facts: [],
      expected: new Set(['entry']),
      excludedFiles: [],
      status: 'failed' as const,
      config: {
        reporter: ['json'] as 'json'[],
        exclude: [],
        reportsDirectory: 'coverage',
        reportOnFailure: false,
        thresholds: {},
      },
    }
    await expect(
      publishStandardCoverage({ ...options, prepareOnly: true })
    ).rejects.toThrow('actual map observer')
    const onCoverageMap = jest.fn()
    await expect(
      publishStandardCoverage({
        ...options,
        prepareOnly: false as any,
        onCoverageMap,
      })
    ).rejects.toThrow('explicit true option')
    await expect(
      publishStandardCoverage({ ...options, prepareOnly: true, onCoverageMap })
    ).rejects.toThrow()
    expect(onCoverageMap).not.toHaveBeenCalled()
    expect(
      await publishStandardCoverage({ ...options, prepareOnly: undefined })
    ).toEqual({ published: false, thresholdErrors: [] })
  })
  it('awaits and preserves a V8 preparation observer rejection without publishing', async () => {
    const { publishStandardCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-standard'
    )
    const f = await standardReportFixture()
    try {
      const failure = new Error('owned preparation callback failed')
      await expect(
        publishStandardCoverage({
          ...f,
          projectDir: f.root,
          status: 'passed',
          prepareOnly: true,
          onCoverageMap: async () => {
            await Promise.resolve()
            throw failure
          },
        })
      ).rejects.toBe(failure)
      await expect(
        readFile(join(f.root, 'coverage', 'coverage-final.json'))
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })
  it('still rejects stale V8 source before a preparation observer can run', async () => {
    const { publishStandardCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-standard'
    )
    const f = await standardReportFixture()
    try {
      await writeFile(f.file, f.source + '\n')
      const onCoverageMap = jest.fn()
      await expect(
        publishStandardCoverage({
          ...f,
          projectDir: f.root,
          status: 'passed',
          prepareOnly: true,
          onCoverageMap,
        })
      ).rejects.toThrow('changed after capture')
      expect(onCoverageMap).not.toHaveBeenCalled()
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })
  it('keeps V8 failure preparation opt-in and rejects an invalid observed capture', async () => {
    const { publishStandardCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-standard'
    )
    const config = {
      reporter: ['json'] as 'json'[],
      exclude: [],
      reportsDirectory: 'coverage',
      reportOnFailure: false,
      thresholds: {},
    }
    const options = {
      projectDir: '/missing-standard-project',
      facts: [],
      expected: new Set(['entry']),
      excludedFiles: [],
      config,
      status: 'failed' as const,
    }
    expect(await publishStandardCoverage(options)).toEqual({
      published: false,
      thresholdErrors: [],
    })
    const onCoverageMap = jest.fn()
    await expect(
      publishStandardCoverage({ ...options, onCoverageMap })
    ).rejects.toThrow()
    expect(onCoverageMap).not.toHaveBeenCalled()
  })
  it.each(['observer-error', 'stale-source', 'cancelled'] as const)(
    'preserves prior V8 reports for %s',
    async (scenario) => {
      const { publishStandardCoverage } = await import(
        'next/dist/experimental/testing/coverage/report-standard'
      )
      const { mkdir } = await import('fs/promises')
      const f = await standardReportFixture()
      try {
        const output = join(f.root, 'coverage', 'coverage-final.json')
        await mkdir(join(f.root, 'coverage'))
        await writeFile(output, 'prior-report')
        if (scenario === 'stale-source')
          await writeFile(f.file, f.source + '\n')
        const onCoverageMap = jest.fn(async () => {
          throw new Error('actual map observer failed')
        })
        await expect(
          publishStandardCoverage({
            ...f,
            projectDir: f.root,
            status: scenario === 'cancelled' ? 'cancelled' : 'passed',
            onCoverageMap,
          })
        ).rejects.toThrow()
        expect(onCoverageMap).toHaveBeenCalledTimes(
          scenario === 'observer-error' ? 1 : 0
        )
        expect(await readFile(output, 'utf8')).toBe('prior-report')
      } finally {
        await rm(f.root, { recursive: true, force: true })
      }
    }
  )
  it('retains the observed V8 map if report promotion subsequently fails', async () => {
    const { publishStandardCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-standard'
    )
    const f = await standardReportFixture()
    try {
      await writeFile(join(f.root, 'coverage'), 'owned output obstruction')
      const seen: unknown[] = []
      await expect(
        publishStandardCoverage({
          ...f,
          projectDir: f.root,
          status: 'passed',
          config: { ...f.config, include: ['subject.mjs'] },
          onCoverageMap: (map) => {
            seen.push(map)
          },
        })
      ).rejects.toThrow('not a regular dedicated directory')
      expectActualMap(seen, [{ [f.file]: f.data }])
      expect(await readFile(join(f.root, 'coverage'), 'utf8')).toBe(
        'owned output obstruction'
      )
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })
})

it('accepts and deduplicates json-summary alongside the other standard reporters', async () => {
  const { parseStandardCoverageOptions } = await import(
    'next/dist/experimental/testing/coverage/options'
  )
  expect(
    parseStandardCoverageOptions({
      'coverage.reporter': ['json-summary', 'json', 'lcov', 'json-summary'],
    })?.reporter
  ).toEqual(['json-summary', 'json', 'lcov'])
})

it('parses finite negative uncovered-count thresholds without converting their units', async () => {
  const { parseStandardCoverageOptions } = await import(
    'next/dist/experimental/testing/coverage/options'
  )
  for (const value of [-3, '-3', '-0.5']) {
    expect(
      parseStandardCoverageOptions({ 'coverage.thresholds.lines': value })
        ?.thresholds.lines
    ).toBe(Number(value))
  }
  for (const value of ['-Infinity', 'Infinity', 'NaN', '']) {
    expect(() =>
      parseStandardCoverageOptions({ 'coverage.thresholds.lines': value })
    ).toThrow('negative maximum uncovered count')
  }
})

it.each([
  {
    name: 'passes at the maximum uncovered count',
    thresholds: { statements: -2, functions: -1, branches: -1, lines: -2 },
    errors: [],
  },
  {
    name: 'fails above the maximum uncovered count',
    thresholds: { statements: -1, functions: -0.5, branches: -0.5, lines: -1 },
    errors: [
      'Uncovered statements (2) exceed global threshold (1)',
      'Uncovered functions (1) exceed global threshold (0.5)',
      'Uncovered branches (1) exceed global threshold (0.5)',
      'Uncovered lines (2) exceed global threshold (1)',
    ],
  },
])(
  'uses original declaration counts when a negative threshold $name',
  async ({ thresholds, errors }) => {
    const { publishStandardCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-standard'
    )
    const f = await standardReportFixture()
    try {
      const result = await publishStandardCoverage({
        projectDir: f.root,
        ...f,
        config: { ...f.config, include: ['subject.mjs'], thresholds },
        status: 'passed',
      })
      expect(result.thresholdErrors).toEqual(errors)
      expect(result.published).toBe(true)
      const report = JSON.parse(
        await readFile(join(f.root, 'coverage/coverage-final.json'), 'utf8')
      )
      expect(Object.keys(report)).toEqual([f.file])
      expect(result.summary?.statements).toEqual({
        total: 4,
        covered: 2,
        percent: 50,
      })
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  }
)

it('matches the Istanbul empty coverage-map summary without changing threshold arithmetic', async () => {
  const { standardCoverageJsonSummary, standardCoverageSummary } = await import(
    'next/dist/experimental/testing/coverage/report-standard'
  )
  const metric = { total: 0, covered: 0, skipped: 0, pct: 'Unknown' }
  expect(standardCoverageJsonSummary({})).toEqual({
    total: {
      statements: metric,
      functions: metric,
      branches: metric,
      lines: metric,
      branchesTrue: metric,
    },
  })
  expect(standardCoverageSummary({}).lines.percent).toBe(100)
})

it('parses per-file threshold booleans without changing omitted or explicit false values', async () => {
  const { parseStandardCoverageOptions } = await import(
    'next/dist/experimental/testing/coverage/options'
  )
  for (const [value, expected] of [
    [true, true],
    ['true', true],
    [false, false],
    ['false', false],
    [undefined, undefined],
  ]) {
    expect(
      parseStandardCoverageOptions({
        'coverage.thresholds.lines': 50,
        'coverage.thresholds.perFile': value,
      })?.thresholds.perFile
    ).toBe(expected)
  }
  expect(() =>
    parseStandardCoverageOptions({ 'coverage.thresholds.perFile': 'sometimes' })
  ).toThrow('must be true or false')
})

it.each([
  {
    name: 'checks percentage limits separately',
    thresholds: { lines: 50, perFile: true },
    errors: [
      'Coverage for lines (33.33%) does not meet global threshold (50%) for subject.mjs',
      'Coverage for lines (0%) does not meet global threshold (50%) for unimported.mjs',
    ],
  },
  {
    name: 'allows the uncovered limit independently in each file',
    thresholds: { statements: -2, perFile: true },
    errors: [],
  },
  {
    name: 'retains global aggregation when explicitly false',
    thresholds: { statements: -2, perFile: false },
    errors: ['Uncovered statements (4) exceed global threshold (2)'],
  },
])('per-file standard coverage $name', async ({ thresholds, errors }) => {
  const { publishStandardCoverage } = await import(
    'next/dist/experimental/testing/coverage/report-standard'
  )
  const f = await standardReportFixture()
  try {
    const result = await publishStandardCoverage({
      projectDir: f.root,
      ...f,
      config: { ...f.config, thresholds },
      status: 'passed',
    })
    expect(result.thresholdErrors).toEqual(errors)
    expect(result.published).toBe(true)
    expect(result.summary?.statements).toEqual({
      total: 6,
      covered: 2,
      percent: 33.33,
    })
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it.each([
  {
    name: 'configured global percentages',
    formatterReports: true as const,
    thresholds: { statements: 99, functions: 99, branches: 99, lines: 99 },
    errors: [
      'Coverage for lines (33.33%) does not meet global threshold (99%)',
      'Coverage for functions (50%) does not meet global threshold (99%)',
      'Coverage for statements (50%) does not meet global threshold (99%)',
      'Coverage for branches (50%) does not meet global threshold (99%)',
    ],
  },
  {
    name: 'legacy CLI percentages',
    formatterReports: undefined,
    thresholds: { statements: 99, functions: 99, branches: 99, lines: 99 },
    errors: [
      'Coverage for statements (50%) does not meet global threshold (99%).',
      'Coverage for functions (50%) does not meet global threshold (99%).',
      'Coverage for branches (50%) does not meet global threshold (99%).',
      'Coverage for lines (33.33%) does not meet global threshold (99%).',
    ],
  },
  {
    name: 'configured per-file percentages',
    formatterReports: true as const,
    thresholds: {
      statements: 99,
      functions: 99,
      branches: 99,
      lines: 99,
      perFile: true,
    },
    errors: [
      'Coverage for lines (33.33%) does not meet global threshold (99%) for subject.mjs',
      'Coverage for functions (50%) does not meet global threshold (99%) for subject.mjs',
      'Coverage for statements (50%) does not meet global threshold (99%) for subject.mjs',
      'Coverage for branches (50%) does not meet global threshold (99%) for subject.mjs',
    ],
  },
  {
    name: 'configured negative thresholds',
    formatterReports: true as const,
    thresholds: { statements: -1, functions: -0.5, branches: -0.5, lines: -1 },
    errors: [
      'Uncovered statements (2) exceed global threshold (1)',
      'Uncovered functions (1) exceed global threshold (0.5)',
      'Uncovered branches (1) exceed global threshold (0.5)',
      'Uncovered lines (2) exceed global threshold (1)',
    ],
  },
  {
    name: 'configured mixed threshold units',
    formatterReports: true as const,
    thresholds: { statements: 99, functions: -0.5, branches: 99, lines: 99 },
    errors: [
      'Coverage for statements (50%) does not meet global threshold (99%).',
      'Uncovered functions (1) exceed global threshold (0.5)',
      'Coverage for branches (50%) does not meet global threshold (99%).',
      'Coverage for lines (33.33%) does not meet global threshold (99%).',
    ],
  },
])(
  'preserves exact standard threshold diagnostics for $name',
  async ({ formatterReports, thresholds, errors }) => {
    const { publishStandardCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-standard'
    )
    const f = await standardReportFixture()
    try {
      const result = await publishStandardCoverage({
        projectDir: f.root,
        ...f,
        config: {
          ...f.config,
          include: ['subject.mjs'],
          reporter: ['json'],
          formatterReports,
          thresholds,
        },
        status: 'passed',
        includeUnimported: false,
      })
      expect(result.published).toBe(true)
      expect(result.thresholdErrors).toEqual(errors)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  }
)

it('publishes the full json-summary contract and replaces prior standard artifacts on rerun', async () => {
  const { publishStandardCoverage } = await import(
    'next/dist/experimental/testing/coverage/report-standard'
  )
  const f = await standardReportFixture()
  try {
    await writeFile(
      join(f.root, 'unimported.mjs'),
      'export function untouched() {\n  return 9\n}\n'
    )
    const result = await publishStandardCoverage({
      projectDir: f.root,
      ...f,
      config: { ...f.config, reporter: ['json', 'json-summary', 'lcov'] },
      status: 'passed',
    })
    // Pinned Istanbul json-summary fields, including uncovered source totals.
    const summary = {
      total: {
        lines: { total: 4, covered: 1, skipped: 0, pct: 25 },
        statements: { total: 5, covered: 2, skipped: 0, pct: 40 },
        functions: { total: 3, covered: 1, skipped: 0, pct: 33.33 },
        branches: { total: 2, covered: 1, skipped: 0, pct: 50 },
        branchesTrue: { total: 0, covered: 0, skipped: 0, pct: 'Unknown' },
      },
      [f.file]: {
        lines: { total: 3, covered: 1, skipped: 0, pct: 33.33 },
        functions: { total: 2, covered: 1, skipped: 0, pct: 50 },
        statements: { total: 4, covered: 2, skipped: 0, pct: 50 },
        branches: { total: 2, covered: 1, skipped: 0, pct: 50 },
      },
      [join(f.root, 'unimported.mjs')]: {
        lines: { total: 1, covered: 0, skipped: 0, pct: 0 },
        functions: { total: 1, covered: 0, skipped: 0, pct: 0 },
        statements: { total: 1, covered: 0, skipped: 0, pct: 0 },
        branches: { total: 0, covered: 0, skipped: 0, pct: 100 },
      },
    }
    const report = join(f.root, 'coverage/coverage-summary.json')
    expect(JSON.parse(await readFile(report, 'utf8'))).toEqual(summary)
    expect(result.files).toContain(report)
    expect(result.thresholdErrors).toHaveLength(1)
    await publishStandardCoverage({
      projectDir: f.root,
      ...f,
      config: { ...f.config, reporter: ['json-summary'] },
      status: 'passed',
    })
    expect(JSON.parse(await readFile(report, 'utf8'))).toEqual(summary)
    await expect(
      readFile(join(f.root, 'coverage/coverage-final.json'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      readFile(join(f.root, 'coverage/lcov.info'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

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

it.each([null, false, 0, ''])(
  'rejects present standard metadata with a non-object value: %p',
  async (metadata) => {
    const { assertStandardCoverageFacts } = await import(
      'next/dist/experimental/testing/coverage/report-standard'
    )
    const f = await standardReportFixture()
    try {
      delete f.facts[0].files[0].data.meta
      await assertStandardCoverageFacts(f.facts, f.root, f.expected)
      f.facts[0].files[0].data.meta = metadata as any
      await expect(
        assertStandardCoverageFacts(f.facts, f.root, f.expected)
      ).rejects.toThrow('Invalid standard coverage metadata')
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  }
)

it('validates genuine cross-realm function-name Maps without invoking custom iterators', async () => {
  const { assertStandardCoverageFacts } = await import(
    'next/dist/experimental/testing/coverage/report-standard'
  )
  const f = await standardReportFixture()
  try {
    const metadata = f.facts[0].files[0].data.meta!
    expect(metadata.fnNames).toBeInstanceOf(Map)
    const entries = Array.from(metadata.fnNames as Map<string, number>)
    const crossRealm = require('vm').runInNewContext('new Map(entries)', {
      entries,
    })
    const customIterator = new Map(entries)
    Object.defineProperty(customIterator, Symbol.iterator, {
      value() {
        throw new Error('Coverage metadata must use the intrinsic Map iterator')
      },
    })
    for (const names of [
      crossRealm,
      customIterator,
      Object.fromEntries(entries),
    ]) {
      metadata.fnNames = names
      await assertStandardCoverageFacts(f.facts, f.root, f.expected)
      expect(metadata.fnNames).toBe(names)
    }
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it.each([
  ['negative count', 'foreign', -1],
  ['infinite count', 'foreign', Infinity],
  ['unsafe count', 'foreign', Number.MAX_SAFE_INTEGER + 1],
  ['fractional count', 'foreign', 1.5],
  ['string count', 'foreign', '1'],
  ['numeric key', 3, 1],
  ['object key', {}, 1],
])(
  'rejects converter function-name Map metadata with a %s',
  async (_, name, value) => {
    const { assertStandardCoverageFacts } = await import(
      'next/dist/experimental/testing/coverage/report-standard'
    )
    const f = await standardReportFixture()
    try {
      const metadata = f.facts[0].files[0].data.meta!
      expect(metadata.fnNames).toBeInstanceOf(Map)
      await assertStandardCoverageFacts(f.facts, f.root, f.expected)
      metadata.fnNames = new Map<unknown, unknown>([[name, value]]) as Map<
        string,
        number
      >
      await expect(
        assertStandardCoverageFacts(f.facts, f.root, f.expected)
      ).rejects.toThrow('Invalid standard coverage metadata')
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  }
)

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

it.each([false, true])(
  'rolls back a standard report cancelled during the commit rename (previous=%s)',
  async (existing) => {
    const { publishStandardCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-standard'
    )
    const f = await standardReportFixture()
    const output = join(f.root, 'coverage')
    const report = join(output, 'coverage-final.json')
    let previous: Buffer | undefined
    const controller = new AbortController()
    const reason = new Error('cancelled while publication rename was queued')
    const nativeRename = customFileSystem.rename
    let rename: jest.SpyInstance | undefined
    try {
      if (existing) {
        await publishStandardCoverage({
          projectDir: f.root,
          ...f,
          status: 'passed',
        })
        previous = await readFile(report)
      }
      rename = jest
        .spyOn(customFileSystem, 'rename')
        .mockImplementation(async (from, to) => {
          if (to === output && !controller.signal.aborted)
            controller.abort(reason)
          await nativeRename(from, to)
        })
      await expect(
        publishStandardCoverage({
          projectDir: f.root,
          ...f,
          status: 'passed',
          signal: controller.signal,
        })
      ).rejects.toBe(reason)
      if (existing) expect(await readFile(report)).toEqual(previous)
      else
        await expect(readFile(report)).rejects.toMatchObject({ code: 'ENOENT' })
      const files = await customFileSystem.readdir(f.root)
      expect(
        files.filter((file) => file.startsWith('.next-test-coverage-'))
      ).toEqual([])
    } finally {
      rename?.mockRestore()
      await rm(f.root, { recursive: true, force: true })
    }
  }
)

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
      await runNodeHelper([
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

describe('native production source coverage provenance', () => {
  const nativeId = 'd'.repeat(64)
  const entryPath = `server/next-test/${nativeId}.js`
  const proofPath = `server/next-test/${nativeId}.source-coverage.json`
  const certificate = {
    version: 1,
    kind: 'node-source-coverage',
    mode: 'production',
    sourceMaps: 'absolute-file-uri',
    preserveOriginalSyntax: true,
  }

  async function sourceFixture() {
    const fs = await import('fs/promises')
    const f = await fixture()
    await fs.mkdir(join(f.root, 'server/next-test'), { recursive: true })
    await fs.writeFile(join(f.root, proofPath), JSON.stringify(certificate))
    const { readSourceCoverageProof } = await import(
      'next/dist/experimental/testing/coverage/source-profile'
    )
    const files = [...f.artifact.files, proofPath]
    const sourcePreservation = await readSourceCoverageProof(
      f.root,
      entryPath,
      files
    )
    return {
      ...f,
      artifact: {
        ...f.artifact,
        entryPath,
        profile: { ...profile, mode: 'production' as const },
        files,
        coverage: { ...f.artifact.coverage, sourcePreservation },
      },
    }
  }

  it('binds source-preserving production compilation to immutable native metadata', async () => {
    const f = await sourceFixture()
    try {
      const { verifySourceCoverageArtifact } = await import(
        'next/dist/experimental/testing/coverage/source-profile'
      )
      await expect(
        verifySourceCoverageArtifact(f.artifact)
      ).resolves.toBeUndefined()
      await writeFile(
        join(f.root, proofPath),
        JSON.stringify({ ...certificate, preserveOriginalSyntax: false })
      )
      await expect(verifySourceCoverageArtifact(f.artifact)).rejects.toThrow(
        'compilation contract'
      )
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it.each([
    'missing',
    'changed-bytes',
    'unexpected-field',
    'wrong-mode',
    'missing-output',
  ])('rejects a %s native source coverage certificate', async (kind) => {
    const f = await sourceFixture()
    try {
      const { verifySourceCoverageArtifact } = await import(
        'next/dist/experimental/testing/coverage/source-profile'
      )
      if (kind === 'missing')
        delete (f.artifact.coverage as any).sourcePreservation
      if (kind === 'changed-bytes')
        await writeFile(
          join(f.root, proofPath),
          JSON.stringify(certificate) + '\n'
        )
      if (kind === 'unexpected-field')
        await writeFile(
          join(f.root, proofPath),
          JSON.stringify({ ...certificate, unknown: true })
        )
      if (kind === 'wrong-mode') f.artifact.profile.mode = 'development' as any
      if (kind === 'missing-output')
        f.artifact.files = f.artifact.files.filter((file) => file !== proofPath)
      await expect(verifySourceCoverageArtifact(f.artifact)).rejects.toThrow(
        /source.preserving|changed after|compilation contract/
      )
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })
})

it('rejects unqualified TypeScript arrow binding maps at their authored location', async () => {
  const { remapStandardCoverage } = await import(
    'next/dist/experimental/testing/coverage/istanbul'
  )
  const owned = await actualTypeScriptCapture(
    'export const double = (value: number): number => value * 2\n'
  )
  try {
    await expect(
      remapStandardCoverage(owned.artifact, owned.capture)
    ).rejects.toThrow(
      `TypeScript arrow-function coverage requires compiler-qualified binding maps: ${owned.subject}:1:22`
    )
  } finally {
    await rm(owned.root, { recursive: true, force: true })
  }
})

it.each(['unimported', 'runtime', 'partial'] as const)(
  'publishes parent-authorized compiler declarations separately from authoritative %s hits',
  async (kind) => {
    const { publishStandardCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-standard'
    )
    const { remapStandardCoverage } = await import(
      'next/dist/experimental/testing/coverage/istanbul'
    )
    const owned = await compilerSourcePlanFixture()
    try {
      const runtime = await remapStandardCoverage(owned.artifact, owned.capture)
      if (kind === 'runtime')
        expect(runtime.files[0].sha256).toBe(owned.facts[0].source.sha256)
      const result = await publishStandardCoverage({
        projectDir: owned.root,
        config: owned.config,
        facts: kind === 'runtime' ? [runtime] : [],
        expected: new Set(kind === 'runtime' ? [runtime.entryId] : []),
        excludedFiles: [],
        status: 'passed',
        includeUnimported: kind !== 'partial',
        sourceAnalysis:
          kind === 'partial'
            ? { facts: [], plan: { version: 1, requests: [], inputs: [] } }
            : { facts: owned.facts, plan: owned.plan },
      })
      expect(result.published).toBe(true)
      const report = JSON.parse(
        await readFile(join(owned.root, 'coverage/coverage-final.json'), 'utf8')
      )
      expect(Object.keys(report)).toEqual(
        kind === 'partial' ? [] : [owned.subject]
      )
      if (kind !== 'partial')
        expect(report[owned.subject]).toEqual(
          JSON.parse(
            JSON.stringify(
              kind === 'runtime' ? runtime.files[0].data : owned.facts[0].data
            )
          )
        )
      expect(owned.facts[0].data.f).toEqual({ 0: 0 })
    } finally {
      await rm(owned.root, { recursive: true, force: true })
    }
  }
)

it.each(['map', 'metadata'] as const)(
  'rejects parent declaration %s disagreeing with actual runtime descriptors',
  async (field) => {
    const { publishStandardCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-standard'
    )
    const { remapStandardCoverage } = await import(
      'next/dist/experimental/testing/coverage/istanbul'
    )
    const owned = await compilerSourcePlanFixture()
    try {
      const runtime = await remapStandardCoverage(owned.artifact, owned.capture)
      for (const fact of owned.facts) {
        if (field === 'map') fact.data.fnMap[0].decl.end.column++
        else fact.data.meta!.seen['borrowed-descriptor'] = 0
      }
      await expect(
        publishStandardCoverage({
          projectDir: owned.root,
          config: owned.config,
          facts: [runtime],
          expected: new Set([runtime.entryId]),
          excludedFiles: [],
          status: 'passed',
          sourceAnalysis: { facts: owned.facts, plan: owned.plan },
        })
      ).rejects.toThrow(
        'Runtime and compiler analysis disagree on original coverage descriptors'
      )
      await expect(
        readFile(join(owned.root, 'coverage/coverage-final.json'))
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(owned.root, { recursive: true, force: true })
    }
  }
)

it.each(['configuration', 'source', 'cancellation'] as const)(
  'rolls back compiler declaration publication after late %s mutation',
  async (field) => {
    const { publishStandardCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-standard'
    )
    const fs = require('fs/promises') as typeof import('fs/promises')
    const owned = await compilerSourcePlanFixture(),
      controller = new AbortController()
    const options = {
      projectDir: owned.root,
      config: owned.config,
      facts: [],
      expected: new Set<string>(),
      excludedFiles: [],
      status: 'passed' as const,
      sourceAnalysis: { facts: owned.facts, plan: owned.plan },
      signal: controller.signal,
    }
    try {
      await publishStandardCoverage(options)
      const reportPath = join(owned.root, 'coverage/coverage-final.json'),
        previous = await readFile(reportPath, 'utf8'),
        originalRename = fs.rename
      let mutated = false
      jest.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
        await originalRename(from, to)
        if (!mutated && to === join(owned.root, 'coverage')) {
          mutated = true
          if (field === 'cancellation')
            controller.abort(new Error('analysis commit cancelled'))
          else
            await writeFile(
              field === 'source'
                ? owned.subject
                : join(owned.root, 'next.config.mjs'),
              'changed bytes'
            )
        }
      })
      await expect(publishStandardCoverage(options)).rejects.toThrow(
        field === 'cancellation'
          ? 'analysis commit cancelled'
          : 'Compiler coverage analysis inputs changed after selection'
      )
      expect(mutated).toBe(true)
      expect(await readFile(reportPath, 'utf8')).toBe(previous)
    } finally {
      jest.restoreAllMocks()
      await rm(owned.root, { recursive: true, force: true })
    }
  }
)

it('rejects selected symbolic typed source paths rather than silently dropping their denominator', async () => {
  const { symlink } = await import('fs/promises')
  const { createCoverageSourcePlan } = await import(
    'next/dist/experimental/testing/coverage/source-analysis-plan'
  )
  const owned = await compilerSourcePlanFixture()
  try {
    const alias = join(owned.root, 'alias.ts')
    await symlink(owned.subject, alias)
    await expect(
      createCoverageSourcePlan({
        projectDir: owned.root,
        projects: owned.projects,
        config: owned.config,
        signal: owned.signal,
      })
    ).rejects.toThrow(
      `Compiler coverage analysis source must be a canonical regular file: ${alias}`
    )
  } finally {
    await rm(owned.root, { recursive: true, force: true })
  }
})

it.each([
  'next.config.js',
  'tsconfig.json',
  'jsconfig.json',
  'package.json',
  '.env',
  '.env.development.local',
  '.env.production',
])(
  'rejects a newly introduced supported compiler configuration candidate: %s',
  async (filename) => {
    const { assertCompilerSourceCoverage } = await import(
      'next/dist/experimental/testing/coverage/source-analysis-plan'
    )
    const owned = await compilerSourcePlanFixture()
    try {
      await writeFile(join(owned.root, filename), '{}')
      await expect(
        assertCompilerSourceCoverage(owned.facts, owned.plan, owned.signal)
      ).rejects.toThrow(
        'Compiler coverage configuration inventory changed after selection'
      )
    } finally {
      await rm(owned.root, { recursive: true, force: true })
    }
  }
)

it('rejects removal of the previously selected compiler configuration candidate', async () => {
  const { assertCompilerSourceCoverage } = await import(
    'next/dist/experimental/testing/coverage/source-analysis-plan'
  )
  const owned = await compilerSourcePlanFixture()
  try {
    await rm(join(owned.root, 'next.config.mjs'))
    await expect(
      assertCompilerSourceCoverage(owned.facts, owned.plan, owned.signal)
    ).rejects.toThrow(
      'Compiler coverage configuration inventory changed after selection'
    )
  } finally {
    await rm(owned.root, { recursive: true, force: true })
  }
})

it('rejects a newly observed typed runtime source absent from parent source/profile authorization', async () => {
  const { publishStandardCoverage } = await import(
    'next/dist/experimental/testing/coverage/report-standard'
  )
  const { remapStandardCoverage } = await import(
    'next/dist/experimental/testing/coverage/istanbul'
  )
  const owned = await compilerSourcePlanFixture()
  try {
    const runtime = await remapStandardCoverage(owned.artifact, owned.capture)
    await expect(
      publishStandardCoverage({
        projectDir: owned.root,
        config: owned.config,
        facts: [runtime],
        expected: new Set([runtime.entryId]),
        excludedFiles: [],
        status: 'passed',
        sourceAnalysis: {
          facts: [],
          plan: { version: 1, requests: [], inputs: [] },
        },
      })
    ).rejects.toThrow(
      'Selected typed coverage source was not authorized by the parent analysis'
    )
  } finally {
    await rm(owned.root, { recursive: true, force: true })
  }
})

it('retains parent source/profile and absence inventory through JSON transport arrays', async () => {
  const { assertCompilerSourceCoverage } = await import(
    'next/dist/experimental/testing/coverage/source-analysis-plan'
  )
  const owned = await compilerSourcePlanFixture()
  try {
    const plan = JSON.parse(JSON.stringify(owned.plan)) as typeof owned.plan
    await expect(
      assertCompilerSourceCoverage(owned.facts, plan, owned.signal)
    ).resolves.toHaveLength(1)
    await writeFile(join(owned.root, 'next.config.js'), 'export default {}')
    await expect(
      assertCompilerSourceCoverage(owned.facts, plan, owned.signal)
    ).rejects.toThrow(
      'Compiler coverage configuration inventory changed after selection'
    )
  } finally {
    await rm(owned.root, { recursive: true, force: true })
  }
})

describe('compiler-qualified TypeScript arrow binding roles', () => {
  type Point = { line: number; column: number }
  type Node = {
    type: string
    loc: { start: Point; end: Point }
    id?: Node
    init?: Node
    body?: Node
    params?: Node[]
  }
  type Token = { generated: Point; original: Point; source: string }

  async function arrowFixture(
    source = 'export const double = (value: number): number => value * 2',
    code = 'const double = (value) => value * 2;',
    mutate = (_tokens: Token[], _authored: Node, _emitted: Node) => {}
  ) {
    const { parse: parseAuthored } = await import(
      'next/dist/compiled/babel/parser'
    )
    const { parse } = (await import('next/dist/compiled/acorn')) as unknown as {
      parse(source: string, options: unknown): unknown
    }
    const { SourceMapGenerator } = (await import(
      'next/dist/compiled/source-map'
    )) as unknown as {
      SourceMapGenerator: new () => {
        addMapping(mapping: Token): void
        setSourceContent(file: string, content: string): void
        toString(): string
      }
    }
    const helpers = await import(
      'next/dist/experimental/testing/coverage/arrow-bindings'
    )
    const file = '/owned/subject.ts'
    const authored = parseAuthored(source, {
      sourceType: 'module',
      plugins: ['estree', 'typescript'],
    }).program as unknown as Node
    const emitted = parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
    }) as unknown as Node
    function declarations(value: unknown, result: Node[] = []): Node[] {
      if (!value || typeof value !== 'object') return result
      if (Array.isArray(value)) {
        for (const child of value) declarations(child, result)
      } else {
        const node = value as Node
        if (node.type === 'VariableDeclarator') result.push(node)
        for (const [key, child] of Object.entries(value))
          if (!['loc', 'comments', 'tokens'].includes(key))
            declarations(child, result)
      }
      return result
    }
    const originals = declarations(authored)
    const generated = declarations(emitted)
    const tokens: Token[] = []
    for (const [index, original] of originals.entries()) {
      const output = generated[index]
      if (!original.init || !output?.init) continue
      for (const [a, b] of [
        [original.id!, output.id!],
        [original.init, output.init],
        [original.init.body!, output.init.body!],
        ...(original.init.params ?? []).map((param, index) => [
          param,
          output.init!.params![index],
        ]),
      ])
        if (a && b)
          tokens.push({
            generated: b.loc.start,
            original: a.loc.start,
            source: file,
          })
    }
    mutate(tokens, authored, emitted)
    const map = new SourceMapGenerator()
    for (const token of tokens) map.addMapping(token)
    map.setSourceContent(file, source)
    const sourceMap = JSON.parse(map.toString())
    return {
      ...helpers,
      file,
      authored,
      emitted,
      originals,
      generated,
      sourceMap,
      associate: () =>
        helpers.associateArrowBindings(file, authored, emitted, sourceMap),
    }
  }

  it('changes only the converter map at the uniquely linked initializer', async () => {
    const f = await arrowFixture()
    const before = JSON.stringify(f.sourceMap)
    const associations = f.associate()
    expect(associations).toHaveLength(1)
    expect(associations[0].start).toEqual(f.originals[0].id!.loc.start)
    const result = decodeCoverageMap(
      f.arrowBindingMap(f.file, f.sourceMap, associations)
    )
    const old = decodeCoverageMap(f.sourceMap)
    expect(result.mappings).toEqual(
      old.mappings.map((token) =>
        token.generatedLine === f.generated[0].init!.loc.start.line &&
        token.generatedColumn === f.generated[0].init!.loc.start.column
          ? {
              ...token,
              originalLine: f.originals[0].id!.loc.start.line,
              originalColumn: f.originals[0].id!.loc.start.column,
            }
          : token
      )
    )
    expect(result.sources).toEqual(old.sources)
    expect(JSON.stringify(f.sourceMap)).toBe(before)
  })

  it('uniquely associates multiple declarations and retains async keyword roles', async () => {
    const multiple = await arrowFixture(
      'export const first = (value: number) => value, second = (value: number) => value + 1',
      'const first = (value) => value, second = (value) => value + 1;'
    )
    expect(multiple.associate().map((value) => value.start)).toEqual(
      multiple.originals.map((value) => value.id!.loc.start)
    )
    const async = await arrowFixture(
      'export const later = async (value: number) => value',
      'const later = async (value) => value;'
    )
    expect(async.associate()[0].start).toEqual(
      async.originals[0].init!.loc.start
    )
  })

  it.each([
    ['destructuring', 'const [double] = (value: number) => value'],
    ['assignment', 'let double; double = (value: number) => value'],
    ['property', 'const object = { double: (value: number) => value }'],
    ['callback', 'consume((value: number) => value)'],
  ])('rejects an unqualified %s owner', async (_name, source) => {
    const f = await arrowFixture(source)
    expect(f.associate).toThrow('requires compiler-qualified binding maps')
  })

  it.each(['binding', 'initializer', 'parameter', 'body'] as const)(
    'rejects a shifted original %s mapping',
    async (part) => {
      const f = await arrowFixture(undefined, undefined, (tokens) => {
        const index = { binding: 0, initializer: 1, body: 2, parameter: 3 }[
          part
        ]
        tokens[index].original = { line: 99, column: 0 }
      })
      expect(f.associate).toThrow('requires compiler-qualified binding maps')
    }
  )

  it.each([
    'missing body',
    'missing parameter',
    'foreign body',
    'duplicate binding',
  ] as const)('rejects %s provenance', async (part) => {
    const f = await arrowFixture(undefined, undefined, (tokens) => {
      if (part === 'missing body') tokens.splice(2, 1)
      if (part === 'missing parameter') tokens.splice(3, 1)
      if (part === 'foreign body') tokens[2].source = '/foreign/subject.ts'
      if (part === 'duplicate binding')
        tokens.push({
          ...tokens[0],
          original: { ...tokens[0].original, column: 0 },
        })
    })
    expect(f.associate).toThrow('requires compiler-qualified binding maps')
  })

  it('rejects two emitted declarations mapped to the same authored binding', async () => {
    const f = await arrowFixture(
      'const first = (value: number) => value, second = (value: number) => value + 1',
      'const first = (value) => value, second = (value) => value + 1;',
      (tokens) => {
        tokens[4].original = tokens[0].original
      }
    )
    expect(f.associate).toThrow('requires compiler-qualified binding maps')
  })
})

describe('native-owned import coverage descriptors', () => {
  async function ownedImportFixture() {
    const {
      excludeNativeImportInitializers,
      readImportCoverageProof,
      assertNativeImportExclusion,
    } = await import('next/dist/experimental/testing/coverage/import-roles')
    const { parse } = (await import('next/dist/compiled/acorn')) as unknown as {
      parse(source: string, options: unknown): any
    }
    const { SourceMapGenerator } = (await import(
      'next/dist/compiled/source-map'
    )) as unknown as {
      SourceMapGenerator: new () => {
        addMapping(mapping: unknown): void
        setSourceContent(file: string, content: string): void
        toString(): string
      }
    }
    const root = await realpath(
      await mkdtemp(join(tmpdir(), 'next-import-role-'))
    )
    const file = join(root, 'subject.mjs')
    const authored =
      "import React from 'react'\nexport function choose() { return React }\n"
    const declaration = 'var imported = __turbopack_context__.i("dep");'
    const body = declaration + '\nfunction choose() { return imported; }\n'
    const prefix = '// 🦀\r\n["owner", (__turbopack_context__) => {\n'
    const code = prefix + body + '}];\n'
    const ast = parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      locations: true,
    })
    const map = new SourceMapGenerator()
    map.setSourceContent(pathToFileURL(file).href, authored)
    map.addMapping({
      source: pathToFileURL(file).href,
      generated: { line: 3, column: 0 },
      original: { line: 1, column: 0 },
    })
    map.addMapping({
      source: pathToFileURL(file).href,
      generated: { line: 4, column: 0 },
      original: { line: 2, column: 7 },
    })
    const rawMap = JSON.parse(map.toString())
    await writeFile(file, authored)
    await writeFile(join(root, 'entry.mjs'), '')
    await writeFile(join(root, 'entry.js'), code)
    await writeFile(join(root, 'entry.js.map'), JSON.stringify(rawMap))
    const files = ['entry.js', 'entry.js.map', 'entry.import-coverage.json']
    const coverage = await buildCoverageMetadata({
      rootDir: root,
      files,
      projectDir: root,
      sourceRootDir: root,
      entryFile: join(root, 'entry.mjs'),
      setupFiles: [],
    })
    const data = {
      version: 1,
      kind: 'native-import-initializer-coverage',
      mode: 'development',
      entryPath: 'entry.js',
      scripts: [
        {
          ...coverage.scripts[0],
          sections: [
            {
              offset: { line: 2, column: 0 },
              data: {
                version: 1,
                moduleEnd: { line: 2, column: 0 },
                roles: [
                  {
                    kind: 'esm-import-initializer',
                    start: { line: 0, column: 0 },
                    end: { line: 0, column: declaration.length },
                    binding: 'imported',
                    context: '__turbopack_context__',
                    target: { kind: 'string', value: 'dep' },
                    source: {
                      start: { line: 1, column: 0 },
                      end: { line: 1, column: 25 },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    }
    const artifact: CompiledTestArtifact & {
      coverage: CoverageArtifactMetadata
    } = {
      version: 2,
      kind: 'node',
      profile: { ...profile },
      entryId: 'one',
      revision: 'r1',
      rootDir: root,
      entryPath: 'entry.js',
      files,
      diagnostics: [],
      coverage,
    }
    async function publish() {
      await writeFile(
        join(root, 'entry.import-coverage.json'),
        JSON.stringify(data)
      )
      artifact.coverage.importRoles = await readImportCoverageProof(
        root,
        artifact.entryPath,
        files,
        profile.mode
      )
    }
    await publish()
    const options = {
      artifact,
      code,
      rawMap,
      ast,
      metadata: coverage.scripts[0],
      selectedSources: new Map([[file, authored]]),
    }
    return {
      root,
      file,
      data,
      artifact,
      options,
      publish,
      exclude: () => excludeNativeImportInitializers(options),
      assertNativeImportExclusion,
    }
  }

  it('excludes only the certified initializer without changing retained code, maps or AST', async () => {
    const f = await ownedImportFixture()
    try {
      const retained = JSON.stringify({
        code: f.options.code,
        map: f.options.rawMap,
        ast: f.options.ast,
      })
      const result = await f.exclude()
      expect(result.excluded).toEqual([
        { file: f.file, start: { line: 1, column: 0 } },
      ])
      expect(
        (result.ast as any).body[0].expression.elements[1].body.body.map(
          (node: any) => node.type
        )
      ).toEqual(['FunctionDeclaration'])
      expect(
        JSON.stringify({
          code: f.options.code,
          map: f.options.rawMap,
          ast: f.options.ast,
        })
      ).toBe(retained)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  async function richerOwnedImportFixture() {
    const fixture = await ownedImportFixture()
    const { createHash } = require('node:crypto')
    const authored = fixture.options.selectedSources.get(fixture.file)!
    const section: any = fixture.data.scripts[0].sections[0].data
    Object.assign(section, {
      kind: 'node-import-initializers',
      issuer: { sha256: createHash('sha256').update(authored).digest('hex') },
    })
    Object.assign(section.roles[0], {
      request: 'react',
      imports: [
        {
          declarationOrder: 0,
          sourceRange: structuredClone(section.roles[0].source),
          specifiers: [
            { kind: 'default', local: 'React', imported: 'default' },
          ],
        },
      ],
    })
    await fixture.publish()
    return fixture
  }

  it('validates richer actual import identity with the same exact V8 exclusion', async () => {
    const fixture = await richerOwnedImportFixture()
    try {
      const before = JSON.stringify({
        code: fixture.options.code,
        map: fixture.options.rawMap,
        ast: fixture.options.ast,
      })
      const result = await fixture.exclude()
      expect(result.excluded).toEqual([
        { file: fixture.file, start: { line: 1, column: 0 } },
      ])
      expect(
        (result.ast as any).body[0].expression.elements[1].body.body.map(
          (node: any) => node.type
        )
      ).toEqual(['FunctionDeclaration'])
      expect(
        JSON.stringify({
          code: fixture.options.code,
          map: fixture.options.rawMap,
          ast: fixture.options.ast,
        })
      ).toBe(before)
      fixture.options.selectedSources.clear()
      const unselected = await fixture.exclude()
      expect(unselected.excluded).toEqual([])
      expect(unselected.ast).toBe(fixture.options.ast)
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  })

  it.each([
    'issuer',
    'issuer-extra',
    'missing-issuer',
    'request',
    'order',
    'source-range',
    'local',
    'imported',
    'kind',
    'imports-extra',
    'missing-request',
    'only-legacy',
    'unselected-issuer',
  ])(
    'rejects richer import %s without weakening legacy or unselected-source validation',
    async (mutation) => {
      const fixture = await richerOwnedImportFixture()
      try {
        const section: any = fixture.data.scripts[0].sections[0].data
        const role = section.roles[0]
        if (mutation === 'issuer' || mutation === 'unselected-issuer')
          section.issuer.sha256 = '0'.repeat(64)
        if (mutation === 'unselected-issuer')
          fixture.options.selectedSources.clear()
        if (mutation === 'issuer-extra') section.issuer.extra = true
        if (mutation === 'missing-issuer') delete section.issuer
        if (mutation === 'request') role.request = 'foreign'
        if (mutation === 'order') role.imports[0].declarationOrder++
        if (mutation === 'source-range')
          role.imports[0].sourceRange.end.column--
        if (mutation === 'local')
          role.imports[0].specifiers[0].local = 'foreign'
        if (mutation === 'imported')
          role.imports[0].specifiers[0].imported = '*'
        if (mutation === 'kind')
          role.imports[0].specifiers[0].kind = 'namespace'
        if (mutation === 'imports-extra') role.imports[0].extra = true
        if (mutation === 'missing-request') delete role.request
        if (mutation === 'only-legacy') {
          delete role.request
          delete role.imports
        }
        await fixture.publish()
        await expect(fixture.exclude()).rejects.toThrow(
          'Invalid native import coverage ownership'
        )
      } finally {
        await rm(fixture.root, { recursive: true, force: true })
      }
    }
  )

  it('never grants authority to flat or nested vendor map fields without a native proof', async () => {
    const f = await ownedImportFixture()
    try {
      delete f.artifact.coverage.importRoles
      const forged = {
        version: 1,
        roles: f.data.scripts[0].sections[0].data.roles,
      }
      for (const rawMap of [
        { ...f.options.rawMap, x_next_import_roles: forged },
        {
          version: 3,
          sections: [
            {
              offset: { line: 0, column: 0 },
              map: { ...f.options.rawMap, x_next_import_roles: forged },
            },
          ],
        },
      ]) {
        const result = await (
          await import('next/dist/experimental/testing/coverage/import-roles')
        ).excludeNativeImportInitializers({ ...f.options, rawMap })
        expect(result).toEqual({ ast: f.options.ast, excluded: [] })
        expect(result.ast).toBe(f.options.ast)
      }
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it.each([
    'range',
    'source',
    'target',
    'context',
    'binding',
    'duplicate',
    'offset',
    'profile',
    'runtime',
    'bundler',
    'version',
    'script-hash',
    'map-hash',
    'proof-hash',
    'unlisted-sidecar',
    'extra-field',
  ])('rejects invalid native %s ownership', async (kind) => {
    const f = await ownedImportFixture()
    try {
      const script = f.data.scripts[0],
        section = script.sections[0],
        role = section.data.roles[0]
      if (kind === 'range') role.end.column--
      if (kind === 'source') role.source.end.column--
      if (kind === 'target') role.target.value = 'other'
      if (kind === 'context') role.context = 'foreign'
      if (kind === 'binding') role.binding = 'foreign'
      if (kind === 'duplicate') section.data.roles.push(structuredClone(role))
      if (kind === 'offset') section.offset.column++
      if (kind === 'extra-field') Object.assign(role, { authority: true })
      if (kind === 'version') section.data.version = 2
      if (kind === 'script-hash') script.sha256 = '0'.repeat(64)
      if (kind === 'map-hash') script.mapSha256 = '0'.repeat(64)
      if (!['script-hash', 'map-hash'].includes(kind)) await f.publish()
      else
        await writeFile(
          join(f.root, 'entry.import-coverage.json'),
          JSON.stringify(f.data)
        )
      if (kind === 'proof-hash')
        f.artifact.coverage.importRoles!.nativeMetadata.sha256 = '0'.repeat(64)
      if (kind === 'unlisted-sidecar')
        f.artifact.files = f.artifact.files.filter(
          (path) => !path.endsWith('.json')
        )
      if (kind === 'runtime')
        Object.assign(f.artifact.profile, { runtime: 'edge' })
      if (kind === 'bundler')
        Object.assign(f.artifact.profile, { bundler: 'webpack' })
      if (kind === 'profile')
        f.artifact.profile = { ...f.artifact.profile, environment: 'browser' }
      await expect(f.exclude()).rejects.toThrow(
        'Invalid native import coverage ownership'
      )
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it('rejects changed emitted bytes and late factory context reassignment', async () => {
    const f = await ownedImportFixture()
    try {
      await writeFile(join(f.root, 'entry.js'), f.options.code + ';')
      await expect(f.exclude()).rejects.toThrow(
        'Invalid native import coverage ownership'
      )
      await writeFile(join(f.root, 'entry.js'), f.options.code)
      const factory = f.options.ast.body[0].expression.elements[1]
      factory.body.body.push({
        type: 'ExpressionStatement',
        expression: {
          type: 'AssignmentExpression',
          left: { type: 'Identifier', name: '__turbopack_context__' },
          right: { type: 'Identifier', name: 'foreign' },
        },
      })
      await expect(f.exclude()).rejects.toThrow(
        'Invalid native import coverage ownership'
      )
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it('requires remaining statement descriptors and all V8 counters to stay exact', async () => {
    const f = await ownedImportFixture()
    try {
      const native = {
        start: { line: 1, column: 0 },
        end: { line: 1, column: Infinity },
      }
      const user = {
        start: { line: 2, column: 7 },
        end: { line: 2, column: 47 },
      }
      const before = {
        [f.file]: {
          path: f.file,
          statementMap: { 0: native, 1: user },
          s: { 0: 1, 1: 3 },
          fnMap: {},
          f: {},
          branchMap: {},
          b: {},
        },
      }
      const after = {
        [f.file]: { ...before[f.file], statementMap: { 0: user }, s: { 0: 3 } },
      }
      const roles = [{ file: f.file, start: native.start }]
      expect(() =>
        f.assertNativeImportExclusion(before, after, roles)
      ).not.toThrow()
      const changedCount = structuredClone(after)
      changedCount[f.file].s[0] = 4
      expect(() =>
        f.assertNativeImportExclusion(before, changedCount, roles)
      ).toThrow('Invalid native import coverage ownership')
      const changedFunction = structuredClone(after)
      changedFunction[f.file].f = { 0: 1 }
      expect(() =>
        f.assertNativeImportExclusion(before, changedFunction, roles)
      ).toThrow('Invalid native import coverage ownership')
      const ambiguous = structuredClone(before)
      ambiguous[f.file].statementMap[1] = native
      expect(() =>
        f.assertNativeImportExclusion(ambiguous, after, roles)
      ).toThrow('Invalid native import coverage ownership')
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  function importExclusionMetadata(file: string) {
    const native = {
      start: { line: 1, column: 0 },
      end: { line: 1, column: Infinity },
    }
    const used = {
      start: { line: 3, column: 2 },
      end: { line: 3, column: Infinity },
    }
    const unused = {
      start: { line: 6, column: 2 },
      end: { line: 6, column: Infinity },
    }
    const before: Record<string, StandardCoverageData> = {
      [file]: {
        path: file,
        statementMap: { 0: native, 1: used, 2: unused },
        s: { 0: 1, 1: 2, 2: 0 },
        fnMap: {},
        f: {},
        branchMap: {},
        b: {},
        meta: {
          lastStatement: 3,
          lastFunction: 0,
          lastBranch: 0,
          fnNames: new Map(),
          seen: {
            's:1:0:1:Infinity': 0,
            's:3:2:3:Infinity': 1,
            's:6:2:6:Infinity': 2,
            'retained-metadata': 7,
          },
        },
      },
    }
    const after: Record<string, StandardCoverageData> = {
      [file]: {
        ...before[file],
        statementMap: { 0: used, 1: unused },
        s: { 0: 2, 1: 0 },
        meta: {
          ...before[file].meta!,
          lastStatement: 2,
          fnNames: new Map<string, number>(),
          seen: { ...before[file].meta!.seen },
        },
      },
    }
    delete after[file].meta!.seen['s:1:0:1:Infinity']
    after[file].meta!.seen['s:3:2:3:Infinity'] = 0
    after[file].meta!.seen['s:6:2:6:Infinity'] = 1
    return { before, after, roles: [{ file, start: native.start }] }
  }

  it.each(['plain', 'null-prototype'])(
    'preserves raw Maps, Infinity and %s metadata while reindexing native exclusions',
    async (prototype) => {
      const f = await ownedImportFixture()
      try {
        const { before, after, roles } = importExclusionMetadata(f.file)
        if (prototype === 'null-prototype') {
          before[f.file].meta!.seen = Object.assign(
            Object.create(null),
            before[f.file].meta!.seen
          )
          after[f.file].meta!.seen = Object.assign(
            Object.create(null),
            after[f.file].meta!.seen
          )
        }
        const { serialize, deserialize } = await import('node:v8')
        const { isDeepStrictEqual } = await import('node:util')
        const initial = serialize({ before, after })
        const prototypes = [before, after].map((value) =>
          Object.getPrototypeOf(value[f.file].meta!.seen)
        )
        expect(() =>
          f.assertNativeImportExclusion(before, after, roles)
        ).not.toThrow()
        expect(
          isDeepStrictEqual(
            deserialize(serialize({ before, after })),
            deserialize(initial)
          )
        ).toBe(true)
        expect(
          [before, after].map((value) =>
            Object.getPrototypeOf(value[f.file].meta!.seen)
          )
        ).toEqual(prototypes)
        expect(after[f.file].meta!.fnNames).toBeInstanceOf(Map)
        expect(after[f.file].statementMap['0'].end.column).toBe(Infinity)
      } finally {
        await rm(f.root, { recursive: true, force: true })
      }
    }
  )

  it.each([
    'lastStatement',
    'lastFunction',
    'lastBranch',
    'function-name-map',
    'map-to-record',
    'deleted-nonstatement',
    'changed-nonstatement',
    'extra-nonstatement',
    'retained-removed-statement',
    'wrong-reindex',
    'missing-retained-statement',
    'extra-statement',
    'extra-counter',
    'swapped-descriptor-identifiers',
    'extra-metadata',
    'missing-metadata',
  ])('rejects changed native exclusion metadata: %s', async (kind) => {
    const f = await ownedImportFixture()
    try {
      const { before, after, roles } = importExclusionMetadata(f.file)
      const value = after[f.file],
        meta = value.meta!
      if (kind === 'lastStatement') meta.lastStatement++
      if (kind === 'lastFunction') meta.lastFunction++
      if (kind === 'lastBranch') meta.lastBranch++
      if (kind === 'function-name-map')
        (meta.fnNames as Map<string, number>).set('forged', 1)
      if (kind === 'map-to-record') meta.fnNames = {}
      if (kind === 'deleted-nonstatement') delete meta.seen['retained-metadata']
      if (kind === 'changed-nonstatement') meta.seen['retained-metadata']++
      if (kind === 'extra-nonstatement') meta.seen['foreign-metadata'] = 0
      if (kind === 'retained-removed-statement')
        meta.seen['s:1:0:1:Infinity'] = 0
      if (kind === 'wrong-reindex') meta.seen['s:6:2:6:Infinity'] = 2
      if (kind === 'missing-retained-statement')
        delete meta.seen['s:3:2:3:Infinity']
      if (kind === 'extra-statement') meta.seen['s:9:0:9:Infinity'] = 2
      if (kind === 'extra-counter') value.s['2'] = 0
      if (kind === 'swapped-descriptor-identifiers') {
        value.statementMap = {
          0: value.statementMap['1'],
          1: value.statementMap['0'],
        }
        value.s = { 0: value.s['1'], 1: value.s['0'] }
        meta.seen['s:3:2:3:Infinity'] = 1
        meta.seen['s:6:2:6:Infinity'] = 0
      }
      if (kind === 'extra-metadata') Object.assign(meta, { foreign: true })
      if (kind === 'missing-metadata') delete value.meta
      expect(() => f.assertNativeImportExclusion(before, after, roles)).toThrow(
        'Invalid native import coverage ownership'
      )
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })
})

async function configImportProofFixture() {
  const { writeConfigurationImportProof } = await import(
    'next/dist/experimental/testing/compiler/config-import-proof'
  )
  const owned = await typedCompilerAnalysisFixture()
  const configFile = join(owned.root, 'next.config.mjs'),
    helper = join(owned.root, 'helper.mjs'),
    configSource = "import './helper.mjs'; export default {}",
    helperSource = 'export const marker = 1'
  await writeFile(configFile, configSource)
  await writeFile(helper, helperSource)
  const request = { id: 'parent-module-request', configFile }
  const graph = {
    version: 1 as const,
    configFile,
    inputs: [
      { file: configFile, sha256: coverageHash(configSource) },
      { file: helper, sha256: coverageHash(helperSource) },
    ],
    imports: [
      {
        kind: 'module' as const,
        parent: configFile,
        request: './helper.mjs',
        target: helper,
      },
    ],
  }
  const reference = await writeConfigurationImportProof(
    owned.compiled.artifact,
    request,
    graph,
    new AbortController().signal
  )
  return {
    ...owned,
    graph,
    request,
    reference,
    helper,
    compiled: { ...owned.compiled, configurationImports: reference },
    expected: { ...owned.expected, configurationImports: request },
  }
}

it('binds actual config module-file facts to the parent source request without changing declaration descriptors', async () => {
  const { analyzeCompiledCoverageSource } = await import(
    'next/dist/experimental/testing/coverage/source-analysis'
  )
  const owned = await configImportProofFixture()
  try {
    const fact = await analyzeCompiledCoverageSource(
      owned.compiled,
      owned.expected,
      new AbortController().signal
    )
    expect(fact.compiler.configurationImports).toEqual({
      request: owned.request,
      graph: owned.graph,
    })
    expect(fact.data.f).toEqual({ 0: 0 })
    expect(fact.data.s).toEqual({ 0: 0 })
    await writeFile(owned.helper, 'export const marker = 2')
    await expect(
      analyzeCompiledCoverageSource(
        owned.compiled,
        owned.expected,
        new AbortController().signal
      )
    ).rejects.toThrow(
      'Next config imported module changed after its actual load'
    )
  } finally {
    await rm(owned.root, { recursive: true, force: true })
  }
})

it.each([
  'request',
  'selection',
  'revision',
  'profile',
  'root',
  'source',
  'entry',
  'extra',
  'bytes',
  'missing',
  'unrequested',
] as const)(
  'refuses borrowed config import sidecars without parent %s binding',
  async (field) => {
    const { readConfigurationImportProof } = await import(
      'next/dist/experimental/testing/compiler/config-import-proof'
    )
    const owned = await configImportProofFixture()
    try {
      const artifact = structuredClone(owned.compiled.artifact)
      let reference: typeof owned.reference | undefined = { ...owned.reference }
      let request: typeof owned.request | undefined = { ...owned.request }
      const file = join(owned.root, reference.path)
      const value = JSON.parse(await readFile(file, 'utf8'))
      if (field === 'request') value.request.id = 'another-parent'
      else if (field === 'selection') value.request.configFile = owned.helper
      else if (field === 'revision') value.revision = 'another-revision'
      else if (field === 'profile') value.profile.id = 'another-profile'
      else if (field === 'root')
        value.artifactRoot = join(owned.root, 'another-root')
      else if (field === 'source') value.sourceHash = '0'.repeat(64)
      else if (field === 'entry') value.entryId = 'another-entry'
      else if (field === 'extra') value.completeEffectiveInputs = true
      else if (field === 'missing') reference = undefined
      else if (field === 'unrequested') request = undefined
      await writeFile(file, JSON.stringify(value))
      if (reference && field !== 'bytes')
        reference.sha256 = coverageHash(JSON.stringify(value))
      if (field === 'bytes') await writeFile(file, '\n', { flag: 'a' })
      await expect(
        readConfigurationImportProof(
          artifact,
          reference,
          request,
          new AbortController().signal
        )
      ).rejects.toThrow(
        field === 'bytes'
          ? 'proof bytes changed'
          : field === 'missing'
            ? 'Missing or incompatible'
            : field === 'unrequested'
              ? 'Unrequested'
              : 'lacks parent authorization'
      )
    } finally {
      await rm(owned.root, { recursive: true, force: true })
    }
  }
)

it.each([
  'package',
  'extensionless',
  'unrelated',
  'missing-target',
  'duplicate',
  'kind',
  'symbolic',
] as const)(
  'rejects uncertified config module graph identities: %s',
  async (field) => {
    const { assertConfigurationImportFiles } = await import(
      'next/dist/experimental/testing/compiler/config-import-facts'
    )
    const owned = await configImportProofFixture()
    try {
      const graph = structuredClone(owned.graph)
      if (field === 'package') graph.imports[0].request = 'helper'
      else if (field === 'extensionless') graph.imports[0].request = './helper'
      else if (field === 'unrelated') graph.imports = []
      else if (field === 'missing-target') graph.inputs.pop()
      else if (field === 'duplicate')
        graph.imports.push({ ...graph.imports[0] })
      else if (field === 'kind') (graph.imports[0] as any).kind = 'invented'
      else {
        const { symlink } = await import('fs/promises')
        const other = join(owned.root, 'other.mjs')
        await writeFile(other, 'export const marker = 1')
        await rm(owned.helper)
        await symlink(other, owned.helper)
      }
      await expect(
        assertConfigurationImportFiles(
          graph,
          owned.request.configFile,
          new AbortController().signal
        )
      ).rejects.toThrow(/Next config/)
    } finally {
      await rm(owned.root, { recursive: true, force: true })
    }
  }
)

it.each(['before', 'after'] as const)(
  'rechecks every selected profile config module graph %s the publication rename',
  async (when) => {
    const { publishStandardCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-standard'
    )
    const fs = require('fs/promises') as typeof import('fs/promises')
    const owned = await compilerSourcePlanFixture()
    try {
      const helper = join(owned.root, 'helper.mjs'),
        helperSource = 'export const marker = 1'
      await writeFile(helper, helperSource)
      // Only the second profile loads this helper. Deduping identical declaration
      // descriptors must not discard its independent config import fence.
      const graph = owned.facts[1].compiler.configurationImports.graph
      graph.inputs.push({ file: helper, sha256: coverageHash(helperSource) })
      graph.imports.push({
        kind: 'module',
        parent: graph.configFile,
        request: './helper.mjs',
        target: helper,
      })
      const options = {
        projectDir: owned.root,
        config: owned.config,
        facts: [],
        expected: new Set<string>(),
        excludedFiles: [],
        status: 'passed' as const,
        sourceAnalysis: { facts: owned.facts, plan: owned.plan },
      }
      await publishStandardCoverage(options)
      const report = join(owned.root, 'coverage/coverage-final.json'),
        previous = await readFile(report, 'utf8')
      if (when === 'before') await writeFile(helper, 'export const marker = 2')
      else {
        const originalRename = fs.rename
        let mutated = false
        jest.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
          await originalRename(from, to)
          if (!mutated && to === join(owned.root, 'coverage')) {
            mutated = true
            await writeFile(helper, 'export const marker = 2')
          }
        })
      }
      await expect(publishStandardCoverage(options)).rejects.toThrow(
        'Next config imported module changed after its actual load'
      )
      expect(await readFile(report, 'utf8')).toBe(previous)
    } finally {
      jest.restoreAllMocks()
      await rm(owned.root, { recursive: true, force: true })
    }
  }
)

async function runtimeConfigurationFixture() {
  const { createRuntimeConfigurationPlan } = await import(
    'next/dist/experimental/testing/coverage/runtime-configuration'
  )
  const { writeRuntimeConfigurationImportProof } = await import(
    'next/dist/experimental/testing/compiler/runtime-config-proof'
  )
  const f = await fixture()
  const configFile = join(f.root, 'next.config.mjs'),
    helper = join(f.root, 'compiler-helper.mjs')
  const configSource = "import './compiler-helper.mjs'; export default {}",
    helperSource = 'export const marker = 1'
  await writeFile(configFile, configSource)
  await writeFile(helper, helperSource)
  const plan = await createRuntimeConfigurationPlan({
    projectDir: f.root,
    projects: [
      {
        profile: { ...profile },
        entries: [
          {
            id: f.artifact.entryId,
            file: join(f.root, 'entry.test.ts'),
            profile: { ...profile },
          },
        ],
      },
    ],
    signal: new AbortController().signal,
  })
  const request = plan.requests[0],
    entry = request.entries[0]
  f.artifact.profile = { ...profile }
  f.artifact.sourceHash = entry.sha256
  f.artifact.revision = entry.revision
  const graph = {
    version: 1 as const,
    configFile,
    inputs: [
      { file: configFile, sha256: coverageHash(configSource) },
      { file: helper, sha256: coverageHash(helperSource) },
    ],
    imports: [
      {
        kind: 'module' as const,
        parent: configFile,
        request: './compiler-helper.mjs',
        target: helper,
      },
    ],
  }
  f.artifact.runtimeConfigurationImports =
    await writeRuntimeConfigurationImportProof(
      f.artifact,
      request.authorization,
      entry,
      graph,
      new AbortController().signal
    )
  return {
    ...f,
    plan,
    request,
    entry,
    graph,
    helper,
    fact: { entryId: f.artifact.entryId, revision: f.artifact.revision },
  }
}

it('seals a distinct parent runtime config receipt only after its original artifact lease is rechecked', async () => {
  const {
    prepareRuntimeConfigurationReceipt,
    assertRuntimeConfigurationReceipts,
    createRuntimeConfigurationPlan,
  } = await import(
    'next/dist/experimental/testing/coverage/runtime-configuration'
  )
  const f = await runtimeConfigurationFixture()
  try {
    const signal = new AbortController().signal
    const pending = await prepareRuntimeConfigurationReceipt({
      artifact: f.artifact,
      plan: f.plan,
      artifactRoot: f.root,
      signal,
    })
    expect(pending.inputs.sort()).toEqual(
      f.graph.inputs.map((input) => input.file).sort()
    )
    const receipt = await pending.seal()
    expect(receipt.compiler).toEqual({
      entryId: f.fact.entryId,
      revision: f.fact.revision,
      rootDir: f.root,
    })
    expect(receipt.authority.authorization).toEqual(f.request.authorization)
    expect(receipt.graph).toEqual(f.graph)
    await expect(pending.seal()).rejects.toThrow('already sealed')
    await expect(
      assertRuntimeConfigurationReceipts({
        receipts: [receipt],
        facts: [f.fact],
        plan: f.plan,
        signal,
      })
    ).resolves.toBeUndefined()
    const next = await createRuntimeConfigurationPlan({
      projectDir: f.root,
      projects: [
        {
          profile: { ...profile },
          entries: [
            { id: f.entry.id, file: f.entry.file, profile: { ...profile } },
          ],
        },
      ],
      signal,
    })
    expect(next.requests[0].authorization.id).not.toBe(
      f.request.authorization.id
    )
    await expect(
      assertRuntimeConfigurationReceipts({
        receipts: [receipt],
        facts: [f.fact],
        plan: next,
        signal,
      })
    ).rejects.toThrow('Unrequested or incompatible')
    expect(receipt.authority.authorization.id).toBe(f.request.authorization.id)
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it.each(['before', 'during', 'after'] as const)(
  'vetoes runtime config helper mutation %s the worker lease',
  async (when) => {
    const {
      prepareRuntimeConfigurationReceipt,
      assertRuntimeConfigurationReceipts,
    } = await import(
      'next/dist/experimental/testing/coverage/runtime-configuration'
    )
    const f = await runtimeConfigurationFixture(),
      signal = new AbortController().signal
    try {
      if (when === 'before')
        await writeFile(f.helper, 'export const marker = 2')
      const prepare = () =>
        prepareRuntimeConfigurationReceipt({
          artifact: f.artifact,
          plan: f.plan,
          artifactRoot: f.root,
          signal,
        })
      if (when === 'before')
        await expect(prepare()).rejects.toThrow('changed after its actual load')
      else {
        const pending = await prepare()
        if (when === 'during') {
          await writeFile(f.helper, 'export const marker = 2')
          await expect(pending.seal()).rejects.toThrow(
            'changed after its actual load'
          )
        } else {
          const receipt = await pending.seal()
          await writeFile(f.helper, 'export const marker = 2')
          await expect(
            assertRuntimeConfigurationReceipts({
              receipts: [receipt],
              facts: [f.fact],
              plan: f.plan,
              signal,
            })
          ).rejects.toThrow('changed after its actual load')
        }
      }
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  }
)

it.each([
  'request',
  'profile',
  'root',
  'entry',
  'source',
  'revision',
  'role',
  'bytes',
  'missing',
] as const)('refuses an unowned runtime config %s proof', async (field) => {
  const { prepareRuntimeConfigurationReceipt } = await import(
    'next/dist/experimental/testing/coverage/runtime-configuration'
  )
  const f = await runtimeConfigurationFixture(),
    signal = new AbortController().signal
  try {
    let artifactRoot = f.root
    const reference = f.artifact.runtimeConfigurationImports!
    const path = join(f.root, reference.path)
    const value = JSON.parse(await readFile(path, 'utf8'))
    if (field === 'request') value.request.id = 'another-request'
    else if (field === 'profile') value.profile.id = 'another-profile'
    else if (field === 'root') artifactRoot = join(f.root, 'unowned')
    else if (field === 'entry') value.entryId = 'another-entry'
    else if (field === 'source') value.source.file = f.subject
    else if (field === 'revision') value.revision = 'unowned-revision'
    else if (field === 'role') value.kind = 'next-config-module-imports'
    else if (field === 'missing') delete f.artifact.runtimeConfigurationImports
    await writeFile(path, JSON.stringify(value))
    if (field !== 'bytes')
      reference.sha256 = coverageHash(JSON.stringify(value))
    else await writeFile(path, '\n', { flag: 'a' })
    await expect(
      prepareRuntimeConfigurationReceipt({
        artifact: f.artifact,
        plan: f.plan,
        artifactRoot,
        signal,
      })
    ).rejects.toThrow(
      field === 'root'
        ? 'parent artifact lease'
        : field === 'bytes'
          ? 'proof bytes changed'
          : field === 'missing'
            ? 'Missing or incompatible'
            : 'lacks parent authorization'
    )
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it('keeps source and runtime config proof roles mutually exclusive', async () => {
  const {
    readRuntimeConfigurationImportProof,
    writeRuntimeConfigurationImportProof,
  } = await import(
    'next/dist/experimental/testing/compiler/runtime-config-proof'
  )
  const { readConfigurationImportProof } = await import(
    'next/dist/experimental/testing/compiler/config-import-proof'
  )
  const f = await runtimeConfigurationFixture(),
    signal = new AbortController().signal
  try {
    await expect(
      readConfigurationImportProof(
        f.artifact,
        f.artifact.runtimeConfigurationImports,
        f.request.authorization,
        signal
      )
    ).rejects.toThrow('Missing or incompatible')
    f.artifact.coverage.sourceAnalysis = {
      version: 1,
      file: f.entry.file,
      sha256: f.entry.sha256,
    }
    await expect(
      readRuntimeConfigurationImportProof(
        f.artifact,
        f.artifact.runtimeConfigurationImports,
        f.request.authorization,
        f.entry,
        signal
      )
    ).rejects.toThrow('require a runtime coverage artifact')
    await expect(
      writeRuntimeConfigurationImportProof(
        f.artifact,
        f.request.authorization,
        f.entry,
        f.graph,
        signal
      )
    ).rejects.toThrow('require a runtime coverage artifact')
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it('authorizes runtime module inputs independently from empty source expansion without inventing empty-entry compiler work', async () => {
  const { createRuntimeConfigurationPlan } = await import(
    'next/dist/experimental/testing/coverage/runtime-configuration'
  )
  const { createCoverageSourcePlan } = await import(
    'next/dist/experimental/testing/coverage/source-analysis-plan'
  )
  const f = await runtimeConfigurationFixture(),
    signal = new AbortController().signal
  try {
    const source = await createCoverageSourcePlan({
      projectDir: f.root,
      projects: [],
      config: {
        reporter: ['json'],
        include: ['subject.ts'],
        exclude: [],
        reportsDirectory: 'coverage',
        reportOnFailure: false,
        thresholds: {},
      },
      includeUnimported: false,
      signal,
    })
    expect(source.requests).toEqual([])
    expect(f.plan.requests).toHaveLength(1)
    const empty = await createRuntimeConfigurationPlan({
      projectDir: f.root,
      projects: [{ profile: { ...profile }, entries: [] }],
      signal,
    })
    expect(empty).toEqual({
      version: 1,
      projectDir: f.root,
      requests: [],
      configuration: [],
      inputs: [],
    })
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it.each([
  false,
  true,
  null,
  {},
  { version: 1 },
  { version: 2, assertLease() {} },
  { version: 1, assertLease: 'child payload' },
  { version: 1, assertLease() {}, extra: true },
  { version: 1, assertLease() {}, [Symbol('foreign')]: true },
])(
  'rejects a foreign private compiler syntax authorization: %p',
  async (permission) => {
    const { analyzeCompiledCoverageSource } = await import(
      'next/dist/experimental/testing/coverage/source-analysis'
    )
    const owned = await typedCompilerAnalysisFixture()
    try {
      await expect(
        analyzeCompiledCoverageSource(
          owned.compiled,
          { ...owned.expected, nativeImportCoverageRoles: permission as any },
          new AbortController().signal
        )
      ).rejects.toThrow('Invalid private native import coverage authorization')
    } finally {
      await rm(owned.root, { recursive: true, force: true })
    }
  }
)

it('rejects unrequested native metadata before excluding it from source analysis comparison', async () => {
  const { analyzeCompiledCoverageSource } = await import(
    'next/dist/experimental/testing/coverage/source-analysis'
  )
  const owned = await typedCompilerAnalysisFixture()
  try {
    owned.compiled.artifact.coverage!.importRoles = {
      version: 1,
      nativeMetadata: {
        path: 'entry.import-coverage.json',
        sha256: '0'.repeat(64),
      },
    }
    await expect(
      analyzeCompiledCoverageSource(
        owned.compiled,
        owned.expected,
        new AbortController().signal
      )
    ).rejects.toThrow(
      'Unrequested or incompatible compiler coverage source analysis'
    )
  } finally {
    await rm(owned.root, { recursive: true, force: true })
  }
})

it('checks the actual parent lease before any private source artifact read', async () => {
  const { analyzeCompiledCoverageSource } = await import(
    'next/dist/experimental/testing/coverage/source-analysis'
  )
  const owned = await typedCompilerAnalysisFixture()
  try {
    await rm(owned.root, { recursive: true, force: true })
    await expect(
      analyzeCompiledCoverageSource(
        owned.compiled,
        {
          ...owned.expected,
          nativeImportCoverageRoles: {
            version: 1,
            assertLease() {
              throw new Error('private source lease closed')
            },
          },
        },
        new AbortController().signal
      )
    ).rejects.toThrow('private source lease closed')
  } finally {
    await rm(owned.root, { recursive: true, force: true })
  }
})

it.each([async () => undefined, () => true])(
  'rejects a private lease callback that returns a value: %p',
  async (assertLease) => {
    const { analyzeCompiledCoverageSource } = await import(
      'next/dist/experimental/testing/coverage/source-analysis'
    )
    const owned = await typedCompilerAnalysisFixture()
    const callback = jest.fn(() => assertLease())
    try {
      await expect(
        analyzeCompiledCoverageSource(
          owned.compiled,
          {
            ...owned.expected,
            nativeImportCoverageRoles: { version: 1, assertLease: callback },
          },
          new AbortController().signal
        )
      ).rejects.toThrow('lease must return synchronously with undefined')
      expect(callback).toHaveBeenCalledTimes(1)
    } finally {
      await rm(owned.root, { recursive: true, force: true })
    }
  }
)

/** Component-only sidecar fixture; actual native producer qualification is separate. */
async function runtimeAuthorizationFixture() {
  const owned = await actualTypeScriptCapture(
    'type Identity<T> = T\nfunction typed<T>(value: T): T {\n  return value\n}\n',
    true
  )
  const fs = await import('fs/promises')
  const { readImportCoverageProof } = await import(
    'next/dist/experimental/testing/coverage/import-roles'
  )
  const artifact = owned.artifact
  const entryPath = `server/next-test/${coverageHash(artifact.entryId)}.js`
  await fs.mkdir(join(owned.root, 'server/next-test'), { recursive: true })
  await fs.rename(join(owned.root, 'entry.js'), join(owned.root, entryPath))
  await fs.rename(
    join(owned.root, 'entry.js.map'),
    join(owned.root, entryPath + '.map')
  )
  artifact.entryPath = entryPath
  artifact.sourceHash = coverageHash('')
  artifact.files = [
    entryPath,
    entryPath + '.map',
    entryPath.replace(/\.js$/, '.import-coverage.json'),
  ]
  artifact.coverage!.scripts[0].path = entryPath
  artifact.coverage!.scripts[0].mapPath = entryPath + '.map'
  owned.capture.scripts[0].path = entryPath
  const sidecarPath = artifact.files[2]
  await writeFile(
    join(owned.root, sidecarPath),
    JSON.stringify({
      version: 1,
      kind: 'native-import-initializer-coverage',
      mode: 'development',
      entryPath,
      scripts: [],
    })
  )
  artifact.coverage!.importRoles = await readImportCoverageProof(
    owned.root,
    entryPath,
    artifact.files,
    profile.mode
  )
  const expected = {
    projectDir: owned.root,
    artifactRoot: owned.root,
    revision: artifact.revision,
    runId: 'parent-run',
    entry: {
      id: artifact.entryId,
      file: join(owned.root, 'entry.test.mjs'),
      profile: { ...profile },
    },
    entrySha256: coverageHash(''),
    selectedSources: [
      {
        file: owned.subject,
        sha256: coverageHash(await readFile(owned.subject)),
      },
    ],
    runtimeJSX: { version: 1 as const, assertLease() {} },
  }
  const completion = {
    version: 1 as const,
    runId: expected.runId,
    entryId: artifact.entryId,
    revision: artifact.revision,
    complete: true as const,
    data: owned.capture,
  }
  return {
    ...owned,
    expected,
    completion,
    signal: new AbortController().signal,
  }
}

it('keeps a private runtime completion separate from source analysis while retaining genuine V8 hits', async () => {
  const { remapCompilerRuntimeCoverage, remapStandardCoverage } = await import(
    'next/dist/experimental/testing/coverage/istanbul'
  )
  const f = await runtimeAuthorizationFixture()
  try {
    const before = await remapStandardCoverage(f.artifact, f.capture)
    const result = await remapCompilerRuntimeCoverage(
      f.artifact,
      f.completion,
      f.expected,
      f.signal
    )
    const { isDeepStrictEqual } = await import('util')
    expect(isDeepStrictEqual(result, before)).toBe(true)
    expect(Object.values(result.files[0].data.f)).toContain(1)
    expect(Object.values(result.files[0].data.s)).toContain(1)
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it.each([
  undefined,
  false,
  true,
  null,
  {},
  { version: 1 },
  { version: 2, assertLease() {} },
  { version: 1, assertLease: 'child payload' },
  { version: 1, assertLease() {}, extra: true },
  { version: 1, assertLease() {}, [Symbol('foreign')]: true },
])(
  'refuses a foreign runtime JSX capability before reads: %p',
  async (runtimeJSX) => {
    const { remapCompilerRuntimeCoverage } = await import(
      'next/dist/experimental/testing/coverage/istanbul'
    )
    const f = await runtimeAuthorizationFixture()
    try {
      await rm(f.root, { recursive: true, force: true })
      await expect(
        remapCompilerRuntimeCoverage(
          f.artifact,
          f.completion,
          { ...f.expected, runtimeJSX: runtimeJSX as any },
          f.signal
        )
      ).rejects.toThrow('Invalid private runtime JSX authorization')
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  }
)

it.each([async () => undefined, () => true])(
  'refuses non-synchronous runtime lease acknowledgement: %p',
  async (callback) => {
    const { remapCompilerRuntimeCoverage } = await import(
      'next/dist/experimental/testing/coverage/istanbul'
    )
    const f = await runtimeAuthorizationFixture()
    try {
      await expect(
        remapCompilerRuntimeCoverage(
          f.artifact,
          f.completion,
          {
            ...f.expected,
            runtimeJSX: { version: 1, assertLease: callback as any },
          },
          f.signal
        )
      ).rejects.toThrow('lease must return synchronously with undefined')
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  }
)

it.each([
  'runId',
  'entryId',
  'revision',
  'incomplete',
  'browser capture',
  'script hash',
  'missing entry capture',
  'source analysis',
  'synthetic sources',
  'browser artifact',
  'moduleMocking',
  'moduleCache',
  'dynamicModuleMocking',
  'cohort',
  'configurationImports',
  'runtimeConfigurationImports',
  'setupFiles',
  'snapshotSerializers',
  'profile',
  'root',
  'source hash',
  'entry source hash',
  'duplicate source',
  'foreign source',
  'source omitted from metadata',
  'forged imports',
  'missing imports',
  'production proof in development',
  'unrequested metadata',
])('refuses unowned private runtime facts: %s', async (mutation) => {
  const { remapCompilerRuntimeCoverage } = await import(
    'next/dist/experimental/testing/coverage/istanbul'
  )
  const f = await runtimeAuthorizationFixture()
  try {
    const artifact = f.artifact as any,
      expected = f.expected as any,
      completion = f.completion as any
    if (['runId', 'entryId', 'revision'].includes(mutation))
      completion[mutation] = 'foreign'
    if (mutation === 'incomplete') {
      completion.complete = false
      delete completion.data
      completion.error = { message: 'incomplete' }
    }
    if (mutation === 'browser capture') completion.data.kind = 'browser-cdp'
    if (mutation === 'script hash')
      completion.data.scripts[0].sha256 = '0'.repeat(64)
    if (mutation === 'missing entry capture') completion.data.scripts = []
    if (mutation === 'source analysis')
      artifact.coverage.sourceAnalysis = {
        version: 1,
        ...expected.selectedSources[0],
      }
    if (mutation === 'synthetic sources')
      artifact.coverage.syntheticSources = {}
    if (mutation === 'browser artifact') artifact.coverage.browser = {}
    if (
      [
        'moduleMocking',
        'moduleCache',
        'dynamicModuleMocking',
        'cohort',
        'configurationImports',
        'runtimeConfigurationImports',
      ].includes(mutation)
    )
      artifact[mutation] = {}
    if (['setupFiles', 'snapshotSerializers'].includes(mutation))
      artifact[mutation] = [f.subject]
    if (mutation === 'profile') expected.entry.profile.mode = 'production'
    if (mutation === 'root') expected.artifactRoot = join(f.root, 'foreign')
    if (mutation === 'source hash')
      expected.selectedSources[0].sha256 = '0'.repeat(64)
    if (mutation === 'entry source hash') expected.entrySha256 = '0'.repeat(64)
    if (mutation === 'duplicate source')
      expected.selectedSources.push({ ...expected.selectedSources[0] })
    if (mutation === 'foreign source')
      expected.selectedSources[0].file = join(f.root, '../foreign.ts')
    if (mutation === 'source omitted from metadata')
      delete artifact.coverage.sources[pathToFileURL(f.subject).href]
    if (mutation === 'forged imports')
      artifact.coverage.importRoles.nativeMetadata.sha256 = '0'.repeat(64)
    if (mutation === 'missing imports') delete artifact.coverage.importRoles
    if (mutation === 'production proof in development')
      artifact.coverage.sourcePreservation = {}
    if (mutation === 'unrequested metadata') artifact.coverage.extra = {}
    await expect(
      remapCompilerRuntimeCoverage(artifact, completion, expected, f.signal)
    ).rejects.toThrow()
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it.each([
  'entry bytes',
  'selected source bytes',
  'output bytes',
  'map bytes',
  'native sidecar bytes',
  'cancel',
  'lease closed',
])(
  'rechecks provenance and lease after awaited genuine runtime conversion: %s',
  async (mutation) => {
    const f = await runtimeAuthorizationFixture()
    const converter = jest.requireActual(
      'next/dist/compiled/next-test-coverage'
    )
    const controller = new AbortController()
    let mutated = false,
      revoked = false
    const scriptPath = join(f.root, f.artifact.entryPath)
    const callback = jest.fn(() => {
      if (revoked) throw new Error('runtime lease closed')
    })
    try {
      await jest.isolateModulesAsync(async () => {
        jest.doMock('next/dist/compiled/next-test-coverage', () => ({
          ...converter,
          async convert(input: any) {
            const result = await converter.convert(input)
            if (
              !mutated &&
              input.coverage.url === pathToFileURL(scriptPath).href
            ) {
              mutated = true
              if (mutation === 'entry bytes')
                await writeFile(f.expected.entry.file, '// changed')
              if (mutation === 'selected source bytes')
                await writeFile(f.subject, '// changed')
              if (mutation === 'output bytes')
                await writeFile(scriptPath, '// changed')
              if (mutation === 'map bytes')
                await writeFile(scriptPath + '.map', '{}')
              if (mutation === 'native sidecar bytes')
                await writeFile(
                  join(
                    f.root,
                    f.artifact.coverage!.importRoles!.nativeMetadata.path
                  ),
                  '{}'
                )
              if (mutation === 'cancel')
                controller.abort(new Error('runtime cancelled'))
              if (mutation === 'lease closed') revoked = true
            }
            return result
          },
        }))
        const { remapCompilerRuntimeCoverage } = await import(
          'next/dist/experimental/testing/coverage/istanbul'
        )
        await expect(
          remapCompilerRuntimeCoverage(
            f.artifact,
            f.completion,
            {
              ...f.expected,
              runtimeJSX: { version: 1, assertLease: callback },
            },
            controller.signal
          )
        ).rejects.toThrow()
      })
      expect(mutated).toBe(true)
      expect(callback).toHaveBeenCalled()
    } finally {
      jest.dontMock('next/dist/compiled/next-test-coverage')
      await rm(f.root, { recursive: true, force: true })
    }
  }
)

it('refuses accessor capability fields without invoking them', async () => {
  const { remapCompilerRuntimeCoverage } = await import(
    'next/dist/experimental/testing/coverage/istanbul'
  )
  const f = await runtimeAuthorizationFixture()
  let calls = 0
  const runtimeJSX = Object.defineProperty({ assertLease() {} }, 'version', {
    get() {
      calls++
      throw new Error('foreign accessor')
    },
    enumerable: true,
  })
  try {
    await expect(
      remapCompilerRuntimeCoverage(
        f.artifact,
        f.completion,
        { ...f.expected, runtimeJSX: runtimeJSX as any },
        f.signal
      )
    ).rejects.toThrow('Invalid private runtime JSX authorization')
    expect(calls).toBe(0)
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it.each([
  'source selection',
  'selected hash',
  'entry profile',
  'entry identity',
  'entry file',
  'revision',
  'run identity',
  'completion counters',
  'artifact source hash',
  'capability replacement',
  'capability object with same callback',
  'capability callback',
  'capability descriptor',
  'capability getter',
])(
  'retains the original parent runtime authority across genuine conversion: %s',
  async (mutation) => {
    const f = await runtimeAuthorizationFixture()
    const converter = jest.requireActual(
      'next/dist/compiled/next-test-coverage'
    )
    let mutated = false
    const scriptPath = join(f.root, f.artifact.entryPath)
    try {
      await jest.isolateModulesAsync(async () => {
        jest.doMock('next/dist/compiled/next-test-coverage', () => ({
          ...converter,
          async convert(input: any) {
            const result = await converter.convert(input)
            if (
              !mutated &&
              input.coverage.url === pathToFileURL(scriptPath).href
            ) {
              mutated = true
              if (mutation === 'source selection')
                f.expected.selectedSources = []
              if (mutation === 'selected hash')
                f.expected.selectedSources[0].sha256 = '0'.repeat(64)
              if (mutation === 'entry profile') {
                ;(f.expected.entry.profile as { id: string }).id = 'foreign'
                f.artifact.profile = { ...f.artifact.profile, id: 'foreign' }
              }
              if (mutation === 'entry identity') {
                f.expected.entry.id = 'foreign'
                f.artifact.entryId = 'foreign'
                f.completion.entryId = 'foreign'
              }
              if (mutation === 'entry file') {
                const file = join(f.root, 'other.test.mjs')
                await writeFile(file, '')
                f.expected.entry.file = file
              }
              if (mutation === 'revision') {
                f.expected.revision = 'foreign'
                f.artifact.revision = 'foreign'
                f.completion.revision = 'foreign'
              }
              if (mutation === 'run identity') {
                f.expected.runId = 'foreign'
                f.completion.runId = 'foreign'
              }
              if (mutation === 'completion counters')
                f.completion.data.scripts[0].functions[0].ranges[0].count++
              if (mutation === 'artifact source hash') {
                f.artifact.sourceHash = '0'.repeat(64)
                f.expected.entrySha256 = '0'.repeat(64)
              }
              if (mutation === 'capability replacement')
                f.expected.runtimeJSX = { version: 1, assertLease() {} }
              if (mutation === 'capability object with same callback')
                f.expected.runtimeJSX = { ...f.expected.runtimeJSX }
              if (mutation === 'capability callback')
                f.expected.runtimeJSX.assertLease = () => {}
              if (mutation === 'capability descriptor')
                Object.defineProperty(f.expected.runtimeJSX, 'assertLease', {
                  enumerable: false,
                })
              if (mutation === 'capability getter')
                Object.defineProperty(f.expected, 'runtimeJSX', {
                  get() {
                    throw new Error('replacement getter must not run')
                  },
                })
            }
            return result
          },
        }))
        const { remapCompilerRuntimeCoverage } = await import(
          'next/dist/experimental/testing/coverage/istanbul'
        )
        await expect(
          remapCompilerRuntimeCoverage(
            f.artifact,
            f.completion,
            f.expected,
            f.signal
          )
        ).rejects.toThrow(
          'Parent runtime coverage authorization changed during conversion'
        )
      })
      expect(mutated).toBe(true)
    } finally {
      jest.dontMock('next/dist/compiled/next-test-coverage')
      await rm(f.root, { recursive: true, force: true })
    }
  }
)

it('reads the parent runtime capability getter once and retains its exact first value', async () => {
  const { remapCompilerRuntimeCoverage } = await import(
    'next/dist/experimental/testing/coverage/istanbul'
  )
  const f = await runtimeAuthorizationFixture(),
    capability = f.expected.runtimeJSX
  let calls = 0
  Object.defineProperty(f.expected, 'runtimeJSX', {
    get() {
      calls++
      return capability
    },
    enumerable: true,
    configurable: true,
  })
  try {
    const result = await remapCompilerRuntimeCoverage(
      f.artifact,
      f.completion,
      f.expected,
      f.signal
    )
    expect(result.files[0].data.f).toEqual({ 0: 1 })
    expect(calls).toBe(1)
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it('refuses capability getter mutation against the entry snapshot without invoking it again', async () => {
  const { remapCompilerRuntimeCoverage } = await import(
    'next/dist/experimental/testing/coverage/istanbul'
  )
  const f = await runtimeAuthorizationFixture(),
    capability = f.expected.runtimeJSX
  let calls = 0
  Object.defineProperty(f.expected, 'runtimeJSX', {
    get() {
      calls++
      f.expected.selectedSources = []
      return capability
    },
    enumerable: true,
    configurable: true,
  })
  try {
    await expect(
      remapCompilerRuntimeCoverage(
        f.artifact,
        f.completion,
        f.expected,
        f.signal
      )
    ).rejects.toThrow(
      'Parent runtime coverage authorization changed during conversion'
    )
    expect(calls).toBe(1)
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

// These controls exercise a private schema/lifecycle boundary. Historical native
// bytes do not re-create their disposed issuer; synthetic callbacks below model
// the trusted parent interface and never qualify actual native publication.
describe('private native TypeScript config input reader', () => {
  async function schemaReader() {
    return import(
      'next/dist/experimental/testing/coverage/native-tsconfig-inputs'
    )
  }

  it.each(['development', 'production'] as const)(
    'replays genuine historical %s producer schema without granting a live issuer',
    async (mode) => {
      const {
        validateNativeTsConfigInputsSchema,
        assertParentNativeTsConfigFact,
      } = await schemaReader()
      const native = JSON.parse(
        await readFile(
          join(__dirname, 'fixtures/native-tsconfig', `${mode}.native.txt`),
          'utf8'
        )
      )
      const expected = {
        version: 1 as const,
        role: 'runtime' as const,
        id: 'historical-schema-only',
        revision: native.revision,
        profile: { ...profile, mode },
        source: {
          id: 'historical-schema-only',
          file: join(native.projectPath.path, native.entryFile),
          sha256: '0'.repeat(64),
        },
        native: {
          entryId: native.entryId,
          entryFile: native.entryFile,
          entryPath: native.entryPath,
          sourceCoverage: native.sourceCoverage,
          filesystemRoot: native.filesystemRoot,
          projectPath: native.projectPath,
        },
      }
      const parsed = validateNativeTsConfigInputsSchema(native, expected)
      expect(parsed.records).toHaveLength(137)
      expect(
        new Set(parsed.records.map((record) => record.context.consumer))
      ).toEqual(new Set(['typescript', 'decorators', 'jsx', 'aliases']))
      expect(parsed).toBe(native)
      await expect(
        assertParentNativeTsConfigFact({
          fact: {
            version: 1,
            kind: 'next-parent-native-tsconfig-inputs',
            request: expected,
            compiler: {
              entryId: 'historical-schema-only',
              revision: native.revision,
              rootDir: native.projectPath.path,
            },
            reference: {
              version: 1,
              nativeMetadata: {
                path: native.entryPath.replace(
                  /\.js$/,
                  '.tsconfig-inputs.json'
                ),
                sha256: '0'.repeat(64),
              },
            },
            native,
          } as any,
          expected,
          signal: new AbortController().signal,
        })
      ).rejects.toThrow('original issuer/request')
    }
  )

  async function syntheticLifecycle(
    role: 'runtime' | 'compiler-source' = 'runtime'
  ) {
    const { mkdtemp, mkdir, realpath } = await import('node:fs/promises')
    const root = await realpath(
      await mkdtemp('/private/tmp/next-native-config-lifecycle-')
    )
    const artifactRoot = join(root, 'artifact')
    const sourceFile = join(root, 'subject.ts'),
      config = join(root, 'config.json'),
      absent = join(root, 'future.json')
    await mkdir(artifactRoot)
    await writeFile(sourceFile, 'export const value = 1\n')
    await writeFile(config, '{}\n')
    const pathValue = (file: string) => ({
      nativePath: file.slice(1),
      path: file,
    })
    const revision = 'original-private-revision',
      entryId = 'schema-lifecycle-only'
    const { createHash } = await import('node:crypto')
    const nativeId = createHash('sha256').update(entryId).digest('hex')
    const entryPath = `server/next-test/${nativeId}.js`,
      proofPath = entryPath.replace(/\.js$/, '.tsconfig-inputs.json')
    const hashBytes = (value: string | Buffer) =>
      createHash('sha256').update(value).digest('hex')
    const sourceHash = hashBytes(await readFile(sourceFile))
    const request = {
      version: 1 as const,
      role,
      id: 'original-private-request',
      revision,
      profile: { ...profile },
      source: { id: entryId, file: sourceFile, sha256: sourceHash },
      native: {
        entryId: nativeId,
        entryFile: 'subject.ts',
        entryPath,
        sourceCoverage: false,
        filesystemRoot: { nativePath: '', path: '/' },
        projectPath: pathValue(root),
      },
    }
    const records = ['aliases', 'decorators', 'jsx', 'typescript'].flatMap(
      (consumer) => {
        const context = {
          consumer,
          configuredPath: pathValue(config),
          consumerPath: pathValue(root),
          lookupPath: pathValue(root),
          request: 'native-options',
          chainIndex: 0,
          attemptIndex: 0,
        }
        return [
          {
            context,
            order: [],
            kind: 'selection',
            path: pathValue(root),
            fact: { selected: pathValue(config) },
          },
          {
            context,
            order: [],
            kind: 'config-read',
            path: pathValue(config),
            fact: {
              status: 'parsed',
              sha256: hashBytes('{}\n'),
              observed: 'file',
              identity: {
                status: 'found',
                target: pathValue(config),
                symlinks: [],
              },
            },
          },
          {
            context,
            order: [],
            kind: 'realpath',
            path: pathValue(absent),
            fact: { status: 'absent', symlinks: [] },
          },
          {
            context,
            order: [],
            kind: 'directory',
            path: pathValue(root),
            fact: { found: true },
          },
          {
            context,
            order: [],
            kind: 'candidate',
            path: pathValue(absent),
            fact: { requested: 'entry', observed: 'absent' },
          },
        ]
      }
    )
    const code = 'export {}\n'
    const native = {
      version: 1,
      kind: 'native-typescript-config-inputs',
      mode: 'development',
      environment: 'node',
      route: null,
      browserClient: false,
      sourceCoverage: false,
      entryId: nativeId,
      entryFile: 'subject.ts',
      entryPath,
      revision,
      filesystemRoot: request.native.filesystemRoot,
      projectPath: request.native.projectPath,
      complete: true,
      reasons: [],
      scripts: [
        {
          path: entryPath,
          sha256: hashBytes(code),
          mapPath: null,
          mapSha256: null,
        },
      ],
      records,
    }
    await mkdir(join(artifactRoot, 'server/next-test'), { recursive: true })
    await writeFile(join(artifactRoot, entryPath), code)
    const artifact = {
      version: 2,
      kind: 'node',
      entryId,
      revision,
      rootDir: artifactRoot,
      entryPath,
      profile: request.profile,
      sourceHash,
      files: [entryPath, proofPath],
      diagnostics: [],
      coverage: {
        version: 1,
        ...(role === 'compiler-source'
          ? {
              sourceAnalysis: {
                version: 1,
                file: sourceFile,
                sha256: sourceHash,
              },
            }
          : {}),
      },
    } as any
    let open = true,
      checks = 0
    const authorization = {
      request,
      artifactRoot,
      assertLease() {
        checks++
        if (!open) throw new Error('synthetic issuer closed')
      },
    }
    const reference = {
      version: 1 as const,
      nativeMetadata: { path: proofPath, sha256: '' },
    }
    async function rewrite() {
      const bytes = JSON.stringify(native)
      reference.nativeMetadata.sha256 = hashBytes(bytes)
      await writeFile(join(artifactRoot, proofPath), bytes)
    }
    await rewrite()
    const signal = new AbortController()
    return {
      root,
      artifactRoot,
      sourceFile,
      config,
      absent,
      native,
      artifact,
      request,
      authorization,
      reference,
      signal,
      rewrite,
      close() {
        open = false
      },
      checks: () => checks,
      cleanup: () => rm(root, { recursive: true, force: true }),
    }
  }

  it.each(['runtime', 'compiler-source'] as const)(
    'models a single-use synthetic %s lease without treating JSON as native origin',
    async (role) => {
      const { prepareNativeTsConfigInputs, assertParentNativeTsConfigFact } =
        await schemaReader()
      const f = await syntheticLifecycle(role)
      try {
        const original = structuredClone(f.request)
        const staged = await prepareNativeTsConfigInputs({
          ...f,
          signal: f.signal.signal,
        })
        expect(staged).toBeDefined()
        expect(
          staged!.watchInputs.some(
            (input) => input.path === f.absent && input.kind === 'absence'
          )
        ).toBe(true)
        const fact = await staged!.seal()
        expect(Object.isFrozen(fact)).toBe(true)
        expect(Object.isFrozen(fact.native.records)).toBe(true)
        f.close()
        await assertParentNativeTsConfigFact({
          fact,
          expected: original,
          signal: f.signal.signal,
        })
        await expect(staged!.seal()).rejects.toThrow('seal already consumed')
        await expect(
          assertParentNativeTsConfigFact({
            fact: structuredClone(fact),
            expected: original,
            signal: f.signal.signal,
          })
        ).rejects.toThrow('original issuer/request')
        await expect(
          assertParentNativeTsConfigFact({
            fact,
            expected: { ...original, id: 'fresh-parent-request' },
            signal: f.signal.signal,
          })
        ).rejects.toThrow('original issuer/request')
        await expect(
          assertParentNativeTsConfigFact({
            fact,
            expected: { ...original, revision: 'fresh-revision' },
            signal: f.signal.signal,
          })
        ).rejects.toThrow('original issuer/request')
      } finally {
        await f.cleanup()
      }
    }
  )

  it('captures the original parent callback and immutable request once in synthetic lifecycle', async () => {
    const { prepareNativeTsConfigInputs } = await schemaReader()
    const f = await syntheticLifecycle()
    try {
      const originalAuthorization = f.authorization
      const originalCallback = f.authorization.assertLease
      f.authorization.assertLease = function (
        this: typeof originalAuthorization
      ) {
        expect(this).toBe(originalAuthorization)
        originalCallback()
      }
      const staged = await prepareNativeTsConfigInputs({
        ...f,
        signal: f.signal.signal,
      })
      f.authorization.assertLease = () => {
        throw new Error('replacement callback must not run')
      }
      f.request.id = 'mutated-authority'
      f.reference.nativeMetadata.sha256 = '0'.repeat(64)
      const fact = await staged!.seal()
      expect(fact.request.id).toBe('original-private-request')
      expect(f.checks()).toBeGreaterThan(1)
    } finally {
      await f.cleanup()
    }
  })

  it.each([
    ['async-resolved', async () => undefined],
    ['sync-value', () => true],
  ] as const)(
    'refuses a native lease callback without synchronous undefined: %s',
    async (_kind, callback) => {
      const { prepareNativeTsConfigInputs } = await schemaReader()
      const f = await syntheticLifecycle()
      try {
        await rm(f.root, { recursive: true, force: true })
        await expect(
          prepareNativeTsConfigInputs({
            ...f,
            authorization: { ...f.authorization, assertLease: callback },
            signal: f.signal.signal,
          })
        ).rejects.toThrow(
          'native lease must return synchronously with undefined'
        )
      } finally {
        await f.cleanup()
      }
    }
  )

  it.each([
    'missing-reference',
    'unrequested-reference',
    'missing-issuer',
    'closed-issuer',
    'unlisted-sidecar',
    'wrong-root',
    'wrong-revision',
    'wrong-mode',
    'wrong-role',
    'wrong-source',
    'wrong-native-id',
    'extra-reference',
    'duplicate-files',
  ])('rejects synthetic parent ownership mismatch: %s', async (kind) => {
    const { prepareNativeTsConfigInputs } = await schemaReader()
    const f = await syntheticLifecycle()
    try {
      const options: any = { ...f, signal: f.signal.signal }
      if (kind === 'missing-reference') options.reference = undefined
      if (kind === 'unrequested-reference') options.authorization = undefined
      if (kind === 'missing-issuer')
        options.authorization = { ...f.authorization, assertLease: undefined }
      if (kind === 'closed-issuer') f.close()
      if (kind === 'unlisted-sidecar') f.artifact.files.pop()
      if (kind === 'wrong-root')
        options.authorization = { ...f.authorization, artifactRoot: f.root }
      if (kind === 'wrong-revision') f.request.revision = 'foreign-revision'
      if (kind === 'wrong-mode')
        Object.assign(f.request.profile, { mode: 'production' })
      if (kind === 'wrong-role') f.request.role = 'compiler-source'
      if (kind === 'wrong-source') f.request.source.sha256 = '0'.repeat(64)
      if (kind === 'wrong-native-id') f.request.native.entryId = '0'.repeat(64)
      if (kind === 'extra-reference')
        options.reference = { ...f.reference, forged: true }
      if (kind === 'duplicate-files')
        f.artifact.files.push(f.artifact.entryPath)
      await expect(prepareNativeTsConfigInputs(options)).rejects.toThrow()
    } finally {
      await f.cleanup()
    }
  })

  it.each([
    'extra-field',
    'incomplete',
    'reasons',
    'missing-role',
    'order',
    'duplicate-record',
    'invalid-read',
    'missing-read',
    'symlink-identity',
    'foreign-mapping',
    'directory-candidate',
    'wrong-extends',
    'extra-script',
    'wrong-map',
  ])(
    'rejects unsupported or contradictory synthetic native schema: %s',
    async (kind) => {
      const { prepareNativeTsConfigInputs } = await schemaReader()
      const f = await syntheticLifecycle()
      try {
        const value = f.native as any
        if (kind === 'extra-field') value.foreign = true
        if (kind === 'incomplete') value.complete = false
        if (kind === 'reasons') value.reasons.push('unqualified config shape')
        if (kind === 'missing-role')
          value.records = value.records.filter(
            (record: any) => record.context.consumer !== 'aliases'
          )
        if (kind === 'order') value.records.reverse()
        if (kind === 'duplicate-record')
          value.records.splice(1, 0, value.records[0])
        if (kind === 'invalid-read') value.records[1].fact.status = 'invalid'
        if (kind === 'missing-read')
          value.records = value.records.filter(
            (record: any) => record.kind !== 'config-read'
          )
        if (kind === 'symlink-identity')
          value.records[1].fact.identity.symlinks = [value.records[1].path]
        if (kind === 'foreign-mapping')
          value.records[1].path.path = f.sourceFile
        if (kind === 'directory-candidate')
          value.records[4].fact.observed = 'directory'
        if (kind === 'wrong-extends') {
          value.records[1].kind = 'extends'
          value.records[1].fact = {
            request: 'package',
            primary: [],
            affectingSourceReferences: [],
          }
        }
        if (kind === 'extra-script') value.scripts.push(value.scripts[0])
        if (kind === 'wrong-map') value.scripts[0].mapSha256 = '0'.repeat(64)
        await f.rewrite()
        await expect(
          prepareNativeTsConfigInputs({ ...f, signal: f.signal.signal })
        ).rejects.toThrow()
      } finally {
        await f.cleanup()
      }
    }
  )

  it.each([
    'config-bytes',
    'new-candidate',
    'source-bytes',
    'script-bytes',
    'new-map',
    'sidecar-bytes',
    'symlink',
    'cancel',
    'closed',
  ])(
    'refuses synthetic sealing after actual filesystem or ownership change: %s',
    async (kind) => {
      const { prepareNativeTsConfigInputs } = await schemaReader()
      const f = await syntheticLifecycle()
      try {
        const staged = await prepareNativeTsConfigInputs({
          ...f,
          signal: f.signal.signal,
        })
        if (kind === 'config-bytes')
          await writeFile(f.config, '{"changed":true}')
        if (kind === 'new-candidate') await writeFile(f.absent, '{}')
        if (kind === 'source-bytes')
          await writeFile(f.sourceFile, 'export const value = 2\n')
        if (kind === 'script-bytes')
          await writeFile(
            join(f.artifactRoot, f.artifact.entryPath),
            'export const changed = 1'
          )
        if (kind === 'new-map')
          await writeFile(
            join(f.artifactRoot, f.artifact.entryPath + '.map'),
            '{}'
          )
        if (kind === 'sidecar-bytes')
          await writeFile(
            join(f.artifactRoot, f.reference.nativeMetadata.path),
            '{}'
          )
        if (kind === 'symlink') {
          const { symlink } = await import('node:fs/promises')
          await rm(f.config)
          await symlink(f.sourceFile, f.config)
        }
        if (kind === 'cancel')
          f.signal.abort(new Error('cancel synthetic native inputs'))
        if (kind === 'closed') f.close()
        await expect(staged!.seal()).rejects.toThrow()
        await expect(staged!.seal()).rejects.toThrow('seal already consumed')
      } finally {
        await f.cleanup()
      }
    }
  )

  it('rechecks sealed synthetic cache inputs under the original request after cleanup', async () => {
    const { prepareNativeTsConfigInputs, assertParentNativeTsConfigFact } =
      await schemaReader()
    const f = await syntheticLifecycle()
    try {
      const staged = await prepareNativeTsConfigInputs({
        ...f,
        signal: f.signal.signal,
      })
      const fact = await staged!.seal(),
        original = structuredClone(f.request)
      await rm(f.artifactRoot, { recursive: true, force: true })
      f.close()
      await assertParentNativeTsConfigFact({
        fact,
        expected: original,
        signal: f.signal.signal,
      })
      await writeFile(f.absent, '{}')
      await expect(
        assertParentNativeTsConfigFact({
          fact,
          expected: original,
          signal: f.signal.signal,
        })
      ).rejects.toThrow('absence changed')
    } finally {
      await f.cleanup()
    }
  })

  it('does no work for an unrequested reader and refuses explicit false/null issuer shapes', async () => {
    const { prepareNativeTsConfigInputs } = await schemaReader()
    const signal = new AbortController().signal
    await expect(
      prepareNativeTsConfigInputs({
        artifact: undefined as any,
        reference: undefined,
        authorization: undefined,
        signal,
      })
    ).resolves.toBeUndefined()
    for (const authorization of [
      false,
      null,
      true,
      {},
      { assertLease() {}, forged: true },
    ]) {
      await expect(
        prepareNativeTsConfigInputs({
          artifact: undefined as any,
          reference: undefined,
          authorization: authorization as any,
          signal,
        })
      ).rejects.toThrow()
    }
  })

  it('checks the original synthetic lease after awaited filesystem work', async () => {
    const { prepareNativeTsConfigInputs } = await schemaReader()
    const f = await syntheticLifecycle()
    try {
      const original = f.authorization.assertLease
      f.authorization.assertLease = () => {
        original()
        if (f.checks() === 6) f.close()
      }
      await expect(
        prepareNativeTsConfigInputs({ ...f, signal: f.signal.signal })
      ).rejects.toThrow('synthetic issuer closed')
      expect(f.checks()).toBeGreaterThan(6)
    } finally {
      await f.cleanup()
    }
  })

  it('does not invent a child candidate when the actual synthetic parent directory was absent', async () => {
    const { prepareNativeTsConfigInputs } = await schemaReader()
    const { mkdir } = await import('node:fs/promises')
    const f = await syntheticLifecycle()
    try {
      const missing = join(f.root, 'missing-parent')
      f.native.records = f.native.records.filter(
        (record) => record.kind !== 'candidate'
      )
      for (const record of f.native.records as any[]) {
        if (record.kind === 'directory' || record.kind === 'realpath') {
          record.path = { nativePath: missing.slice(1), path: missing }
          if (record.kind === 'directory') record.fact.found = false
        }
      }
      await f.rewrite()
      const staged = await prepareNativeTsConfigInputs({
        ...f,
        signal: f.signal.signal,
      })
      expect(staged!.watchInputs).toContainEqual({
        path: missing,
        kind: 'absence',
      })
      await mkdir(missing)
      await expect(staged!.seal()).rejects.toThrow()
    } finally {
      await f.cleanup()
    }
  })

  it.each([
    'query',
    'extensionless',
    'package',
    'conditional',
    'affecting',
    'unconsumed',
    'invalid',
    'configured',
    'context-key',
    'negative-order',
    'fixed-mismatch',
    'root-selection-chain',
    'orphan-origin-read',
    'read-lookup-parent',
  ])(
    'refuses altered historical producer schema without native reissuance: %s',
    async (kind) => {
      const { validateNativeTsConfigInputsSchema } = await schemaReader()
      const value = JSON.parse(
        await readFile(
          join(__dirname, 'fixtures/native-tsconfig/development.native.txt'),
          'utf8'
        )
      )
      const expected = {
        version: 1 as const,
        role: 'runtime' as const,
        id: 'historical-schema-only',
        revision: value.revision,
        profile: { ...profile },
        source: {
          id: 'historical-schema-only',
          file: join(value.projectPath.path, value.entryFile),
          sha256: '0'.repeat(64),
        },
        native: {
          entryId: value.entryId,
          entryFile: value.entryFile,
          entryPath: value.entryPath,
          sourceCoverage: value.sourceCoverage,
          filesystemRoot: value.filesystemRoot,
          projectPath: value.projectPath,
        },
      }
      const inherited = value.records.find(
        (record: any) => record.kind === 'extends'
      )
      if (kind === 'query') inherited.fact.request += '?raw'
      if (kind === 'extensionless') inherited.fact.request = './base'
      if (kind === 'package') inherited.fact.request = 'config-package'
      if (kind === 'conditional')
        inherited.fact.primary[0].conditions.push({ name: 'node', value: true })
      if (kind === 'affecting')
        inherited.fact.affectingSourceReferences.push(inherited.path)
      if (kind === 'unconsumed')
        value.records = value.records.filter(
          (record: any) =>
            !(
              record.kind === 'config-read' &&
              record.context.consumer === inherited.context.consumer &&
              record.context.chainIndex === inherited.context.chainIndex + 1 &&
              record.path.path === inherited.fact.primary[0].result.path.path
            )
        )
      if (kind === 'invalid')
        value.records.find(
          (record: any) => record.kind === 'config-read'
        ).fact.status = 'invalid'
      if (kind === 'configured') {
        const configured = value.records.find(
          (record: any) => record.context.configuredPath !== null
        ).context.configuredPath
        configured.nativePath += '.yaml'
        configured.path += '.yaml'
      }
      if (kind === 'context-key') value.records[0].context.foreign = true
      if (kind === 'negative-order') value.records[0].order = [-1]
      if (kind === 'fixed-mismatch')
        value.records.find(
          (record: any) => record.kind === 'fixed-metadata'
        ).fact.succeeded = false
      if (kind === 'root-selection-chain')
        value.records.find(
          (record: any) =>
            record.kind === 'selection' &&
            record.context.consumer === 'typescript'
        ).context.chainIndex = 9
      if (kind === 'orphan-origin-read') {
        value.records.find(
          (record: any) =>
            record.kind === 'extends' &&
            record.context.consumer === 'typescript'
        ).context.chainIndex = 3
        value.records.find(
          (record: any) =>
            record.kind === 'config-read' &&
            record.context.consumer === 'typescript' &&
            record.context.chainIndex === 1
        ).context.chainIndex = 4
      }
      if (kind === 'read-lookup-parent')
        value.records.find(
          (record: any) =>
            record.kind === 'config-read' &&
            record.context.consumer === 'typescript' &&
            record.context.chainIndex === 1
        ).context.lookupPath = structuredClone(value.filesystemRoot)
      const relationErrors: Record<string, string> = {
        'root-selection-chain': 'invalid root native selection chain',
        'orphan-origin-read': 'native extends lacks its current parsed read',
        'read-lookup-parent':
          'native config read lookup differs from its source parent',
      }
      if (relationErrors[kind]) {
        // Only contexts changed. Preserve their native UTF-8 ordering; stable
        // sorting keeps each unchanged context's original probe order intact.
        value.records.sort((a: any, b: any) =>
          Buffer.compare(
            Buffer.from(JSON.stringify(a.context)),
            Buffer.from(JSON.stringify(b.context))
          )
        )
      }
      expect(() => validateNativeTsConfigInputsSchema(value, expected)).toThrow(
        relationErrors[kind] ?? 'Invalid native TypeScript config inputs'
      )
    }
  )
})

// Presence controls only: these values do not establish native issuer evidence.
describe('native tsconfig markers require a separate parent authorization', () => {
  const markerCases: [string, PropertyDescriptor][] = [
    ['undefined', { value: undefined, enumerable: true }],
    ['null', { value: null, enumerable: true }],
    ['false', { value: false, enumerable: true }],
    ['true', { value: true, enumerable: true }],
    ['malformed', { value: {}, enumerable: true }],
    [
      'reference-shaped data',
      {
        value: {
          version: 1,
          nativeMetadata: {
            path: 'server/next-test/request.tsconfig-inputs.json',
            sha256: 'a'.repeat(64),
          },
        },
        enumerable: true,
      },
    ],
    ['non-enumerable undefined', { value: undefined }],
    [
      'unread accessor',
      {
        get() {
          throw new Error('native marker value must not be observed')
        },
        enumerable: true,
      },
    ],
  ]
  const refusal =
    'Native TypeScript config inputs require separate parent authorization'

  function markedArtifact(marker: PropertyDescriptor) {
    const proofRead = jest.fn(() => {
      throw new Error('coverage proof must not be observed')
    })
    return {
      artifact: Object.defineProperties(
        {},
        {
          nativeTsConfigInputs: marker,
          coverage: { get: proofRead },
        }
      ),
      proofRead,
    }
  }

  it.each(markerCases)(
    'ordinary standard remapping refuses own %s before reading coverage proof',
    async (_kind, marker) => {
      const { remapStandardCoverage } = await import(
        'next/dist/experimental/testing/coverage/istanbul'
      )
      const { artifact, proofRead } = markedArtifact(marker)
      const captureRead = jest.fn(() => {
        throw new Error('capture must not be observed')
      })
      await expect(
        remapStandardCoverage(
          artifact as any,
          Object.defineProperty({}, 'scripts', { get: captureRead }) as any
        )
      ).rejects.toThrow(refusal)
      expect(proofRead).not.toHaveBeenCalled()
      expect(captureRead).not.toHaveBeenCalled()
    }
  )

  it.each(markerCases)(
    'compile-only source analysis refuses own %s before reading parent permission',
    async (_kind, marker) => {
      const { analyzeCompiledCoverageSource } = await import(
        'next/dist/experimental/testing/coverage/source-analysis'
      )
      const { artifact, proofRead } = markedArtifact(marker)
      const permissionRead = jest.fn(() => {
        throw new Error('source permission must not be observed')
      })
      const sourceRead = jest.fn(() => {
        throw new Error('source must not be observed')
      })
      await expect(
        analyzeCompiledCoverageSource(
          Object.defineProperty({ artifact }, 'source', {
            get: sourceRead,
          }) as any,
          Object.defineProperty({}, 'nativeImportCoverageRoles', {
            get: permissionRead,
          }) as any,
          new AbortController().signal
        )
      ).rejects.toThrow(refusal)
      expect(proofRead).not.toHaveBeenCalled()
      expect(permissionRead).not.toHaveBeenCalled()
      expect(sourceRead).not.toHaveBeenCalled()
    }
  )

  it.each(markerCases)(
    'private runtime JSX refuses own %s before reading parent permission',
    async (_kind, marker) => {
      const { remapCompilerRuntimeCoverage } = await import(
        'next/dist/experimental/testing/coverage/istanbul'
      )
      const { artifact, proofRead } = markedArtifact(marker)
      const permissionRead = jest.fn(() => {
        throw new Error('runtime permission must not be observed')
      })
      const captureRead = jest.fn(() => {
        throw new Error('worker capture must not be observed')
      })
      await expect(
        remapCompilerRuntimeCoverage(
          artifact as any,
          Object.defineProperty({}, 'data', { get: captureRead }) as any,
          Object.defineProperty({}, 'runtimeJSX', {
            get: permissionRead,
          }) as any,
          new AbortController().signal
        )
      ).rejects.toThrow(refusal)
      expect(proofRead).not.toHaveBeenCalled()
      expect(permissionRead).not.toHaveBeenCalled()
      expect(captureRead).not.toHaveBeenCalled()
    }
  )

  it.each(markerCases)(
    'compile-only source analysis refuses wrapper-own %s before reading artifact proof',
    async (_kind, marker) => {
      const { analyzeCompiledCoverageSource } = await import(
        'next/dist/experimental/testing/coverage/source-analysis'
      )
      const artifactRead = jest.fn(() => {
        throw new Error('artifact proof must not be observed')
      })
      const permissionRead = jest.fn(() => {
        throw new Error('source permission must not be observed')
      })
      const sourceRead = jest.fn(() => {
        throw new Error('source must not be observed')
      })
      await expect(
        analyzeCompiledCoverageSource(
          Object.defineProperties(
            {},
            {
              nativeTsConfigInputs: marker,
              artifact: { get: artifactRead },
              source: { get: sourceRead },
            }
          ) as any,
          Object.defineProperty({}, 'nativeImportCoverageRoles', {
            get: permissionRead,
          }) as any,
          new AbortController().signal
        )
      ).rejects.toThrow(refusal)
      expect(artifactRead).not.toHaveBeenCalled()
      expect(permissionRead).not.toHaveBeenCalled()
      expect(sourceRead).not.toHaveBeenCalled()
    }
  )
})

/** Pre-admission controls only; these fixtures never establish native Session origin. */
it.each([
  'missing',
  'null',
  'false',
  'extra',
  'accessor',
  'prototype',
] as const)(
  'refuses foreign composed native authority shape: %s',
  async (kind) => {
    const { remapCompilerRuntimeCoverageWithNativeTsConfigInputs } =
      await import('next/dist/experimental/testing/coverage/istanbul')
    const f = await runtimeAuthorizationFixture(),
      getter = jest.fn()
    Object.assign(f.artifact, { nativeTsConfigInputs: undefined })
    let authority: any = { compilation: {}, fact: {}, selection: {} }
    if (kind === 'missing') authority = undefined
    if (kind === 'null') authority = null
    if (kind === 'false') authority = false
    if (kind === 'extra') authority.extra = true
    if (kind === 'prototype')
      authority = Object.assign(Object.create({ foreign: true }), authority)
    if (kind === 'accessor')
      Object.defineProperty(authority, 'compilation', {
        enumerable: true,
        get: getter,
      })
    try {
      await expect(
        remapCompilerRuntimeCoverageWithNativeTsConfigInputs(
          f.artifact,
          f.completion,
          f.expected,
          authority,
          f.signal
        )
      ).rejects.toThrow('Invalid private native runtime authority')
      expect(getter).not.toHaveBeenCalled()
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  }
)
it('does not reinterpret an unmarked artifact as private native composition', async () => {
  const { remapCompilerRuntimeCoverageWithNativeTsConfigInputs } = await import(
    'next/dist/experimental/testing/coverage/istanbul'
  )
  const f = await runtimeAuthorizationFixture()
  try {
    await expect(
      remapCompilerRuntimeCoverageWithNativeTsConfigInputs(
        f.artifact,
        f.completion,
        f.expected,
        {} as any,
        f.signal
      )
    ).rejects.toThrow('requires its original marker')
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})
it('deferred compiler lookup rejects synthetic native origin and reads the runtime capability getter once', async () => {
  const { remapCompilerRuntimeCoverageWithNativeTsConfigInputs } = await import(
    'next/dist/experimental/testing/coverage/istanbul'
  )
  const f = await runtimeAuthorizationFixture(),
    getter = jest.fn(() => f.expected.runtimeJSX)
  Object.assign(f.artifact, {
    nativeTsConfigInputs: {
      version: 1,
      nativeMetadata: { path: 'synthetic', sha256: '0'.repeat(64) },
    },
  })
  const expected = { ...f.expected }
  Object.defineProperty(expected, 'runtimeJSX', {
    enumerable: true,
    configurable: true,
    get: getter,
  })
  const selection = {
    version: 1 as const,
    id: 'synthetic',
    revision: expected.revision,
    profile: expected.entry.profile,
    source: {
      id: expected.entry.id,
      file: expected.entry.file,
      sha256: expected.entrySha256,
    },
  }
  try {
    await expect(
      remapCompilerRuntimeCoverageWithNativeTsConfigInputs(
        f.artifact,
        f.completion,
        expected,
        { compilation: {} as any, fact: {} as any, selection },
        f.signal
      )
    ).rejects.toThrow('original runtime compilation/fact identity')
    expect(getter).toHaveBeenCalledTimes(1)
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})
it.each([
  'nativeTsConfigInputs',
  'runtimeConfigurationImports',
  'configurationImports',
] as const)(
  'keeps ordinary private marker refusal independent of composition: %s',
  async (key) => {
    const { remapCompilerRuntimeCoverage } = await import(
        'next/dist/experimental/testing/coverage/istanbul'
      ),
      f = await runtimeAuthorizationFixture()
    Object.defineProperty(f.artifact, key, {
      value: undefined,
      enumerable: false,
    })
    try {
      await expect(
        remapCompilerRuntimeCoverage(
          f.artifact,
          f.completion,
          f.expected,
          f.signal
        )
      ).rejects.toThrow(
        /separate parent authorization|incompatible compiler runtime coverage/
      )
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  }
)

const legacyNativeLinePresence = [
  { name: 'undefined', value: undefined },
  { name: 'null', value: null },
  { name: 'false', value: false },
  { name: 'zero', value: 0 },
  { name: 'empty string', value: '' },
  { name: 'malformed', value: {} },
  { name: 'accessor', accessor: true },
  { name: 'nonenumerable', value: undefined, hidden: true },
]
it.each(legacyNativeLinePresence)(
  'legacy bare line remap refuses own native marker $name before reading anything else',
  async (marker) => {
    const getter = jest.fn(() => {
      throw new Error('must not observe marker or capture')
    })
    const artifact = Object.defineProperties(
      {},
      {
        nativeTsConfigInputs: marker.accessor
          ? { get: getter, enumerable: true }
          : { value: marker.value, enumerable: !marker.hidden },
        coverage: { get: getter },
      }
    )
    const capture = Object.defineProperty({}, 'version', { get: getter })
    await expect(
      remapCoverage(artifact as any, capture as any)
    ).rejects.toThrow(
      'Native TypeScript config inputs require separate parent authorization'
    )
    expect(getter).not.toHaveBeenCalled()
  }
)
it.each(['runtime', 'compiler-source', 'browser'] as const)(
  'native-aware line validation refuses a fabricated %s role without original binding',
  async (role) => {
    const { validateNativeRuntimeLineCoverage } = await import(
        'next/dist/experimental/testing/coverage/remap'
      ),
      getter = jest.fn(() => {
        throw new Error('must not read artifact/capture')
      })
    const artifact = Object.defineProperties(
      { nativeTsConfigInputs: {}, role },
      { coverage: { get: getter } }
    )
    await expect(
      validateNativeRuntimeLineCoverage(
        artifact as any,
        {} as any,
        {} as any,
        new AbortController().signal
      )
    ).rejects.toThrow('exact retained native runtime authority')
    expect(getter).not.toHaveBeenCalled()
  }
)

// A serialized native-config marker never authorizes the lower zero-descriptor
// helper. Presence refusal must precede marker, metadata, syntax and IO reads.
describe('lower compiler source native-config marker refusal', () => {
  it.each([
    'undefined',
    'null',
    'false',
    'true',
    'malformed',
    'reference',
    'non-enumerable',
    'accessor',
  ])('refuses own %s before reading declaration inputs', async (kind) => {
    const { analyzeCompiledSourceData } = await import(
      'next/dist/experimental/testing/coverage/istanbul'
    )
    const markerGetter = jest.fn(() => {
      throw new Error('Unexpected native marker getter')
    })
    const coverageGetter = jest.fn(() => {
      throw new Error('Unexpected declaration metadata getter')
    })
    const rootGetter = jest.fn(() => {
      throw new Error('Unexpected IO root getter')
    })
    const syntaxGetter = jest.fn(() => {
      throw new Error('Unexpected declaration syntax getter')
    })
    const values: Record<string, unknown> = {
      undefined: undefined,
      null: null,
      false: false,
      true: true,
      malformed: { version: 2 },
      reference: {
        version: 1,
        nativeMetadata: { path: 'server/native.json', sha256: 'a'.repeat(64) },
      },
    }
    const artifact = Object.defineProperties(Object.create(null), {
      nativeTsConfigInputs:
        kind === 'accessor'
          ? { enumerable: true, get: markerGetter }
          : { enumerable: kind !== 'non-enumerable', value: values[kind] },
      coverage: { enumerable: true, get: coverageGetter },
      rootDir: { enumerable: true, get: rootGetter },
    }) as CompiledTestArtifact
    const syntax = {
      get jsxFile(): string {
        return syntaxGetter()
      },
      get jsxFiles(): ReadonlySet<string> {
        return syntaxGetter()
      },
    }
    await expect(
      analyzeCompiledSourceData(artifact, '/not-read/subject.tsx', syntax)
    ).rejects.toThrow(
      'Native TypeScript config inputs require separate parent authorization'
    )
    expect(markerGetter).not.toHaveBeenCalled()
    expect(coverageGetter).not.toHaveBeenCalled()
    expect(rootGetter).not.toHaveBeenCalled()
    expect(syntaxGetter).not.toHaveBeenCalled()
  })
})

jest.mock('next/dist/build/swc', () => ({
  loadBindings: async () => ({ isWasm: false }),
}))
jest.mock('next/dist/build/lockfile', () => ({
  Lockfile: {
    tryAcquire: jest.fn(() => ({ unlock: jest.fn(async () => {}) })),
  },
}))
jest.mock('next/dist/build/swc/dev-project', () => ({
  createDevTurbopackProject: jest.fn(),
}))
jest.mock('next/dist/server/config', () => ({
  __esModule: true,
  default: async () => ({
    distDir: '.next/dev',
    cacheComponents: true,
    cacheMaxMemorySize: 123456,
    cacheHandlers: { default: undefined },
    cacheLife: { default: { stale: 300, revalidate: 900, expire: 3600 } },
    staticPageGenerationTimeout: 60,
    assetPrefix: '/assets',
    deploymentId: 'test-deployment',
    experimental: {
      instantInsights: { validationLevel: 'none' },
      lockDistDir: true,
      allowedRevalidateHeaderKeys: ['x-test-revalidate'],
      fetchCacheKeyPrefix: 'test-cache',
      isrFlushToDisk: true,
      authInterrupts: true,
      useCacheTimeout: 5000,
      durableUseCacheEntries: true,
    },
  }),
}))
jest.mock('next/dist/server/lib/router-utils/filesystem', () => ({
  setupFsCheck: async () => ({
    previewProps: {
      previewModeId: 'test-preview-id',
      previewModeSigningKey: 'test-signing-key',
      previewModeEncryptionKey: 'test-encryption-key',
    },
  }),
}))
jest.mock('next/dist/shared/lib/turbopack/utils', () => ({
  formatIssue: (issue: { message: string }) => issue.message,
}))

jest.mock('next/dist/experimental/testing/coverage/artifact', () => {
  const actual = jest.requireActual(
    'next/dist/experimental/testing/coverage/artifact'
  )
  return {
    __esModule: true,
    ...actual,
    buildCoverageMetadata: (...args: any[]) =>
      actual.buildCoverageMetadata(...args),
  }
})
jest.mock(
  'next/dist/experimental/testing/coverage/source-authorization',
  () => {
    const actual = jest.requireActual(
      'next/dist/experimental/testing/coverage/source-authorization'
    )
    return {
      __esModule: true,
      ...actual,
      retainNativeCompilerSourceAuthorization: (...args: any[]) =>
        actual.retainNativeCompilerSourceAuthorization(...args),
      validateNativeCompilerSourceBefore: (...args: any[]) =>
        actual.validateNativeCompilerSourceBefore(...args),
      validateNativeCompilerSourceAfter: (...args: any[]) =>
        actual.validateNativeCompilerSourceAfter(...args),
      sealNativeCompilerSourceAuthorization: (...args: any[]) =>
        actual.sealNativeCompilerSourceAuthorization(...args),
    }
  }
)
describe('private native compiler-source full validation and zero composition (synthetic components only)', () => {
  let root: string
  let owned:
    | Awaited<
        ReturnType<
          typeof import('next/dist/experimental/testing/compiler').createTestCompilerSession
        >
      >
    | undefined
  let selectedProfile: import('next/dist/experimental/testing/contracts').TestProfile
  let requests: any[]
  let hashMode: 'sha256' | 'xxh' | 'mismatch' | 'noncanonical'
  let omitListed: boolean
  let emittedSidecarSha256: string | undefined
  let shutdownNative: jest.Mock
  let deferredSnapshot: (() => Promise<void>) | undefined
  const previousEnvironment = process.env.NODE_ENV
  const sha = coverageHash
  const componentSource = 'function typed(value) {\n  return value + 1\n}\n'
  let invalidCoordinate = false
  let capturedRetained:
    | import('next/dist/experimental/testing/coverage/source-authorization').RetainedNativeCompilerSource
    | undefined
  beforeEach(async () => {
    const { realpath, mkdir } = await import('fs/promises')
    const { dirname } = await import('path')
    process.env = { ...process.env, NODE_ENV: 'development' }
    invalidCoordinate = false
    capturedRetained = undefined
    root = await realpath(
      await mkdtemp('/private/tmp/next-source-composition108-')
    )
    await writeFile(join(root, 'subject.ts'), componentSource)
    await writeFile(join(root, 'config.json'), '{}\n')
    selectedProfile = {
      id: 'native-session-component',
      mode: 'development',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
    }
    requests = []
    hashMode = 'sha256'
    omitListed = false
    emittedSidecarSha256 = undefined
    deferredSnapshot = undefined
    shutdownNative = jest.fn(async () => {})
    const { createDevTurbopackProject } = await import(
      'next/dist/build/swc/dev-project'
    )
    const { createTestCompilerSession } = await import(
      'next/dist/experimental/testing/compiler'
    )
    jest.mocked(createDevTurbopackProject).mockImplementation(
      async () =>
        ({
          nativeProjectPaths: Object.freeze({
            rootPath: root,
            projectPath: '.',
          }),
          project: {
            shutdown: shutdownNative,
            testEntry: async (input: any) => {
              requests.push({ ...input })
              return {
                writeToDiskSnapshot: async (directory: string) => {
                  await deferredSnapshot?.()
                  const destination = join(root, '.next', directory)
                  const entryPath = `server/next-test/${input.id}.js`
                  await mkdir(dirname(join(destination, entryPath)), {
                    recursive: true,
                  })
                  const code = componentSource
                  const {
                    SourceMapGenerator,
                  } = require('next/dist/compiled/source-map')
                  const map = new SourceMapGenerator()
                  for (const [line, text] of code.split('\n').entries())
                    for (let column = 0; column <= text.length; column++)
                      map.addMapping({
                        generated: { line: line + 1, column },
                        original: {
                          line: invalidCoordinate ? 999 : line + 1,
                          column,
                        },
                        source: pathToFileURL(join(root, 'subject.ts')).href,
                      })
                  map.setSourceContent(
                    pathToFileURL(join(root, 'subject.ts')).href,
                    componentSource
                  )
                  const mapBytes = map.toString()
                  const mapPath = entryPath + '.map'
                  await writeFile(join(destination, mapPath), mapBytes)
                  const importPath = entryPath.replace(
                    /\.js$/,
                    '.import-coverage.json'
                  )
                  await writeFile(
                    join(destination, importPath),
                    JSON.stringify({
                      version: 1,
                      kind: 'native-import-initializer-coverage',
                      mode: 'development',
                      entryPath,
                      scripts: [],
                    })
                  )
                  await writeFile(join(destination, entryPath), code)
                  const serverPaths = [
                    {
                      path: entryPath,
                      contentHash: 'ordinary-native-opaque-hash',
                    },
                  ]
                  serverPaths.push(
                    { path: mapPath, contentHash: 'ordinary-map-opaque-hash' },
                    {
                      path: importPath,
                      contentHash: 'ordinary-import-opaque-hash',
                    }
                  )
                  if (input.tsconfigInputRevision !== undefined) {
                    const nativePath = (file: string) => ({
                      nativePath:
                        file === root ? '' : file.slice(root.length + 1),
                      path: file,
                    })
                    const config = nativePath(join(root, 'config.json'))
                    const records = [
                      'aliases',
                      'decorators',
                      'jsx',
                      'typescript',
                    ].flatMap((consumer) => {
                      const context = {
                        consumer,
                        configuredPath: config,
                        consumerPath: nativePath(root),
                        lookupPath: nativePath(root),
                        request: 'native-options',
                        chainIndex: 0,
                        attemptIndex: 0,
                      }
                      return [
                        {
                          context,
                          order: [],
                          kind: 'selection',
                          path: nativePath(root),
                          fact: { selected: config },
                        },
                        {
                          context,
                          order: [],
                          kind: 'config-read',
                          path: config,
                          fact: {
                            status: 'parsed',
                            sha256: sha('{}\n'),
                            observed: 'file',
                            identity: {
                              status: 'found',
                              target: config,
                              symlinks: [],
                            },
                          },
                        },
                      ]
                    })
                    const payload = {
                      version: 1,
                      kind: 'native-typescript-config-inputs',
                      mode: 'development',
                      environment: 'node',
                      route: null,
                      browserClient: false,
                      sourceCoverage: false,
                      entryId: input.id,
                      entryFile: input.file,
                      entryPath,
                      revision: input.tsconfigInputRevision,
                      filesystemRoot: nativePath(root),
                      projectPath: nativePath(root),
                      complete: true,
                      reasons: [],
                      scripts: [
                        {
                          path: entryPath,
                          sha256: sha(code),
                          mapPath,
                          mapSha256: sha(mapBytes),
                        },
                      ],
                      records,
                    }
                    const bytes = JSON.stringify(payload),
                      path = entryPath.replace(/\.js$/, '.tsconfig-inputs.json')
                    await writeFile(join(destination, path), bytes)
                    emittedSidecarSha256 = sha(bytes)
                    const nativeHash = Buffer.from(sha(bytes), 'hex').toString(
                      'base64'
                    )
                    if (!omitListed)
                      serverPaths.push({
                        path,
                        contentHash:
                          hashMode === 'sha256'
                            ? nativeHash
                            : hashMode === 'xxh'
                              ? '0123456789abcdef0123456789abcdef'
                              : hashMode === 'mismatch'
                                ? Buffer.alloc(32).toString('base64')
                                : nativeHash.replace(/=$/, ''),
                      })
                  }
                  return {
                    value: {
                      type: 'nodejs',
                      entryPath,
                      serverPaths,
                      clientPaths: [],
                    },
                    issues: [],
                  }
                },
              }
            },
          },
        }) as any
    )
    owned = await createTestCompilerSession(root, selectedProfile, {
      nativeImportCoverageRoles: true,
    })
  })
  afterEach(async () => {
    jest.restoreAllMocks()
    await owned?.dispose()
    owned = undefined
    await rm(root, { recursive: true, force: true })
    process.env = { ...process.env, NODE_ENV: previousEnvironment }
  })
  async function selection(
    role: 'runtime' | 'compiler-source' = 'compiler-source'
  ) {
    const { sourceAnalysisEntryId } = await import(
      'next/dist/experimental/testing/coverage/source-analysis'
    )
    const file = join(root, 'subject.ts')
    return {
      version: 1 as const,
      id: 'original-component-request-' + role,
      revision: 'original-before-endpoint-revision-' + role,
      profile: { ...selectedProfile },
      source: {
        id:
          role === 'runtime'
            ? 'runtime-subject'
            : sourceAnalysisEntryId(selectedProfile, file),
        file,
        sha256: sha(await readFile(file)),
      },
    }
  }
  async function compileRuntime(
    selected: Awaited<ReturnType<typeof selection>>,
    signal = new AbortController().signal
  ) {
    return owned!.compileRuntimeWithNativeTsConfigInputs(
      {
        id: selected.source.id,
        file: selected.source.file,
        profile: selected.profile,
      },
      {
        selection: selected,
        signal,
        coverage: { version: 1, kind: 'node-line' },
      }
    )
  }

  async function issued(
    role: 'runtime' | 'compiler-source' = 'compiler-source',
    compileSignal = new AbortController().signal
  ) {
    const selected = await selection(role)
    const compilation =
      role === 'runtime'
        ? await compileRuntime(selected, compileSignal)
        : await owned!.compileCoverageSourceWithNativeTsConfigInputs(
            { file: selected.source.file, sha256: selected.source.sha256 },
            { selection: selected, signal: compileSignal }
          )
    const staged = await owned!.prepareNativeTsConfigInputs(compilation, {
      role,
      selection: selected,
      signal: new AbortController().signal,
    })
    const fact = await staged.seal()
    expect(fact.reference.nativeMetadata.sha256).toBe(emittedSidecarSha256)
    const artifact =
      compilation.role === 'runtime'
        ? compilation.value
        : compilation.value.artifact
    const value =
      compilation.value as import('next/dist/experimental/testing/coverage/types').CompiledCoverageSource
    const conversionController = new AbortController(),
      signal = conversionController.signal
    const api = await import('next/dist/experimental/testing/compiler')
    return {
      compilation,
      artifact,
      value,
      fact,
      selected,
      signal,
      conversionController,
      api,
      options: { compilation, value, fact, selection: selected, signal },
    }
  }

  async function ready() {
    const f = await issued()
    const capability = {
      version: 1 as const,
      assertLease() {
        if (this !== capability)
          throw new Error('source capability receiver changed')
      },
    }
    const expected = {
      projectDir: root,
      artifactRoot: f.artifact.rootDir,
      revision: f.artifact.revision,
      profile: { ...selectedProfile },
      source: { ...f.value.source },
      nativeImportCoverageRoles: capability,
    }
    const native = {
      compilation: f.compilation,
      fact: f.fact,
      selection: f.selected,
    }
    const sourceAuth = await import(
      'next/dist/experimental/testing/coverage/source-authorization'
    )
    const istanbul = await import(
      'next/dist/experimental/testing/coverage/istanbul'
    )
    const retain = sourceAuth.retainNativeCompilerSourceAuthorization
    jest
      .spyOn(sourceAuth, 'retainNativeCompilerSourceAuthorization')
      .mockImplementation(async (...args) => {
        const retained = await retain(...args)
        capturedRetained = retained
        return retained
      })
    return {
      ...f,
      expected,
      native,
      sourceAuth,
      istanbul,
      capability,
      convert: () =>
        istanbul.analyzeCompiledCoverageSourceWithNativeTsConfigInputs(
          f.value,
          expected,
          native,
          f.signal
        ),
    }
  }
  function assertRevoked(
    sourceAuth: typeof import('next/dist/experimental/testing/coverage/source-authorization'),
    signal: AbortSignal
  ) {
    expect(capturedRetained).toBeDefined()
    expect(() =>
      capturedRetained!.expected.nativeImportCoverageRoles!.assertLease()
    ).toThrow('Missing exact retained native compiler source authority')
    expect(() =>
      sourceAuth.assertBeforeValidatedNativeCompilerSource(
        capturedRetained!,
        signal
      )
    ).toThrow('Missing exact retained native compiler source authority')
    expect(() =>
      sourceAuth.assertSealedNativeCompilerSourceAuthorization(
        capturedRetained!,
        signal
      )
    ).toThrow('Missing exact retained native compiler source authority')
  }
  it('runs the real zero algorithm only after full validation and retires the exact copy (component policy, no actual zero oracle claim)', async () => {
    const f = await ready()
    const marker = f.artifact.nativeTsConfigInputs
    const result = await f.convert()
    expect(result.kind).toBe('next-compiler-declarations')
    expect(result.source).toEqual(f.value.source)
    expect(result.compiler).toEqual({
      entryId: f.artifact.entryId,
      revision: f.artifact.revision,
    })
    expect([
      ...Object.values(result.data.s),
      ...Object.values(result.data.f),
      ...Object.values(result.data.b).flat(),
    ]).not.toHaveLength(0)
    expect(
      [
        ...Object.values(result.data.s),
        ...Object.values(result.data.f),
        ...Object.values(result.data.b).flat(),
      ].every((count) => count === 0)
    ).toBe(true)
    expect(f.artifact.nativeTsConfigInputs).toBe(marker)
    assertRevoked(f.sourceAuth, f.signal)
  })
  it('does not turn native-prepared or exported full-validator completion into access to the private zero core', async () => {
    const f = await ready()
    const retained = await f.sourceAuth.retainNativeCompilerSourceAuthorization(
      f.value,
      f.expected,
      f.native,
      f.signal
    )
    try {
      expect(() =>
        f.sourceAuth.assertBeforeValidatedNativeCompilerSource(
          retained,
          f.signal
        )
      ).toThrow('not fully before-validated')
      await expect(
        f.sourceAuth.sealNativeCompilerSourceAuthorization(retained, f.signal)
      ).rejects.toThrow('complete post-validation')
      await f.sourceAuth.validateNativeCompilerSourceBefore(retained, f.signal)
      expect(() =>
        f.sourceAuth.assertBeforeValidatedNativeCompilerSource(
          retained,
          f.signal
        )
      ).not.toThrow()
      await expect(
        f.istanbul.analyzeCompiledSourceData(
          retained.value.artifact,
          retained.value.source.file
        )
      ).rejects.toThrow(
        'Native TypeScript config inputs require separate parent authorization'
      )
      await expect(
        f.sourceAuth.validateNativeCompilerSourceBefore(retained, f.signal)
      ).rejects.toThrow('before-validation phase')
    } finally {
      f.sourceAuth.retireNativeCompilerSourceAuthorization(retained)
    }
    assertRevoked(f.sourceAuth, f.signal)
  })
  it('rejects map coordinates before private zero conversion even with exact declared hashes and native fact', async () => {
    invalidCoordinate = true
    const f = await ready()
    const post = jest.spyOn(f.sourceAuth, 'validateNativeCompilerSourceAfter')
    await expect(f.convert()).rejects.toThrow(
      'coordinate exceeds retained content'
    )
    expect(post).not.toHaveBeenCalled()
    assertRevoked(f.sourceAuth, f.signal)
  })
  it.each([
    'profile',
    'source',
    'selection profile',
    'selection source',
    'capability property',
    'capability callback',
  ] as const)(
    'refuses equal object or descriptor replacement of captured %s',
    async (field) => {
      const f = await ready()
      const retained =
        await f.sourceAuth.retainNativeCompilerSourceAuthorization(
          f.value,
          f.expected,
          f.native,
          f.signal
        )
      try {
        if (field === 'profile') f.expected.profile = { ...f.expected.profile }
        else if (field === 'source')
          f.expected.source = { ...f.expected.source }
        else if (field === 'selection profile')
          f.native.selection.profile = { ...f.native.selection.profile }
        else if (field === 'selection source')
          f.native.selection.source = { ...f.native.selection.source }
        else if (field === 'capability property')
          Object.defineProperty(f.expected, 'nativeImportCoverageRoles', {
            writable: false,
          })
        else
          Object.defineProperty(f.capability, 'assertLease', {
            writable: false,
          })
        await expect(
          f.sourceAuth.validateNativeCompilerSourceBefore(retained, f.signal)
        ).rejects.toThrow(
          /Parent compiler source (?:authorization|capability) changed/
        )
      } finally {
        f.sourceAuth.retireNativeCompilerSourceAuthorization(retained)
      }
      assertRevoked(f.sourceAuth, f.signal)
    }
  )
  it.each([
    'source',
    'script',
    'map',
    'native sidecar',
    'import sidecar',
    'abort',
    'dispose',
  ] as const)(
    'refuses late %s changes only after the genuine zero algorithm finishes',
    async (field) => {
      const f = await ready(),
        after = f.sourceAuth.validateNativeCompilerSourceAfter
      let genuineZeroCompleted = false,
        actionCompleted = false
      jest
        .spyOn(f.sourceAuth, 'validateNativeCompilerSourceAfter')
        .mockImplementation(async (...args) => {
          genuineZeroCompleted = true
          if (field === 'abort')
            f.conversionController.abort(
              new Error('late original conversion abort')
            )
          else if (field === 'dispose') await owned!.dispose()
          else {
            const file =
              field === 'source'
                ? f.value.source.file
                : join(
                    f.artifact.rootDir,
                    field === 'script'
                      ? f.artifact.entryPath
                      : field === 'map'
                        ? f.artifact.entryPath + '.map'
                        : field === 'native sidecar'
                          ? f.artifact.nativeTsConfigInputs!.nativeMetadata.path
                          : f.artifact.coverage!.importRoles!.nativeMetadata
                              .path
                  )
            await writeFile(file, 'late component mutation')
          }
          actionCompleted = true
          return after(...args)
        })
      await expect(f.convert()).rejects.toThrow(
        /changed|closed|aborted|abort|JSON|Unexpected|native|import|compiler/i
      )
      expect(genuineZeroCompleted).toBe(true)
      expect(actionCompleted).toBe(true)
      assertRevoked(f.sourceAuth, f.signal)
    }
  )
  it('retires copy permissions when the genuine final native seal observes changed config bytes', async () => {
    const f = await ready(),
      seal = f.sourceAuth.sealNativeCompilerSourceAuthorization
    let reachedFinalSeal = false,
      actionCompleted = false
    jest
      .spyOn(f.sourceAuth, 'sealNativeCompilerSourceAuthorization')
      .mockImplementation(async (...args) => {
        reachedFinalSeal = true
        await writeFile(join(root, 'config.json'), '{"late":true}\n')
        actionCompleted = true
        return seal(...args)
      })
    await expect(f.convert()).rejects.toThrow(/config|native|changed/i)
    expect(reachedFinalSeal).toBe(true)
    expect(actionCompleted).toBe(true)
    assertRevoked(f.sourceAuth, f.signal)
  })
  it.each(['unknown field', 'source inventory', 'script inventory'] as const)(
    'compares complete rebuilt metadata including %s before zero conversion',
    async (field) => {
      const f = await ready(),
        artifactModule = await import(
          'next/dist/experimental/testing/coverage/artifact'
        )
      const build = artifactModule.buildCoverageMetadata
      let rebuiltFromRealBytes = false
      jest
        .spyOn(artifactModule, 'buildCoverageMetadata')
        .mockImplementation(async (...args) => {
          const result = await build(...args)
          rebuiltFromRealBytes = true
          if (field === 'unknown field') (result as any).unrequested = true
          else if (field === 'source inventory')
            result.sources['/unselected.ts'] = {
              file: '/unselected.ts',
              sha256: '0'.repeat(64),
            }
          else
            result.scripts.push({ ...result.scripts[0], path: 'unselected.js' })
          return result
        })
      const post = jest.spyOn(f.sourceAuth, 'validateNativeCompilerSourceAfter')
      await expect(f.convert()).rejects.toThrow(
        'metadata does not match its emitted closure'
      )
      expect(rebuiltFromRealBytes).toBe(true)
      expect(post).not.toHaveBeenCalled()
      assertRevoked(f.sourceAuth, f.signal)
    }
  )
  it.each(['profile replacement', 'abort', 'dispose'] as const)(
    'refuses %s after the genuine final seal returns and before publication',
    async (field) => {
      const f = await ready(),
        seal = f.sourceAuth.sealNativeCompilerSourceAuthorization
      let genuineSealCompleted = false,
        actionCompleted = false
      jest
        .spyOn(f.sourceAuth, 'sealNativeCompilerSourceAuthorization')
        .mockImplementation(async (...args) => {
          await seal(...args)
          genuineSealCompleted = true
          if (field === 'profile replacement')
            f.expected.profile = { ...f.expected.profile }
          else if (field === 'abort')
            f.conversionController.abort(
              new Error('after genuine final source seal abort')
            )
          else await owned!.dispose()
          actionCompleted = true
        })
      await expect(f.convert()).rejects.toThrow(/changed|closed|abort/)
      expect(genuineSealCompleted).toBe(true)
      expect(actionCompleted).toBe(true)
      assertRevoked(f.sourceAuth, f.signal)
    }
  )
  it('refuses equal selection replacement while the deferred real CJS lookup is pending', async () => {
    const f = await ready()
    const pending = f.sourceAuth.retainNativeCompilerSourceAuthorization(
      f.value,
      f.expected,
      f.native,
      f.signal
    )
    f.native.selection.profile = { ...f.native.selection.profile }
    await expect(pending).rejects.toThrow(
      'Parent compiler source authorization changed'
    )
    expect(capturedRetained).toBeUndefined()
  })
  it('binds the retained copy to the exact signal and refuses forged copies without zero access', async () => {
    const f = await ready(),
      retained = await f.sourceAuth.retainNativeCompilerSourceAuthorization(
        f.value,
        f.expected,
        f.native,
        f.signal
      )
    try {
      await expect(
        f.sourceAuth.validateNativeCompilerSourceBefore(
          { ...retained },
          f.signal
        )
      ).rejects.toThrow('Missing exact retained')
      await expect(
        f.sourceAuth.validateNativeCompilerSourceBefore(
          retained,
          new AbortController().signal
        )
      ).rejects.toThrow('Missing exact retained')
    } finally {
      f.sourceAuth.retireNativeCompilerSourceAuthorization(retained)
    }
    assertRevoked(f.sourceAuth, f.signal)
  })
})

describe('private native compiler-source descriptor and module-role refusals (pre-admission)', () => {
  it.each(['value', 'expected', 'native', 'capability'] as const)(
    'does not evaluate an accessor on the private %s container',
    async (where) => {
      const { retainNativeCompilerSourceAuthorization } = await import(
        'next/dist/experimental/testing/coverage/source-authorization'
      )
      const getter = jest.fn(() => {
        throw new Error('unexpected private container getter')
      })
      const value: any = {
        version: 1,
        kind: 'next-compiler-source',
        source: {},
        artifact: { nativeTsConfigInputs: undefined },
      }
      const expected: any = {
        projectDir: '',
        artifactRoot: '',
        revision: '',
        profile: {},
        source: {},
        nativeImportCoverageRoles: { version: 1, assertLease() {} },
      }
      const native: any = { compilation: {}, fact: {}, selection: {} }
      const target =
        where === 'value'
          ? value
          : where === 'expected'
            ? expected
            : where === 'native'
              ? native
              : expected.nativeImportCoverageRoles
      const key =
        where === 'value'
          ? 'artifact'
          : where === 'expected'
            ? 'profile'
            : where === 'native'
              ? 'compilation'
              : 'assertLease'
      Object.defineProperty(target, key, {
        enumerable: true,
        configurable: true,
        get: getter,
      })
      await expect(
        retainNativeCompilerSourceAuthorization(
          value,
          expected,
          native,
          new AbortController().signal
        )
      ).rejects.toThrow('Invalid private compiler source')
      expect(getter).not.toHaveBeenCalled()
    }
  )
  it.each([
    undefined,
    null,
    false,
    { version: 1, assertLease() {}, extra: true },
    {
      version: 1,
      assertLease() {
        return true
      },
    },
    { version: 1, async assertLease() {} },
  ])(
    'refuses malformed or asynchronous private source capability %p',
    async (capability) => {
      const { retainNativeCompilerSourceAuthorization } = await import(
        'next/dist/experimental/testing/coverage/source-authorization'
      )
      const value: any = {
        version: 1,
        kind: 'next-compiler-source',
        source: {},
        artifact: { nativeTsConfigInputs: undefined },
      }
      const expected: any = {
        projectDir: '',
        artifactRoot: '',
        revision: '',
        profile: {},
        source: {},
        nativeImportCoverageRoles: capability,
      }
      await expect(
        retainNativeCompilerSourceAuthorization(
          value,
          expected,
          { compilation: {}, fact: {}, selection: {} } as any,
          new AbortController().signal
        )
      ).rejects.toThrow(
        /private compiler source capability|lease must return synchronously/
      )
    }
  )
  it.each(['value', 'expected', 'artifact'] as const)(
    'refuses own JS module role presence in %s before any getter',
    async (where) => {
      const { retainNativeCompilerSourceAuthorization } = await import(
        'next/dist/experimental/testing/coverage/source-authorization'
      )
      for (const key of ['configurationImports', 'runtimeConfigurationImports'])
        for (const marker of [undefined, null, false, {}, 'accessor']) {
          const getter = jest.fn(() => {
            throw new Error('unexpected module getter')
          })
          const artifact: any = {},
            value: any = { artifact },
            expected: any = {},
            native: any = {}
          const target =
            where === 'value'
              ? value
              : where === 'expected'
                ? expected
                : artifact
          Object.defineProperty(
            target,
            key,
            marker === 'accessor' ? { get: getter } : { value: marker }
          )
          Object.defineProperty(expected, 'profile', { get: getter })
          await expect(
            retainNativeCompilerSourceAuthorization(
              value,
              expected,
              native,
              new AbortController().signal
            )
          ).rejects.toThrow('separate JavaScript module authorization')
          expect(getter).not.toHaveBeenCalled()
        }
    }
  )
})

it('accepts text-summary with combined standard reporters without duplicates', async () => {
  const { parseStandardCoverageOptions } = await import(
    'next/dist/experimental/testing/coverage/options'
  )
  expect(
    parseStandardCoverageOptions({
      'coverage.reporter': ['text-summary', 'json', 'text-summary'],
    })?.reporter
  ).toEqual(['text-summary', 'json'])
})

it('publishes the pinned text summary after standard coverage with threshold failures', async () => {
  const { publishStandardCoverage } = await import(
    'next/dist/experimental/testing/coverage/report-standard'
  )
  const f = await standardReportFixture()
  try {
    await writeFile(
      join(f.root, 'unimported.mjs'),
      'export function untouched() {\n  return 9\n}\n'
    )
    const result = await publishStandardCoverage({
      projectDir: f.root,
      ...f,
      config: { ...f.config, reporter: ['text-summary', 'json'] },
      status: 'passed',
    })
    expect(result.published).toBe(true)
    expect(result.textSummary).toBe(
      '\n=============================== Coverage summary ===============================\n' +
        'Statements   : 40% ( 2/5 )\n' +
        'Branches     : 50% ( 1/2 )\n' +
        'Functions    : 33.33% ( 1/3 )\n' +
        'Lines        : 25% ( 1/4 )\n' +
        '================================================================================\n'
    )
    expect(result.thresholdErrors).toHaveLength(1)
    expect(result.files).toEqual([join(f.root, 'coverage/coverage-final.json')])
    expect(
      Object.keys(JSON.parse(await readFile(result.files![0], 'utf8')))
    ).toContain(f.file)
    const failed = await publishStandardCoverage({
      projectDir: f.root,
      ...f,
      config: { ...f.config, reporter: ['text-summary'] },
      status: 'failed',
    })
    expect(failed.published).toBe(false)
    expect(failed.textSummary).toBeUndefined()
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it('preserves the reference Unknown text summary for an empty coverage map', async () => {
  const { standardCoverageTextSummary } = await import(
    'next/dist/experimental/testing/coverage/report-standard'
  )
  expect(standardCoverageTextSummary({})).toBe(
    '\n=============================== Coverage summary ===============================\n' +
      'Statements   : Unknown% ( 0/0 )\n' +
      'Branches     : Unknown% ( 0/0 )\n' +
      'Functions    : Unknown% ( 0/0 )\n' +
      'Lines        : Unknown% ( 0/0 )\n' +
      '================================================================================\n'
  )
})

it('keeps JSX report ownership bound to the current source/profile/entry/revision plans', async () => {
  const { stdout } = await runNodeHelper(
    [join(__dirname, 'jsx-ownership.cjs')],
    { timeout: 30000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({ controls: 7, passed: 7 })
}, 40000)

it('retains actual JSX initializer and logical-child ownership while rejecting ambiguous compiler roles', async () => {
  const { stdout } = await runNodeHelper(
    [join(__dirname, 'jsx-owner-maps.cjs')],
    { timeout: 30000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({ controls: 46, passed: 46 })
}, 40000)

it('keeps fragment endpoints bound to unique compiler owners and the actual JSX profile', async () => {
  const { stdout } = await runNodeHelper(
    [join(__dirname, 'jsx-fragment-maps.cjs')],
    { timeout: 30000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({ controls: 66, passed: 66 })
}, 40000)

it('accepts and deduplicates explicit lcovonly while preserving the existing defaults', async () => {
  const { parseStandardCoverageOptions } = await import(
    'next/dist/experimental/testing/coverage/options'
  )
  expect(
    parseStandardCoverageOptions({
      'coverage.reporter': ['lcovonly', 'json', 'lcovonly'],
    })?.reporter
  ).toEqual(['lcovonly', 'json'])
  expect(
    parseStandardCoverageOptions({ 'coverage.include': ['subject.js'] })
      ?.reporter
  ).toEqual(['json', 'lcov'])
  expect(parseStandardCoverageOptions({ coverage: true })).toBeUndefined()
})

it('binds same-line if-return branch endpoints through actual compiler roles without changing counters', () => {
  const result = runNodeHelperSync([join(__dirname, 'if-return-maps.cjs')], {
    encoding: 'utf8',
    timeout: 30000,
  })
  expect(JSON.parse(result)).toEqual({ profiles: 2, controls: 44, passed: 44 })
})

it('binds conditional operands to unique authored and emitted roles without changing counters', () => {
  const result = runNodeHelperSync(
    [join(__dirname, 'conditional-operands.cjs')],
    { encoding: 'utf8', timeout: 30000 }
  )
  expect(JSON.parse(result)).toEqual({ profiles: 2, controls: 42, passed: 42 })
})

it('associates multiline JSX arrow endpoints only with unique real compiler terminal facts', async () => {
  const { stdout } = await runNodeHelper(
    [join(__dirname, 'jsx-multiline-maps.cjs')],
    { timeout: 30000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({ controls: 34, passed: 34 })
}, 40000)

it('binds parenthesized JSX return endpoints only through real unique compiler facts', async () => {
  const { stdout } = await runNodeHelper(
    [join(__dirname, 'jsx-return-maps.cjs')],
    { timeout: 30000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({ controls: 46, passed: 46 })
}, 40000)

it('binds multiline parenthesized logical JSX only through unique native compiler roles', async () => {
  const { stdout } = await runNodeHelper(
    [join(__dirname, 'jsx-multiline-logical-maps.cjs')],
    { timeout: 30000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({ controls: 92, passed: 92 })
}, 40000)

it('binds multiline Fragment coverage to actual native child and sibling mappings', async () => {
  const { stdout } = await runNodeHelper(
    [join(__dirname, 'jsx-multiline-fragment-maps.cjs')],
    { timeout: 30000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({ controls: 86, passed: 86 })
}, 40000)

it('retains actual parenthesis and owner map certificates for multiline JSX logical children', () => {
  const result = runNodeHelperSync(
    [join(__dirname, 'jsx-logical-shapes-maps.cjs')],
    { encoding: 'utf8', timeout: 30000 }
  )
  expect(JSON.parse(result)).toEqual({ controls: 172, passed: 172 })
})

it('binds constructor property descriptors only through actual compiler assignments and maps', () => {
  const result = runNodeHelperSync(
    [join(__dirname, 'parameter-property-maps.cjs')],
    { encoding: 'utf8', timeout: 30000 }
  )
  expect(JSON.parse(result)).toEqual({ controls: 170, passed: 170 })
})

it('binds runtime namespace descriptors through actual compiler IIFEs and publication mappings', () => {
  const result = runNodeHelperSync([join(__dirname, 'namespace-maps.cjs')], {
    encoding: 'utf8',
    timeout: 30000,
  })
  expect(JSON.parse(result)).toEqual({ controls: 68, passed: 68 })
})

it('binds enum member counters only through actual compiler owners, literal writes and maps', () => {
  const result = runNodeHelperSync([join(__dirname, 'enum-maps.cjs')], {
    encoding: 'utf8',
    timeout: 30000,
  })
  expect(JSON.parse(result)).toEqual({ controls: 270, passed: 270 })
})

it('binds typed class arrow fields only through actual class, key and terminal maps', () => {
  const result = runNodeHelperSync([join(__dirname, 'class-arrows-maps.cjs')], {
    encoding: 'utf8',
    timeout: 30000,
  })
  expect(JSON.parse(result)).toEqual({ controls: 60, passed: 60 })
})

it('binds class function endpoints only through actual owner, function, body and terminal roles', () => {
  const result = require('child_process').execFileSync(
    process.execPath,
    [join(__dirname, 'class-functions-maps.cjs')],
    { encoding: 'utf8' }
  )
  expect(JSON.parse(result)).toEqual({
    actualFixtures: 8,
    controls: 280,
    countersHeld: true,
    wholeDescriptorsHeldExceptQualifiedEnds: true,
    lateFieldFailureAtomic: true,
  })
})

it('binds constructor property call defaults only through unique real compiler roles', () => {
  const result = runNodeHelperSync(
    [join(__dirname, 'parameter-property-call-maps.cjs')],
    { encoding: 'utf8', timeout: 30000 }
  )
  expect(JSON.parse(result)).toEqual({ controls: 72, passed: 72 })
})

it('binds constructor property single-numeric-argument defaults through unique real compiler roles', () => {
  const result = runNodeHelperSync(
    [join(__dirname, 'parameter-property-literal-call-maps.cjs')],
    { encoding: 'utf8', timeout: 30000 }
  )
  expect(JSON.parse(result)).toEqual({ controls: 128, passed: 128 })
})

it.each(['next.test.config.mjs', 'vitest.config.mjs', 'vite.config.mjs'])(
  'separates test configuration edits from actual compiler inputs: %s',
  async (name) => {
    const {
      createCoverageSourcePlan,
      assertCoverageSourcePlan,
      assertCompilerSourceCoverage,
    } = await import(
      'next/dist/experimental/testing/coverage/source-analysis-plan'
    )
    const { createRuntimeConfigurationPlan, assertRuntimeConfigurationPlan } =
      await import(
        'next/dist/experimental/testing/coverage/runtime-configuration'
      )
    const source = await compilerSourcePlanFixture()
    const runtime = await runtimeConfigurationFixture()
    try {
      const sourceFile = join(source.root, name)
      const runtimeFile = join(runtime.root, name)
      await writeFile(
        sourceFile,
        'export default {test:{coverage:{thresholds:{lines:0}}}}'
      )
      await writeFile(
        runtimeFile,
        'export default {test:{coverage:{thresholds:{lines:0}}}}'
      )
      const sourceOptions = {
        projectDir: source.root,
        projects: source.projects,
        config: source.config,
        signal: source.signal,
      }
      const runtimeOptions = {
        projectDir: runtime.root,
        projects: [
          {
            profile,
            entries: [
              {
                id: runtime.artifact.entryId,
                file: runtime.entry.file,
                profile,
              },
            ],
          },
        ],
        signal: source.signal,
      }
      const sourcePlan = await createCoverageSourcePlan(sourceOptions)
      const runtimePlan = await createRuntimeConfigurationPlan(runtimeOptions)
      const compilerSourcePlan = await createCoverageSourcePlan({
        ...sourceOptions,
        inputs: [sourceFile],
      })
      const compilerRuntimePlan = await createRuntimeConfigurationPlan({
        ...runtimeOptions,
        inputs: [runtimeFile],
      })
      expect(sourcePlan.inputs.map((input) => input.file)).not.toContain(
        sourceFile
      )
      expect(runtimePlan.inputs.map((input) => input.file)).not.toContain(
        runtimeFile
      )
      await writeFile(
        sourceFile,
        '// authored edit\nexport default {test:{coverage:{thresholds:{lines:90}}}}'
      )
      await writeFile(
        runtimeFile,
        '// authored edit\nexport default {test:{coverage:{thresholds:{lines:90}}}}'
      )
      await expect(
        assertCoverageSourcePlan(sourcePlan, source.signal)
      ).resolves.toBeUndefined()
      await expect(
        assertRuntimeConfigurationPlan(runtimePlan, source.signal)
      ).resolves.toBeUndefined()
      await expect(
        assertCompilerSourceCoverage(source.facts, source.plan, source.signal)
      ).resolves.toHaveLength(1)
      await expect(
        assertCoverageSourcePlan(compilerSourcePlan, source.signal)
      ).rejects.toThrow('inputs changed after selection')
      await expect(
        assertRuntimeConfigurationPlan(compilerRuntimePlan, source.signal)
      ).rejects.toThrow('inputs changed after selection')
      await writeFile(
        join(source.root, 'next.config.mjs'),
        'export default {trailingSlash:true}'
      )
      await writeFile(
        join(runtime.root, 'next.config.mjs'),
        'export default {trailingSlash:true}'
      )
      await expect(
        assertCoverageSourcePlan(sourcePlan, source.signal)
      ).rejects.toThrow('inputs changed after selection')
      await expect(
        assertRuntimeConfigurationPlan(runtimePlan, source.signal)
      ).rejects.toThrow('inputs changed after selection')
    } finally {
      await rm(source.root, { recursive: true, force: true })
      await rm(runtime.root, { recursive: true, force: true })
    }
  }
)

describe('private settled suite coverage observations', () => {
  const reference = { suiteId: 'suite', index: 0 }
  const failure: ResultEvent = {
    version: 1,
    runId: 'run',
    timestamp: 0,
    type: 'diagnostic',
    entryId: 'entry',
    revision: 'revision',
    suiteError: reference,
    diagnostic: {
      severity: 'error',
      phase: 'runtime',
      message: 'authored afterAll',
    },
  }

  it('marks the authored carrier only when disposal throws the same raw Error', async () => {
    const { createCollector } = await import(
      'next/dist/experimental/testing/runner/collector'
    )
    const { runCollected, isSettledAuthoredAfterAllFailure } = await import(
      'next/dist/experimental/testing/runner/lifecycle'
    )
    const collector = createCollector('carrier-identity')
    const error = new Error('same authored and integration error')
    const before = Object.getOwnPropertyDescriptors(error)
    collector.api.test('body', () => {})
    collector.api.afterAll(() => {
      throw error
    })
    await collector.settle()
    const scope = () => ({ async finalize() {}, async dispose() {} })
    const result = await runCollected(
      collector.close(),
      {
        runId: 'carrier-run',
        signal: new AbortController().signal,
        captureCoverageCompletion: true,
      },
      () => {},
      {
        beginFileFixtures: scope,
        beginHook(context) {
          return {
            async finalize() {},
            async dispose() {
              if (context.hook === 'afterAll') throw error
            },
          }
        },
        setActiveHook() {},
      }
    )
    expect(result.errors).toHaveLength(2)
    expect(result.errors.map((failure) => failure.error)).toEqual([
      error,
      error,
    ])
    expect(result.errors.map(isSettledAuthoredAfterAllFailure)).toEqual([
      true,
      false,
    ])
    expect(Object.getOwnPropertyDescriptors(error)).toEqual(before)
  })

  it('keeps a suite error provisional until the matching joined completion', async () => {
    const { createCoverageAttemptTracker } = await import(
      'next/dist/experimental/testing/execution/coverage'
    )
    const tracker = createCoverageAttemptTracker({
      deferSettledSuiteErrors: true,
    })
    tracker.observe(failure)
    expect(tracker.complete).toBe(false)
    tracker.observeCoverageCompletion(true)
    expect(tracker.complete).toBe(false)
    tracker.authorizeSettledSuiteErrors([reference])
    expect(tracker.complete).toBe(true)
    expect(() => tracker.authorizeSettledSuiteErrors([reference])).toThrow(
      'repeated'
    )
  })

  it('refuses missing, foreign, duplicate and invalid suite references', async () => {
    const { createCoverageAttemptTracker } = await import(
      'next/dist/experimental/testing/execution/coverage'
    )
    for (const observed of [
      [],
      [{ suiteId: 'foreign', index: 0 }],
      [reference, reference],
      [{ suiteId: 'suite', index: -1 }],
      {},
    ]) {
      const tracker = createCoverageAttemptTracker({
        deferSettledSuiteErrors: true,
      })
      tracker.observe(failure)
      tracker.observeCoverageCompletion(true)
      expect(() => tracker.authorizeSettledSuiteErrors(observed)).toThrow()
      expect(tracker.complete).toBe(false)
    }
  })

  it('preserves ordinary V8 diagnostic vetoes and unrelated cleanup failures', async () => {
    const { createCoverageAttemptTracker } = await import(
      'next/dist/experimental/testing/execution/coverage'
    )
    const legacy = createCoverageAttemptTracker()
    legacy.observe(failure)
    legacy.observeCoverageCompletion(true)
    expect(legacy.complete).toBe(false)
    expect(() => legacy.authorizeSettledSuiteErrors([reference])).toThrow(
      'Unrequested'
    )
    for (const phase of ['runtime', 'cleanup'] as const) {
      const tracker = createCoverageAttemptTracker({
        deferSettledSuiteErrors: true,
      })
      tracker.observe(failure)
      tracker.observe({
        ...failure,
        suiteError: undefined,
        diagnostic: {
          severity: 'error',
          phase,
          message: 'actual host failure',
        },
      })
      tracker.observeCoverageCompletion(true)
      tracker.authorizeSettledSuiteErrors([reference])
      expect(tracker.complete).toBe(false)
    }
  })

  it('does not authorize incomplete capture or a suite reference received twice', async () => {
    const { createCoverageAttemptTracker } = await import(
      'next/dist/experimental/testing/execution/coverage'
    )
    const tracker = createCoverageAttemptTracker({
      deferSettledSuiteErrors: true,
    })
    tracker.observe(failure)
    tracker.observe(failure)
    tracker.observeCoverageCompletion(false)
    tracker.authorizeSettledSuiteErrors([reference])
    expect(tracker.complete).toBe(false)
  })
})

describe('private settled file fixture coverage slots', () => {
  const owner = { runId: 'run', entryId: 'entry', revision: 'revision' }
  const diagnostic = {
    severity: 'error' as const,
    phase: 'cleanup' as const,
    message: 'settled file fixture',
    stack: 'exact authored frame',
  }
  const failure: ResultEvent = {
    version: 1,
    timestamp: 0,
    type: 'diagnostic',
    ...owner,
    coverageFileError: { index: 2 },
    diagnostic,
  }
  const reference = { index: 2, diagnostic }
  async function tracker() {
    const { createCoverageAttemptTracker } = await import(
      'next/dist/experimental/testing/execution/coverage'
    )
    return createCoverageAttemptTracker({
      deferSettledFileErrors: true,
      fileErrorOwner: owner,
    })
  }
  it('requires the exact actual owner and complete serialized carrier after joins', async () => {
    const actual = await tracker()
    actual.observe(failure)
    expect(actual.complete).toBe(false)
    expect(() => actual.authorizeSettledFileErrors([reference])).toThrow(
      'Unrequested'
    )
    actual.observeCoverageCompletion(true)
    actual.authorizeSettledFileErrors([reference])
    expect(actual.complete).toBe(true)
    expect(() => actual.authorizeSettledFileErrors([reference])).toThrow(
      'repeated'
    )
  })
  it('rejects missing, duplicate, unsolicited, payload-mutated and malformed slots', async () => {
    for (const refs of [
      [],
      [reference, reference],
      [{ ...reference, index: 1 }],
      [{ ...reference, diagnostic: { ...diagnostic, message: 'other' } }],
      [{ ...reference, diagnostic: { ...diagnostic, stack: undefined } }],
      [{ ...reference, extra: true }],
      [{ ...reference, index: -1 }],
      {},
    ]) {
      const actual = await tracker()
      actual.observe(failure)
      actual.observeCoverageCompletion(true)
      expect(() => actual.authorizeSettledFileErrors(refs)).toThrow()
      expect(actual.complete).toBe(false)
    }
  })
  it('retains foreign-owner, duplicate-event, unmarked-host and incomplete vetoes', async () => {
    for (const changes of [
      { runId: 'other' },
      { entryId: 'other' },
      { revision: 'other' },
      { coverageFileError: undefined },
      { diagnostic: { ...diagnostic, phase: 'runtime' as const } },
    ]) {
      const actual = await tracker()
      actual.observe({ ...failure, ...changes })
      actual.observeCoverageCompletion(true)
      expect(() => actual.authorizeSettledFileErrors([reference])).toThrow()
      expect(actual.complete).toBe(false)
    }
    for (const complete of [false, true]) {
      const actual = await tracker()
      actual.observe(failure)
      actual.observe(failure)
      actual.observeCoverageCompletion(complete)
      actual.authorizeSettledFileErrors([reference])
      expect(actual.complete).toBe(false)
    }
  })
  it('does not permit the option without a concrete execution owner', async () => {
    const { createCoverageAttemptTracker } = await import(
      'next/dist/experimental/testing/execution/coverage'
    )
    expect(() =>
      createCoverageAttemptTracker({ deferSettledFileErrors: true })
    ).toThrow('actual execution owner')
  })
})

it('authorizes actual file-fixture carriers separately when final disposal reuses the same Error', async () => {
  const { createCollector } = await import(
    'next/dist/experimental/testing/runner/collector'
  )
  const { runCollected, isSettledCoverageFailure } = await import(
    'next/dist/experimental/testing/runner/lifecycle'
  )
  const collector = createCollector('file-fixture-carrier')
  const error = new Error('same file fixture and integration error')
  const before = Object.getOwnPropertyDescriptors(error)
  const scoped = collector.api.test.extend({
    value: [
      // eslint-disable-next-line no-empty-pattern -- Fixture dependency introspection requires this binding.
      async ({}, use) => {
        await use(1)
        throw error
      },
      { scope: 'file' },
    ],
  })
  scoped('completed body', ({ value }) => expect(value).toBe(1))
  await collector.settle()
  const result = await runCollected(
    collector.close(),
    {
      runId: 'file-fixture-run',
      signal: new AbortController().signal,
      captureCoverageCompletion: true,
    },
    () => {},
    {
      beginFileFixtures: () => ({
        async finalize() {},
        async dispose() {
          throw error
        },
      }),
      beginHook: () => ({ async finalize() {}, async dispose() {} }),
      setActiveHook() {},
    }
  )
  expect(result.cases.map((row) => row.status)).toEqual(['passed'])
  expect(result.errors.map((row) => row.error)).toEqual([error, error])
  expect(result.errors.map(isSettledCoverageFailure)).toEqual([true, false])
  expect(Object.getOwnPropertyDescriptors(error)).toEqual(before)
})

describe('actual private mock restoration primitive', () => {
  it.each(['node', 'browser'])(
    'preserves exact restoration calls and inactive public shape for %s',
    async (realm) => {
      const { execFileSync } = await import('node:child_process')
      await withOutputDirectory(
        'next-restore-primitive-',
        async (output) => {
          execFileSync(
            process.execPath,
            [
              join(__dirname, 'mock-restoration-primitive.mjs'),
              join(__dirname, '../../..'),
              output,
              realm,
            ],
            {
              env: { ...process.env, TURBO_TASKS_AVAILABLE_PARALLELISM: '4' },
              stdio: 'pipe',
              timeout: 35000,
            }
          )
          expect(
            JSON.parse(await readFile(join(output, 'VERIFIED.json'), 'utf8'))
          ).toMatchObject({
            realm,
            passed: 10,
            actualRestoreRegistry: true,
            noFileDisposalAuthorization: true,
            publicMockKeysUnchanged: true,
          })
        },
        { cleanup: 'always' }
      )
    },
    40000
  )
})

describe('actual assertion-finish restoration occurrences', () => {
  it.each([
    'plain',
    'unrequested',
    'override',
    'reset',
    'clear',
    'missing-sdk',
    'malformed-sdk',
    'file-plain',
    'file-unrequested',
    'file-undefined-cleanup',
    'file-mixed-same-error',
    'successful-file-omitted',
    'successful-file-requested',
    'eligibility-true',
    'eligibility-false',
    'eligibility-truthy',
    'eligibility-throw',
    'eligibility-same-error',
    'eligibility-malformed',
    'unrequested-eligibility-getter',
  ])(
    'preserves actual restoration and independent cleanup ownership: %s',
    async (mode) => {
      const { execFileSync } = await import('node:child_process')
      await withOutputDirectory(
        'next-restoration-finish-',
        async (output) => {
          execFileSync(
            process.execPath,
            [
              join(__dirname, 'mock-restoration-finish.mjs'),
              join(__dirname, '../../..'),
              output,
              mode,
            ],
            {
              env: { ...process.env, TURBO_TASKS_AVAILABLE_PARALLELISM: '4' },
              stdio: 'pipe',
              timeout: 35000,
            }
          )
          expect(
            JSON.parse(await readFile(join(output, 'VERIFIED.json'), 'utf8'))
          ).toMatchObject({ mode, rawErrorFieldsUnchanged: true })
        },
        { cleanup: 'always' }
      )
    },
    40000
  )
})

describe('actual one-shot V8 restoration owner', () => {
  it('requires exact positive ownership in addition to the existing isolated V8 profile', async () => {
    const { captureNodeV8CollectionRestorationCoverage } = await import(
      'next/dist/experimental/testing/execution/coverage'
    )
    const profile = {
      id: 'restoration-owner',
      mode: 'development' as const,
      environment: 'node' as const,
      runtime: 'nodejs' as const,
      bundler: 'turbopack' as const,
    }
    const artifact: CompiledTestArtifact = {
      version: 2,
      kind: 'node',
      profile,
      entryId: 'entry',
      revision: 'actual',
      rootDir: '/restoration-owner',
      entryPath: 'entry.js',
      files: [],
      diagnostics: [],
      coverage: { version: 1, scripts: [], sources: {} },
    }
    const request = {
      entry: {
        id: 'entry',
        file: '/restoration-owner/entry.test.mjs',
        profile,
      },
      coverage: { version: 1 as const, kind: 'node-line' as const },
    }
    expect(captureNodeV8CollectionRestorationCoverage(artifact, request)).toBe(
      false
    )
    for (const value of [undefined, false, 'true', 1, {}])
      expect(
        Reflect.apply(captureNodeV8CollectionRestorationCoverage, undefined, [
          artifact,
          { ...request, captureOneShotV8CollectionRestoration: value },
        ])
      ).toBe(false)
    const owned = {
      ...request,
      captureOneShotV8CollectionRestoration: true as const,
    }
    expect(captureNodeV8CollectionRestorationCoverage(artifact, owned)).toBe(
      true
    )
    expect(
      captureNodeV8CollectionRestorationCoverage(
        { ...artifact, profile: { ...profile, mode: 'production' } },
        owned
      )
    ).toBe(false)
    expect(
      captureNodeV8CollectionRestorationCoverage(artifact, {
        ...owned,
        collectOnly: true,
      })
    ).toBe(false)
    expect(
      captureNodeV8CollectionRestorationCoverage(artifact, {
        ...owned,
        entry: { ...request.entry, file: '/restoration-owner/entry.test.ts' },
      })
    ).toBe(false)
    expect(
      Object.hasOwn(request, 'captureOneShotV8CollectionRestoration')
    ).toBe(false)
  })
})

it('keeps readonly snapshot bookkeeping unobservable to ordinary Set constructors', async () => {
  const { execFileSync } = await import('node:child_process')
  const output = await mkdtemp(join(tmpdir(), 'next-readonly-snapshot-sets-'))
  const counts: number[] = []
  try {
    for (const mode of ['successful-omitted', 'successful-requested']) {
      const directory = join(output, mode)
      execFileSync(
        process.execPath,
        [
          join(__dirname, 'read-only-snapshot-finish.mjs'),
          join(__dirname, '../../..'),
          directory,
          mode,
        ],
        {
          env: { ...process.env, CI: '1', NODE_ENV: 'development' },
          stdio: 'pipe',
          timeout: 35000,
        }
      )
      const receipt = JSON.parse(
        await readFile(join(directory, 'VERIFIED.json'), 'utf8')
      )
      counts.push(receipt.setConstructors)
      expect(receipt).toMatchObject({
        actualFile: true,
        actualSnapshotFinishOnce: true,
        rootEvents: 1,
        actualLogicalObsolete: false,
      })
    }
    // The actual pre-finalizer runtime creates nineteen Sets in both profiles.
    expect(counts).toEqual([19, 19])
  } finally {
    await rm(output, { recursive: true, force: true })
  }
}, 80000)

describe('root coverage formatter inherited by multiple inline projects admission facts', () => {
  const projects = () =>
    ['a', 'b'].map((id) => {
      const profile = {
        id,
        mode: 'development' as const,
        environment: 'node' as const,
        runtime: 'nodejs' as const,
        bundler: 'turbopack' as const,
      }
      return {
        profile,
        isolate: true,
        entries: [
          {
            id: id + ':contract.test.mjs',
            file: '/project/contract.test.mjs',
            profile,
          },
        ],
      }
    })
  it('requires the real existing prepare callback rather than metadata presence', async () => {
    const { canUpdateMultipleRootProjectThresholds } = await import(
      'next/dist/experimental/testing/coverage/threshold-format'
    )
    for (const value of [undefined, null, false, true, {}, 'function'])
      expect(canUpdateMultipleRootProjectThresholds(projects(), value)).toBe(
        false
      )
    expect(
      canUpdateMultipleRootProjectThresholds(projects(), async () => undefined)
    ).toBe(true)
    const defaults = projects().map(({ isolate: _isolate, ...value }) => value)
    expect(
      canUpdateMultipleRootProjectThresholds(defaults, async () => undefined)
    ).toBe(true)
  })
  it('keeps empty/single-project selection on the original path', async () => {
    const { canUpdateMultipleRootProjectThresholds } = await import(
      'next/dist/experimental/testing/coverage/threshold-format'
    )
    expect(
      canUpdateMultipleRootProjectThresholds([], async () => undefined)
    ).toBe(false)
    expect(
      canUpdateMultipleRootProjectThresholds(
        projects().slice(0, 1),
        async () => undefined
      )
    ).toBe(false)
  })
  it.each([
    [
      'shared execution',
      (p: any[]) => {
        p[1].isolate = false
      },
    ],
    [
      'project realm',
      (p: any[]) => {
        p[1].executionEnvironment = {}
      },
    ],
    [
      'entry realm',
      (p: any[]) => {
        p[1].entries[0].executionEnvironment = {}
      },
    ],
    [
      'project typecheck',
      (p: any[]) => {
        p[1].typecheck = { enabled: true }
      },
    ],
    [
      'entry typecheck',
      (p: any[]) => {
        p[1].entries[0].typecheck = true
      },
    ],
    [
      'empty entries',
      (p: any[]) => {
        p[1].entries = []
      },
    ],
    [
      'mixed mode',
      (p: any[]) => {
        p[1].profile = { ...p[1].profile, mode: 'production' }
      },
    ],
    [
      'project RSC',
      (p: any[]) => {
        p[1].profile = { ...p[1].profile, environment: 'rsc' }
      },
    ],
    [
      'entry RSC',
      (p: any[]) => {
        p[1].entries[0].profile = { ...p[1].profile, environment: 'rsc' }
      },
    ],
    [
      'project route',
      (p: any[]) => {
        p[1].profile = { ...p[1].profile, route: '/' }
      },
    ],
    [
      'entry route',
      (p: any[]) => {
        p[1].entries[0].profile = { ...p[1].profile, route: '/' }
      },
    ],
    [
      'Browser client',
      (p: any[]) => {
        p[1].profile = { ...p[1].profile, browserClient: true }
      },
    ],
    [
      'edge runtime',
      (p: any[]) => {
        p[1].profile = { ...p[1].profile, runtime: 'edge' }
      },
    ],
    [
      'webpack',
      (p: any[]) => {
        p[1].profile = { ...p[1].profile, bundler: 'webpack' }
      },
    ],
  ] as const)(
    'keeps %s closed for the actual selected graph',
    async (_label, change) => {
      const { canUpdateMultipleRootProjectThresholds } = await import(
        'next/dist/experimental/testing/coverage/threshold-format'
      )
      const selected = projects()
      change(selected)
      expect(
        canUpdateMultipleRootProjectThresholds(selected, async () => undefined)
      ).toBe(false)
    }
  )
})

describe('independent expected coverage fixture encoding', () => {
  it('retains explicit IDs, malformed locations, omitted fields and fresh values', () => {
    const compact = {
      $coverage: 'range-tuples-v1',
      path: 'subject.mjs',
      statements: {
        7: [2, 1, 3, null],
        missing: { start: {}, end: {} },
      },
      functions: {
        5: { name: 'choose', decl: [1, 0, 1, 9], loc: [2, 1, 3, null] },
      },
      branches: {
        9: {
          type: 'if',
          line: null,
          loc: [2, 1, 3, null],
          locations: [[2, 1, 2, 8]],
        },
      },
      s: { 7: 2, missing: 0 },
      f: { 5: 1 },
      b: { 9: [1] },
    }
    const first = expandExpectedCoverageFixture(compact)
    const second = parseExpectedCoverageFixture(JSON.stringify(compact))
    expect(Object.keys(first)).toEqual([
      'path',
      'statementMap',
      'fnMap',
      'branchMap',
      's',
      'f',
      'b',
    ])
    expect(first.statementMap['7']).toEqual({
      start: { line: 2, column: 1 },
      end: { line: 3, column: null },
    })
    expect(first.statementMap.missing).toEqual({ start: {}, end: {} })
    expect(Object.hasOwn(first.fnMap['5'], 'line')).toBe(false)
    expect(first.branchMap['9'].line).toBeNull()
    expect(first).toEqual(second)
    first.fnMap['5'].loc.start.column = 20
    first.s['7'] = 20
    expect(second.fnMap['5'].loc.start.column).toBe(1)
    expect(second.s['7']).toBe(2)
    expect(compact.functions['5'].loc).toEqual([2, 1, 3, null])
    const revived = parseExpectedCoverageFixture(
      JSON.stringify(compact),
      (key: string, value: any) =>
        key === 'column' && value === null ? Infinity : value
    )
    expect(revived.statementMap['7'].end.column).toBe(Infinity)
    expect(revived.branchMap['9'].line).toBeNull()
    expect(expandExpectedCoverageFixture({ loc: [1, 2, 3, 4] })).toEqual({
      loc: [1, 2, 3, 4],
    })
    expect(() =>
      expandExpectedCoverageFixture({ ...compact, $coverage: 'future' })
    ).toThrow('Unknown expected coverage fixture format')
    expect(() =>
      expandExpectedCoverageFixture({ ...compact, statements: { 7: [1, 2] } })
    ).toThrow('four coordinates')
  })

  it('uses native reviver invocation when its call property is overridden', () => {
    const text = '{"value":1}'
    const reviver = (_key: string, value: any) =>
      typeof value === 'number' ? value + 1 : value
    Object.defineProperty(reviver, 'call', {
      value: () => {
        throw new Error('reviver.call must not be used')
      },
    })
    expect(parseExpectedCoverageFixture(text, reviver)).toEqual(
      JSON.parse(text, reviver)
    )
  })

  it.each([
    'frozen replacement',
    'frozen deletion',
    'array deletion',
    'function sibling',
  ])('preserves native JSON reviver behavior for %s', (kind) => {
    const text = '{"a":1,"b":2,"items":[1,2]}'
    function run(
      parse: (
        text: string,
        reviver: (this: any, key: string, value: any) => any
      ) => any
    ) {
      const calls: string[] = []
      const value = parse(text, function (this: any, key: string, value: any) {
        calls.push(key)
        if (key === 'a' && kind.startsWith('frozen')) {
          Object.freeze(this)
          return kind === 'frozen deletion' ? undefined : 20
        }
        if (kind === 'array deletion' && key === '0') return undefined
        if (kind === 'function sibling') {
          if (key === 'a') this.b = Object.assign(() => {}, { child: 1 })
          if (key === 'child') return value + 1
          if (key === 'b') return value.child
        }
        return value
      })
      return { value, calls, itemKeys: Object.keys(value.items) }
    }
    expect(run(parseExpectedCoverageFixture)).toEqual(run(JSON.parse))
  })
})

import { EventEmitter } from 'node:events'
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

it.each([false, true])(
  'restores authored statement spans from actual V8 ranges and rejects missing associations (generated semicolon: %s)',
  async (semicolon) => {
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
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
      await promisify(execFile)(process.execPath, [
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
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
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
  await promisify(execFile)(process.execPath, [
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

it('prevents compiler-only analysis artifacts from entering execution or runtime remapping', async () => {
  const { assertArtifactProfile } = await import(
    'next/dist/experimental/testing/execution/artifact-profile'
  )
  const { remapStandardCoverage } = await import(
    'next/dist/experimental/testing/coverage/istanbul'
  )
  const { startCoverage } = await import(
    'next/dist/experimental/testing/coverage/collector'
  )
  const { assertCoverageRequest, assertCoverageCompletion } = await import(
    'next/dist/experimental/testing/execution/coverage'
  )
  const {
    assertCustomCoverageRequest,
    assertCustomCoverageCompletion,
    captureCustomCoverageClosure,
  } = await import('next/dist/experimental/testing/coverage/custom-runtime')
  const owned = await typedCompilerAnalysisFixture()
  try {
    expect(() =>
      assertArtifactProfile(owned.compiled.artifact, {
        id: owned.compiled.artifact.entryId,
        file: owned.subject,
        profile,
      })
    ).toThrow('Compile-only coverage sources cannot be executed')
    const entry = {
      id: owned.compiled.artifact.entryId,
      file: owned.subject,
      profile,
    }
    expect(() => assertCoverageRequest(owned.compiled.artifact, {})).toThrow(
      'cannot enter runtime capture'
    )
    expect(() =>
      assertCoverageCompletion(undefined, owned.compiled.artifact, 'run')
    ).toThrow('cannot enter runtime capture')
    expect(() =>
      assertCustomCoverageRequest(owned.compiled.artifact, { entry })
    ).toThrow('cannot enter runtime capture')
    expect(() =>
      assertCustomCoverageCompletion(
        undefined,
        owned.compiled.artifact,
        'run',
        {} as any
      )
    ).toThrow('cannot enter runtime capture')
    await expect(
      captureCustomCoverageClosure(owned.compiled.artifact, entry)
    ).rejects.toThrow('cannot enter runtime capture')
    await expect(startCoverage(owned.compiled.artifact)).rejects.toThrow(
      'cannot enter runtime capture'
    )
    const { sourceAnalysis: _role, ...runtimeCoverage } =
      owned.compiled.artifact.coverage!
    await expect(
      (
        await import('next/dist/experimental/testing/coverage/source-analysis')
      ).analyzeCompiledCoverageSource(
        {
          ...owned.compiled,
          artifact: { ...owned.compiled.artifact, coverage: runtimeCoverage },
        },
        owned.expected,
        new AbortController().signal
      )
    ).rejects.toThrow('Unrequested or incompatible')
    await expect(
      remapStandardCoverage(owned.compiled.artifact, owned.capture)
    ).rejects.toThrow('Unsupported coverage capture or artifact')
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

it('retains the compile-only artifact lease until the parent broker derives declarations and acknowledges without runtime facts', async () => {
  const { createExecutionBrokerHost, createExecutionBrokerClient } =
    await import('next/dist/experimental/testing/execution/broker')
  const { analyzeCompiledCoverageSource } = await import(
    'next/dist/experimental/testing/coverage/source-analysis'
  )
  const owned = await typedCompilerAnalysisFixture(),
    signal = new AbortController().signal
  const requests: string[] = [],
    replies: unknown[] = [],
    parentFacts: unknown[] = []
  let release!: () => void, entered!: () => void
  const held = new Promise<void>((resolve) => {
      release = resolve
    }),
    started = new Promise<void>((resolve) => {
      entered = resolve
    })
  const client = createExecutionBrokerClient({
    allowCoverage: true,
    send: async (message) => {
      requests.push(message.action)
      expect(host.handle(message)).toBe(true)
    },
  })
  const host = createExecutionBrokerHost({
    signal,
    onCoverageSource: async (compiled, parentSignal) => {
      entered()
      await held
      parentFacts.push(
        await analyzeCompiledCoverageSource(
          compiled,
          owned.expected,
          parentSignal
        )
      )
    },
    send: async (message) => {
      replies.push(message)
      expect(client.handle(message)).toBe(true)
    },
  })
  try {
    let closed = false
    const pending = client
      .analyzeCoverageSource(owned.compiled, signal)
      .then(() => {
        closed = true
      })
    await started
    expect(closed).toBe(false)
    expect(parentFacts).toEqual([])
    release()
    await pending
    expect(requests).toEqual(['source-analysis'])
    expect(parentFacts).toMatchObject([
      { kind: 'next-compiler-declarations', data: { f: { 0: 0 } } },
    ])
    expect(replies).toEqual([
      {
        type: 'execution-broker-response',
        id: expect.any(String),
        action: 'source-analysis-result',
      },
    ])
  } finally {
    await host.close()
    client.disconnect(new Error('control closed'))
    await rm(owned.root, { recursive: true, force: true })
  }
})

it('requires explicit parent authorization for compiler analysis independently of runtime coverage permission', async () => {
  const { createExecutionBrokerHost, createExecutionBrokerClient } =
    await import('next/dist/experimental/testing/execution/broker')
  const owned = await typedCompilerAnalysisFixture(),
    signal = new AbortController().signal
  const client = createExecutionBrokerClient({
    allowCoverage: true,
    send: async (message) => {
      host.handle(message)
    },
  })
  const host = createExecutionBrokerHost({
    signal,
    allowCoverage: true,
    send: async (message) => {
      client.handle(message)
    },
  })
  try {
    await expect(
      client.analyzeCoverageSource(owned.compiled, signal)
    ).rejects.toThrow('Unrequested compiler coverage source analysis')
  } finally {
    await host.close()
    client.disconnect(new Error('control closed'))
    await rm(owned.root, { recursive: true, force: true })
  }
})

it.each(['result', 'coverage', 'event', 'opaque-ack'] as const)(
  'rejects runtime or opaque broker payloads in a compiler-only request: %s',
  async (kind) => {
    const { createExecutionBrokerClient } = await import(
      'next/dist/experimental/testing/execution/broker'
    )
    const owned = await typedCompilerAnalysisFixture(),
      signal = new AbortController().signal
    let sent!: (message: any) => void
    const request = new Promise<any>((resolve) => {
      sent = resolve
    })
    const client = createExecutionBrokerClient({
      allowCoverage: true,
      send: async (message) => {
        sent(message)
      },
    })
    try {
      const pending = client.analyzeCoverageSource(owned.compiled, signal)
      const message = await request
      const response = {
        type: 'execution-broker-response',
        id: message.id,
        action: kind === 'opaque-ack' ? 'source-analysis-result' : kind,
        ...(kind === 'opaque-ack'
          ? { facts: [{ kind: 'next-compiler-declarations' }] }
          : {}),
      }
      expect(() => client.handle(response)).toThrow(
        kind === 'opaque-ack'
          ? 'acknowledgement cannot contain runtime facts'
          : 'Runtime broker response cannot complete compiler coverage analysis'
      )
      client.disconnect(new Error('retire invalid broker generation'))
      await expect(pending).rejects.toThrow('retire invalid broker generation')
    } finally {
      client.disconnect(new Error('control closed'))
      await rm(owned.root, { recursive: true, force: true })
    }
  }
)

it('withholds compiler declarations when cancellation reaches a held parent analysis', async () => {
  const { createExecutionBrokerHost, createExecutionBrokerClient } =
    await import('next/dist/experimental/testing/execution/broker')
  const owned = await typedCompilerAnalysisFixture(),
    controller = new AbortController(),
    parent = new AbortController()
  let entered!: () => void
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  const replies: string[] = []
  const client = createExecutionBrokerClient({
    allowCoverage: true,
    send: async (message) => {
      host.handle(message)
    },
  })
  const host = createExecutionBrokerHost({
    signal: parent.signal,
    onCoverageSource: async (_compiled, signal) => {
      entered()
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        })
      )
    },
    send: async (message) => {
      replies.push(message.action)
      client.handle(message)
    },
  })
  try {
    const pending = client.analyzeCoverageSource(
      owned.compiled,
      controller.signal
    )
    await started
    controller.abort(new Error('cancel held analysis'))
    await expect(pending).rejects.toThrow('Test file cancelled')
    expect(replies).toEqual(['error'])
  } finally {
    await host.close()
    client.disconnect(new Error('control closed'))
    await rm(owned.root, { recursive: true, force: true })
  }
})

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
  expect(() =>
    parseStandardCoverageOptions({ 'coverage.reporter': ['html'] })
  ).toThrow('unsupported')
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

describe('owned browser precise coverage protocol', () => {
  const initializer =
    "(() => {\n      \nif (self.ServiceWorkerContainer) ServiceWorkerContainer.prototype.register = async () => { console.warn('Service Worker registration blocked by Playwright'); };\n\n    })();"
  const emitted = 'globalThis.coverageSubject = 1;'
  const engineSource =
    '(() => { globalThis.parentEngineInitializer = true; })();'
  const engineFact = {
    source: engineSource,
    url: 'next-test-engine-brand://parent-issued',
    scriptId: 'engine',
    executionContextId: 1,
    contextUniqueId: 'realm',
    frameId: 'frame',
  }
  const url = 'http://127.0.0.1:4321/__next_test/owner/'

  function protocol(
    options: {
      unknownAnonymous?: boolean
      missingCapture?: boolean
      hold?: string
      engine?: {
        fact?: Partial<typeof engineFact>
        unissued?: boolean
        afterAsset?: boolean
        missingCapture?: boolean
        duplicate?: boolean
        revokedBeforeCapture?: boolean
        revokedDuringRead?: boolean
        revokedAfterCapture?: boolean
        changedDuringRead?: boolean
        rangeCount?: number
      }
    } = {}
  ) {
    let rejectHeld!: (reason: unknown) => void
    let heldStarted!: () => void
    const holding = new Promise<void>((resolve) => {
      heldStarted = resolve
    })
    const calls: string[] = []
    let factLive = !options.engine?.revokedBeforeCapture,
      registrationChanged = false
    const readEngineFact = () => {
      if (!factLive) throw new Error('Parent engine registration was revoked')
      return {
        ...engineFact,
        ...options.engine?.fact,
        ...(registrationChanged
          ? { url: engineFact.url + '-replacement' }
          : {}),
      }
    }
    const pageSession = new EventEmitter() as any
    const targetSession = new EventEmitter() as any
    ;[pageSession, targetSession].forEach((session) => {
      session.detach = jest.fn(async () => {
        calls.push('detach')
      })
      session.send = jest.fn(async (method: string, params: any) => {
        calls.push(method)
        if (
          method === 'Profiler.stopPreciseCoverage' &&
          options.engine?.revokedAfterCapture
        )
          factLive = false
        if (method === options.hold) {
          heldStarted()
          return await new Promise((_, reject) => {
            rejectHeld = reject
          })
        }
        if (method === 'Target.getTargetInfo')
          return { targetInfo: { targetId: 'target', type: 'page' } }
        if (method === 'Page.getFrameTree')
          return { frameTree: { frame: { id: 'frame' } } }
        if (method === 'Profiler.startPreciseCoverage') {
          pageSession.emit('Runtime.executionContextCreated', {
            context: {
              id: 1,
              uniqueId: 'realm',
              origin: new URL(url).origin,
              auxData: { isDefault: true, type: 'default', frameId: 'frame' },
            },
          })
          pageSession.emit('Debugger.scriptParsed', {
            scriptId: 'initializer',
            url: '',
            executionContextId: 1,
          })
          if (options.engine && !options.engine.afterAsset)
            pageSession.emit('Debugger.scriptParsed', {
              scriptId: engineFact.scriptId,
              url: engineFact.url,
              executionContextId: 1,
            })
          pageSession.emit('Debugger.scriptParsed', {
            scriptId: 'entry',
            url: new URL('/_next/entry.js', url).href,
            executionContextId: 1,
          })
          if (options.engine?.afterAsset)
            pageSession.emit('Debugger.scriptParsed', {
              scriptId: engineFact.scriptId,
              url: engineFact.url,
              executionContextId: 1,
            })
          if (options.engine?.duplicate)
            pageSession.emit('Debugger.scriptParsed', {
              scriptId: 'engine-copy',
              url: engineFact.url,
              executionContextId: 1,
            })
        }
        if (method === 'Profiler.takePreciseCoverage' && options.missingCapture)
          pageSession.emit('Debugger.scriptParsed', {
            scriptId: 'omitted',
            url: new URL('/_next/entry.js', url).href,
            executionContextId: 1,
          })
        if (method === 'Profiler.takePreciseCoverage')
          return {
            result: [
              {
                scriptId: 'initializer',
                functions: [
                  {
                    isBlockCoverage: true,
                    ranges: [
                      {
                        startOffset: 0,
                        endOffset: initializer.length,
                        count: 1,
                      },
                    ],
                  },
                ],
              },
              ...(options.engine && !options.engine.missingCapture
                ? [
                    {
                      scriptId: engineFact.scriptId,
                      functions: [
                        {
                          isBlockCoverage: true,
                          ranges: [
                            {
                              startOffset: 0,
                              endOffset: engineSource.length,
                              count: options.engine.rangeCount ?? 1,
                            },
                          ],
                        },
                      ],
                    },
                  ]
                : []),
              ...(options.engine?.duplicate
                ? [
                    {
                      scriptId: 'engine-copy',
                      functions: [
                        {
                          isBlockCoverage: true,
                          ranges: [
                            {
                              startOffset: 0,
                              endOffset: engineSource.length,
                              count: 1,
                            },
                          ],
                        },
                      ],
                    },
                  ]
                : []),
              {
                scriptId: 'entry',
                functions: [
                  {
                    isBlockCoverage: true,
                    ranges: [
                      { startOffset: 0, endOffset: emitted.length, count: 1 },
                    ],
                  },
                ],
              },
            ],
          }
        if (method === 'Debugger.getScriptSource') {
          if (params.scriptId === engineFact.scriptId) {
            if (options.engine?.revokedDuringRead) factLive = false
            if (options.engine?.changedDuringRead) registrationChanged = true
          }
          return {
            scriptSource:
              params.scriptId === 'initializer'
                ? options.unknownAnonymous
                  ? initializer + ';'
                  : initializer
                : params.scriptId === engineFact.scriptId ||
                    params.scriptId === 'engine-copy'
                  ? engineSource
                  : emitted,
          }
        }
        return {}
      })
    })
    const artifact = {
      version: 2,
      kind: 'browser',
      profile: { ...profile, environment: 'browser', browserClient: true },
      coverage: {
        version: 1,
        scripts: [{ path: 'entry.js', sha256: coverageHash(emitted) }],
      },
      client: { scripts: ['entry.js'] },
    } as any
    const controller = new AbortController()
    const onFailure = jest.fn()
    let coverage!: ReturnType<
      typeof import('next/dist/experimental/testing/client/coverage').createClientCoverage
    >
    jest.isolateModules(() => {
      jest.doMock(
        'next/dist/experimental/testing/client/coverage-artifact',
        () => ({ assertBrowserCoverageArtifact: jest.fn(async () => {}) })
      )
      jest.doMock('next/dist/experimental/testing/client/assets', () => ({
        createClientAssetReader: jest.fn(async () => ({
          read: async () => Buffer.from(emitted),
          verify: async () => {},
        })),
      }))
      const {
        createClientCoverage,
      } = require('next/dist/experimental/testing/client/coverage')
      coverage = createClientCoverage({
        artifact,
        browser: { newBrowserCDPSession: async () => targetSession } as any,
        context: { newCDPSession: async () => pageSession } as any,
        page: {} as any,
        url,
        contextOptions: { serviceWorkers: 'block' },
        ...(options.engine && !options.engine.unissued
          ? { engineBrandFact: readEngineFact }
          : {}),
        signal: controller.signal,
        onFailure,
      })
    })
    jest.dontMock('next/dist/experimental/testing/client/coverage-artifact')
    jest.dontMock('next/dist/experimental/testing/client/assets')
    return {
      coverage,
      calls,
      controller,
      holding,
      rejectHeld: (reason: unknown) => rejectHeld(reason),
      restore: () => {},
    }
  }

  it('retains actual ranges and detaches before owner closure, withholding facts until closure', async () => {
    const p = protocol()
    try {
      await p.coverage.start()
      await p.coverage.take()
      await expect(p.coverage.result()).rejects.toThrow('did not close')
      expect(p.calls.filter((method) => method === 'detach')).toHaveLength(2)
      expect(p.calls.indexOf('Profiler.takePreciseCoverage')).toBeLessThan(
        p.calls.indexOf('Profiler.stopPreciseCoverage')
      )
      p.coverage.close()
      await p.coverage.afterOwnersClosed()
      expect(await p.coverage.result()).toMatchObject({
        version: 1,
        kind: 'browser-cdp',
        scripts: [
          {
            path: 'entry.js',
            sha256: coverageHash(emitted),
            functions: [
              {
                ranges: [
                  { startOffset: 0, endOffset: emitted.length, count: 1 },
                ],
              },
            ],
          },
        ],
      })
    } finally {
      p.restore()
    }
  })

  it('excludes only the live parent-authenticated engine initializer while retaining exact authored bytes and ranges', async () => {
    const p = protocol({ engine: {} })
    await p.coverage.start()
    await p.coverage.take()
    p.coverage.close()
    await p.coverage.afterOwnersClosed()
    const capture = await p.coverage.result()
    expect(capture.scripts).toEqual([
      {
        path: 'entry.js',
        sha256: coverageHash(emitted),
        functions: [
          {
            isBlockCoverage: true,
            ranges: [{ startOffset: 0, endOffset: emitted.length, count: 1 }],
          },
        ],
      },
    ])
  })

  it.each([
    [
      'script ID',
      { fact: { scriptId: 'borrowed' } },
      'escaped its owned asset origin',
    ],
    [
      'URL',
      { fact: { url: engineFact.url + '-other' } },
      'differs from its parent debugger registration',
    ],
    [
      'source bytes',
      { fact: { source: engineSource + ';' } },
      'differs from its parent debugger registration',
    ],
    [
      'context ID',
      { fact: { executionContextId: 2 } },
      'differs from its parent debugger registration',
    ],
    [
      'context unique ID',
      { fact: { contextUniqueId: 'other-realm' } },
      'differs from its parent debugger registration',
    ],
    [
      'frame ID',
      { fact: { frameId: 'other-frame' } },
      'differs from its parent debugger registration',
    ],
    [
      'absent parent issuer',
      { unissued: true },
      'escaped its owned asset origin',
    ],
    [
      'post-asset initialization',
      { afterAsset: true },
      'before authored assets',
    ],
    [
      'missing actual capture',
      { missingCapture: true },
      'omitted a loaded script',
    ],
    [
      'same bytes and URL under another script ID',
      { duplicate: true },
      'escaped its owned asset origin',
    ],
    [
      'revoked parent issuer before capture',
      { revokedBeforeCapture: true },
      'registration was revoked',
    ],
    [
      'revoked parent issuer during capture',
      { revokedDuringRead: true },
      'registration was revoked',
    ],
    [
      'revoked parent issuer before final sealing',
      { revokedAfterCapture: true },
      'registration was revoked',
    ],
    [
      'changed parent registration during capture',
      { changedDuringRead: true },
      'registration changed during capture',
    ],
    [
      'unexecuted initializer root',
      { rangeCount: 0 },
      'differs from its parent debugger registration',
    ],
  ] as const)(
    'rejects engine initializer borrowing by %s',
    async (_name, engine, diagnostic) => {
      const p = protocol({ engine })
      await p.coverage.start()
      await expect(p.coverage.take()).rejects.toThrow(diagnostic)
      p.coverage.close()
      await p.coverage.afterOwnersClosed()
      await expect(p.coverage.result()).rejects.toThrow('did not close')
    }
  )

  it('rejects an anonymous script with changed owned initializer bytes', async () => {
    const p = protocol({ unknownAnonymous: true })
    try {
      await p.coverage.start()
      await expect(p.coverage.take()).rejects.toThrow('unqualified anonymous')
      p.coverage.close()
      await p.coverage.afterOwnersClosed()
      await expect(p.coverage.result()).rejects.toThrow('did not close')
    } finally {
      p.restore()
    }
  })

  it('rejects a parsed owned script absent from the precise coverage capture', async () => {
    const p = protocol({ missingCapture: true })
    try {
      await p.coverage.start()
      await expect(p.coverage.take()).rejects.toThrow('omitted a loaded script')
      p.coverage.close()
      await p.coverage.afterOwnersClosed()
      await expect(p.coverage.result()).rejects.toThrow('did not close')
    } finally {
      p.restore()
    }
  })

  it('drains held CDP requests only after realm termination can reject them', async () => {
    const p = protocol({ hold: 'Profiler.enable' })
    try {
      const starting = p.coverage.start()
      await p.holding
      const reason = new Error('owner cancelled')
      p.controller.abort(reason)
      p.coverage.close()
      let disposed = false
      const closing = p.coverage.afterOwnersClosed().then(() => {
        disposed = true
      })
      await Promise.resolve()
      expect(disposed).toBe(false)
      p.rejectHeld(new Error('actual target terminated'))
      await expect(starting).rejects.toThrow('actual target terminated')
      await closing
      expect(disposed).toBe(true)
      await expect(p.coverage.result()).rejects.toBe(reason)
    } finally {
      p.restore()
    }
  })
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

async function generationCoverageFixture() {
  const f = await standardReportFixture()
  const { createStandardCoverageGenerationCache } = await import(
    'next/dist/experimental/testing/coverage/generation-cache'
  )
  const { snapshotWatchRegistry } = await import(
    'next/dist/experimental/testing/incremental/registry-additions'
  )
  const one = join(f.root, 'one.test.mjs'),
    two = join(f.root, 'two.test.mjs')
  await writeFile(one, 'test("one", () => {})\n')
  await writeFile(two, 'test("two", () => {})\n')
  const registry = (ids = ['one', 'two'], configurationRevision = 'config') =>
    snapshotWatchRegistry({
      configurationRevision,
      entries: ids.map((id) => ({ id, file: id === 'one' ? one : two })),
      inputs: [],
    })
  const fact = (id: string, hits: number, revision = id) => {
    const value = structuredClone(f.facts[0])
    value.entryId = id
    value.revision = revision
    value.files[0].data.f['0'] = hits
    return value
  }
  return {
    ...f,
    one,
    two,
    registry,
    fact,
    cache: createStandardCoverageGenerationCache(f.root),
  }
}

it.each([undefined, true, false])(
  'retains only the latest qualified watch facts with cleanOnRerun=%s',
  async (cleanOnRerun) => {
    const f = await generationCoverageFixture()
    try {
      const registry = await f.registry()
      const first = await f.cache.prepare({
        facts: [f.fact('one', 1), f.fact('two', 2)],
        expected: new Set(['one', 'two']),
        revisions: new Map([
          ['one', 'one'],
          ['two', 'two'],
        ]),
        registry,
        cleanOnRerun,
      })
      first.commit()
      // Mutating producer or returned report data cannot mutate parent-owned state.
      first.facts[0].files[0].data.f['0'] = 100
      const rerun = await f.cache.prepare({
        facts: [f.fact('two', 3, 'fresh')],
        expected: new Set(['two']),
        revisions: new Map([['two', 'fresh']]),
        registry,
        cleanOnRerun,
      })
      expect(
        rerun.facts.map((fact) => [fact.entryId, fact.files[0].data.f['0']])
      ).toEqual(
        cleanOnRerun === false
          ? [
              ['one', 1],
              ['two', 3],
            ]
          : [['two', 3]]
      )
      rerun.commit()
      const repeat = await f.cache.prepare({
        facts: [f.fact('two', 3, 'again')],
        expected: new Set(['two']),
        revisions: new Map([['two', 'again']]),
        registry,
        cleanOnRerun,
      })
      expect(repeat.facts.map((fact) => fact.files[0].data.f['0'])).toEqual(
        cleanOnRerun === false ? [1, 3] : [3]
      )
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  }
)

it('broadens partial coverage execution when retained provenance is stale or missing', async () => {
  const f = await generationCoverageFixture()
  try {
    const registry = await f.registry()
    const select = (current = registry) =>
      f.cache.selectEntryIds({
        registry: current,
        entryIds: ['one', 'two'],
        selected: ['two'],
        cleanOnRerun: false,
      })
    expect(await select()).toEqual(['one', 'two'])
    const first = await f.cache.prepare({
      facts: [f.fact('one', 1), f.fact('two', 2)],
      expected: new Set(['one', 'two']),
      revisions: new Map([
        ['one', 'one'],
        ['two', 'two'],
      ]),
      registry,
      cleanOnRerun: false,
    })
    first.commit()
    expect(await select()).toEqual(['two'])
    expect(
      await select(await f.registry(['one', 'two'], 'new-profile'))
    ).toEqual(['one', 'two'])
    await writeFile(f.one, 'test("one changed", () => {})\n')
    expect(await select(await f.registry())).toEqual(['one', 'two'])
    await writeFile(f.one, 'test("one", () => {})\n')
    await writeFile(f.file, f.source + '\n// changed original\n')
    expect(await select()).toEqual(['one', 'two'])
    await expect(
      f.cache.prepare({
        facts: [f.fact('two', 3)],
        expected: new Set(['two']),
        revisions: new Map([['two', 'two']]),
        registry,
        cleanOnRerun: false,
      })
    ).rejects.toThrow('source changed')
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it('rejects unsealed revisions and cancelled cache commits without losing the previous generation', async () => {
  const f = await generationCoverageFixture()
  try {
    const registry = await f.registry()
    const initial = {
      facts: [f.fact('one', 1), f.fact('two', 2)],
      expected: new Set(['one', 'two']),
      revisions: new Map([
        ['one', 'one'],
        ['two', 'two'],
      ]),
      registry,
      cleanOnRerun: false,
    }
    ;(await f.cache.prepare(initial)).commit()
    await expect(
      f.cache.prepare({
        ...initial,
        revisions: new Map([
          ['one', 'wrong'],
          ['two', 'two'],
        ]),
      })
    ).rejects.toThrow('unowned')
    const controller = new AbortController(),
      reason = new Error('superseded generation')
    const pending = await f.cache.prepare({
      ...initial,
      facts: [f.fact('one', 9), f.fact('two', 9)],
      signal: controller.signal,
    })
    controller.abort(reason)
    expect(() => pending.commit()).toThrow(reason)
    const next = await f.cache.prepare({
      facts: [f.fact('two', 3)],
      expected: new Set(['two']),
      revisions: new Map([['two', 'two']]),
      registry,
      cleanOnRerun: false,
    })
    expect(next.facts.map((fact) => fact.files[0].data.f['0'])).toEqual([1, 3])
    const removed = await f.cache.prepare({
      facts: [],
      expected: new Set<string>(),
      revisions: new Map<string, string>(),
      registry: await f.registry(['one']),
      cleanOnRerun: false,
    })
    expect(removed.facts.map((fact) => fact.entryId)).toEqual(['one'])
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it.each([false, true])(
  'uses explicit parent scheduling evidence for unimported watch sources (%s)',
  async (includeUnimported) => {
    const { publishStandardCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-standard'
    )
    const f = await standardReportFixture()
    try {
      await publishStandardCoverage({
        projectDir: f.root,
        ...f,
        status: 'passed',
        includeUnimported,
      })
      const report = JSON.parse(
        await readFile(join(f.root, 'coverage/coverage-final.json'), 'utf8')
      )
      expect(Object.keys(report)).toEqual(
        includeUnimported ? [f.file, join(f.root, 'unimported.mjs')] : [f.file]
      )
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  }
)

it('withholds failed-compilation watch coverage only with parent diagnostic and outcome proof', async () => {
  const { validateStandardWatchCoverage } = await import(
    'next/dist/experimental/testing/coverage/generation-cache'
  )
  const f = await generationCoverageFixture()
  try {
    const options = {
      projectDir: f.root,
      facts: [f.fact('one', 1)],
      expected: new Set(['one', 'two']),
      revisions: new Map([['one', 'one']]),
      status: 'failed',
      terminalStatus: 'failed',
      compilationFailures: new Set(['two']),
      fileOutcomes: new Map([
        ['one', 'passed'],
        ['two', 'failed'],
      ]),
      allowCompilationFailure: true,
    }
    expect(await validateStandardWatchCoverage(options)).toBeUndefined()
    for (const changes of [
      { allowCompilationFailure: false },
      { status: 'passed' },
      { terminalStatus: 'passed' },
      { compilationFailures: new Set<string>() },
      { compilationFailures: new Set(['foreign']) },
      {
        fileOutcomes: new Map([
          ['one', 'passed'],
          ['two', 'passed'],
        ]),
      },
    ])
      await expect(
        validateStandardWatchCoverage({ ...options, ...changes })
      ).rejects.toThrow('omitted an expected')
    await expect(
      validateStandardWatchCoverage({ ...options, facts: undefined })
    ).rejects.toThrow('Missing standard')
    await expect(
      validateStandardWatchCoverage({
        ...options,
        facts: [f.fact('one', 1, 'wrong')],
      })
    ).rejects.toThrow('unowned')
    const malformed = f.fact('one', 1)
    malformed.files[0].sha256 = '0'.repeat(64)
    await expect(
      validateStandardWatchCoverage({ ...options, facts: [malformed] })
    ).rejects.toThrow('source changed')
    const complete = [f.fact('one', 1), f.fact('two', 2)]
    expect(
      await validateStandardWatchCoverage({
        ...options,
        facts: complete,
        revisions: new Map([
          ['one', 'one'],
          ['two', 'two'],
        ]),
      })
    ).toBe(complete)
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
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
  'next.test.config.mjs',
  'vitest.config.ts',
  'vite.config.ts',
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

it.each(['file', 'cohort'] as const)(
  'rejects a compiler-analysis acknowledgement completing an ordinary %s request',
  async (kind) => {
    const { createExecutionBrokerClient } = await import(
      'next/dist/experimental/testing/execution/broker'
    )
    const owned = await typedCompilerAnalysisFixture(),
      signal = new AbortController().signal
    let sent!: (message: { id: string }) => void
    const request = new Promise<{ id: string }>((resolve) => {
      sent = resolve
    })
    const client = createExecutionBrokerClient({
      allowCohorts: true,
      send: async (message) => {
        sent({ id: message.id })
      },
    })
    const options = {
      signal,
      runId: 'runtime-role-control',
      projectDir: owned.root,
      entry: {
        id: owned.artifact.entryId,
        file: join(owned.root, 'entry.test.ts'),
        profile,
      },
      setupFiles: [],
      testTimeout: 1000,
      hookTimeout: 1000,
      fileTimeout: 1000,
      updateSnapshots: false,
      onEvent: () => {},
    }
    try {
      const pending =
        kind === 'file'
          ? client.execute(owned.artifact, options)
          : client.executeCohort(
              {
                version: 1,
                artifacts: [
                  owned.artifact as import('next/dist/experimental/testing/contracts').CompiledNodeTestArtifact,
                ],
              },
              [options]
            )
      const message = await request
      expect(
        client.handle({
          type: 'execution-broker-response',
          id: message.id,
          action: 'source-analysis-result',
        })
      ).toBe(true)
      await expect(pending).rejects.toThrow(
        'Mismatched execution broker result kind'
      )
    } finally {
      client.disconnect(new Error('control closed'))
      await rm(owned.root, { recursive: true, force: true })
    }
  }
)

it('rejects collection coverage before source planning, compiler allocation or execution', async () => {
  const { runTests } = await import(
    'next/dist/experimental/testing/orchestrator'
  )
  const execute = jest.fn(),
    allocateArtifact = jest.fn(),
    onCoverageSource = jest.fn()
  await expect(
    runTests(join(tmpdir(), 'no-coverage-collection-project'), [], {
      collectOnly: true,
      coverage: true,
      standardCoverageOptions: {
        reporter: ['json'],
        include: ['*.ts'],
        exclude: [],
        reportsDirectory: 'coverage',
        reportOnFailure: false,
        thresholds: {},
      },
      signal: new AbortController().signal,
      write: () => {},
      execute,
      allocateArtifact,
      onCoverageSource,
    })
  ).rejects.toThrow('Collection cannot request coverage or snapshot updates.')
  expect(execute).not.toHaveBeenCalled()
  expect(allocateArtifact).not.toHaveBeenCalled()
  expect(onCoverageSource).not.toHaveBeenCalled()
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
    await writeFile(join(owned.root, 'vite.config.mts'), 'export default {}')
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

async function runtimeConfigurationGenerationFixture(mixedProfiles = false) {
  const f = await generationCoverageFixture()
  const { createRuntimeConfigurationPlan } = await import(
    'next/dist/experimental/testing/coverage/runtime-configuration'
  )
  const configFile = join(f.root, 'next.config.mjs'),
    helper = join(f.root, 'compiler-helper.mjs'),
    other = join(f.root, 'other-helper.mjs')
  const configSource =
    "import './compiler-helper.mjs'; if (process.env.PROFILE_HELPER === 'two') await import('./other-helper.mjs'); export default {}"
  await writeFile(configFile, configSource)
  await writeFile(helper, 'export const marker = 1')
  await writeFile(other, 'export const marker = 1')
  const makePlan = async (ids = ['one', 'two']) =>
    createRuntimeConfigurationPlan({
      projectDir: f.root,
      projects: (mixedProfiles ? ['one', 'two'] : ['node']).map((name) => ({
        profile: { ...profile, id: name },
        entries: ids
          .filter((id) => !mixedProfiles || id === name)
          .map((id) => ({
            id,
            file: id === 'one' ? f.one : f.two,
            profile: { ...profile, id: name },
          })),
      })),
      signal: new AbortController().signal,
    })
  // Pure cache controls start with parent-owned sealed inputs. Adjacent role
  // controls exercise the sidecar/lease producer; public proofs use real compilers.
  const receipt = async (
    plan: Awaited<ReturnType<typeof makePlan>>,
    id: string
  ) => {
    const request = plan.requests.find((request) =>
      request.entries.some((entry) => entry.id === id)
    )!
    const entry = request.entries.find((entry) => entry.id === id)!
    const modules = [
      configFile,
      helper,
      ...(mixedProfiles && id === 'two' ? [other] : []),
    ]
    return {
      version: 1 as const,
      kind: 'next-runtime-config-modules' as const,
      authority: {
        version: 1 as const,
        projectDir: plan.projectDir,
        inputs: plan.inputs,
        configuration: plan.configuration,
        profile: request.profile,
        authorization: request.authorization,
        entry,
      },
      compiler: {
        entryId: id,
        revision: entry.revision,
        rootDir: join(f.root, 'artifact-' + entry.revision),
      },
      graph: {
        version: 1 as const,
        configFile,
        inputs: await Promise.all(
          modules.map(async (file) => ({
            file,
            sha256: coverageHash(await readFile(file)),
          }))
        ),
        imports: modules.slice(1).map((file) => ({
          kind: 'module' as const,
          parent: configFile,
          request: './' + file.slice(f.root.length + 1),
          target: file,
        })),
      },
    }
  }
  const prepared = async (
    plan: Awaited<ReturnType<typeof makePlan>>,
    hits: Record<string, number>,
    signal?: AbortSignal,
    cleanOnRerun = false
  ) => {
    const ids = Object.keys(hits)
    const receipts = await Promise.all(ids.map((id) => receipt(plan, id)))
    const facts = ids.map((id) =>
      f.fact(
        id,
        hits[id],
        receipts.find((receipt) => receipt.compiler.entryId === id)!.compiler
          .revision
      )
    )
    return f.cache.prepare({
      facts,
      expected: new Set(ids),
      revisions: new Map(facts.map((fact) => [fact.entryId, fact.revision])),
      registry: await f.registry(),
      cleanOnRerun,
      runtimeConfiguration: { plan, receipts },
      signal,
    })
  }
  return { ...f, helper, other, makePlan, receipt, prepared }
}

it.each([true, false])(
  'keeps actual runtime receipt authorization with retained entry revisions (clean=%s)',
  async (cleanOnRerun) => {
    const f = await runtimeConfigurationGenerationFixture()
    try {
      const initial = await f.makePlan()
      const one = initial.requests[0].entries.find(
        (entry) => entry.id === 'one'
      )!
      ;(await f.prepared(initial, { one: 1, two: 2 })).commit()
      const current = await f.makePlan(['two'])
      const next = await f.prepared(
        current,
        { two: 3 },
        undefined,
        cleanOnRerun
      )
      expect(next.facts.map((fact) => fact.files[0].data.f[0])).toEqual(
        cleanOnRerun ? [3] : [1, 3]
      )
      const receipts = next.runtimeConfigurationReceipts!
      expect(receipts).toHaveLength(cleanOnRerun ? 1 : 2)
      if (!cleanOnRerun) {
        const retained = receipts.find(
          (receipt) => receipt.compiler.entryId === 'one'
        )!
        expect(retained.compiler.revision).toBe(one.revision)
        expect(retained.authority.authorization.id).toBe(
          initial.requests[0].authorization.id
        )
        expect(retained.authority.authorization.id).not.toBe(
          current.requests[0].authorization.id
        )
      }
      next.commit()
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  }
)

it('broadens a partial watch run when a retained profile config helper is stale without borrowing the selected profile receipt', async () => {
  const f = await runtimeConfigurationGenerationFixture(true)
  try {
    ;(await f.prepared(await f.makePlan(), { one: 1, two: 1 })).commit()
    const options = {
      registry: await f.registry(),
      entryIds: ['one', 'two'],
      selected: ['one'],
      cleanOnRerun: false,
      requireRuntimeConfiguration: true,
    }
    expect(await f.cache.selectEntryIds(options)).toEqual(['one'])
    await writeFile(f.other, 'export const marker = 2')
    expect(await f.cache.selectEntryIds(options)).toEqual(['one', 'two'])
    await expect(
      f.prepared(await f.makePlan(['one']), { one: 3 })
    ).rejects.toThrow('changed after its actual load')
    const recovered = await f.prepared(await f.makePlan(), { one: 4, two: 5 })
    expect(recovered.facts.map((fact) => fact.files[0].data.f[0])).toEqual([
      4, 5,
    ])
    recovered.commit()
    expect(await f.cache.selectEntryIds(options)).toEqual(['one'])
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it('rejects a missing or relabeled fresh receipt without consuming the prior completed generation', async () => {
  const f = await runtimeConfigurationGenerationFixture()
  try {
    const initial = await f.makePlan()
    const old = await f.receipt(initial, 'two')
    ;(await f.prepared(initial, { one: 1, two: 2 })).commit()
    const current = await f.makePlan(['two']),
      entry = current.requests[0].entries[0],
      fact = f.fact('two', 9, entry.revision)
    const options = {
      facts: [fact],
      expected: new Set(['two']),
      revisions: new Map([['two', entry.revision]]),
      registry: await f.registry(),
      cleanOnRerun: false,
    }
    await expect(
      f.cache.prepare({
        ...options,
        runtimeConfiguration: { plan: current, receipts: [] },
      })
    ).rejects.toThrow('Incomplete parent runtime configuration')
    await expect(
      f.cache.prepare({
        ...options,
        runtimeConfiguration: {
          plan: current,
          receipts: [
            { ...old, compiler: { ...old.compiler, revision: entry.revision } },
          ],
        },
      })
    ).rejects.toThrow('Unrequested or incompatible')
    await expect(f.cache.prepare(options)).rejects.toThrow(
      'configuration context is missing'
    )
    const recovered = await f.prepared(current, { two: 3 })
    expect(recovered.facts.map((fact) => fact.files[0].data.f[0])).toEqual([
      1, 3,
    ])
    recovered.commit()
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it('retains the prior runtime receipts when a prepared generation is cancelled and permits fresh recovery', async () => {
  const f = await runtimeConfigurationGenerationFixture()
  try {
    const initial = await f.makePlan()
    ;(await f.prepared(initial, { one: 1, two: 2 })).commit()
    const controller = new AbortController()
    const pending = await f.prepared(
      await f.makePlan(['two']),
      { two: 9 },
      controller.signal
    )
    controller.abort(new Error('cancel runtime receipt generation'))
    expect(() => pending.commit()).toThrow('cancel runtime receipt generation')
    const recovered = await f.prepared(await f.makePlan(['two']), { two: 3 })
    expect(recovered.facts.map((fact) => fact.files[0].data.f[0])).toEqual([
      1, 3,
    ])
    const old = recovered.runtimeConfigurationReceipts!.find(
      (receipt) => receipt.compiler.entryId === 'one'
    )!
    expect(old.authority.authorization.id).toBe(
      initial.requests[0].authorization.id
    )
    recovered.commit()
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it.each(['before', 'after'] as const)(
  'keeps the last report when a current or retained runtime config helper changes %s rename',
  async (when) => {
    const { publishStandardCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-standard'
    )
    const fs = require('fs/promises') as typeof import('fs/promises')
    const f = await runtimeConfigurationGenerationFixture(true)
    try {
      const first = await f.prepared(await f.makePlan(), { one: 1, two: 2 })
      first.commit()
      const next = await f.prepared(await f.makePlan(['one']), { one: 3 })
      const options = {
        projectDir: f.root,
        facts: next.facts,
        expected: next.expected,
        config: f.config,
        excludedFiles: [],
        status: 'passed' as const,
        includeUnimported: false,
        runtimeConfiguration: { receipts: next.runtimeConfigurationReceipts! },
      }
      await publishStandardCoverage(options)
      const path = join(f.root, 'coverage/coverage-final.json'),
        previous = await readFile(path, 'utf8')
      if (when === 'before') await writeFile(f.other, 'export const marker = 2')
      else {
        const originalRename = fs.rename
        let changed = false
        jest.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
          await originalRename(from, to)
          if (!changed && to === join(f.root, 'coverage')) {
            changed = true
            await writeFile(f.other, 'export const marker = 2')
          }
        })
      }
      await expect(publishStandardCoverage(options)).rejects.toThrow(
        'Next config imported module changed after its actual load'
      )
      expect(await readFile(path, 'utf8')).toBe(previous)
    } finally {
      jest.restoreAllMocks()
      await rm(f.root, { recursive: true, force: true })
    }
  }
)
it('rejects a cached receipt whose own original entry revision was relabeled', async () => {
  const { assertRuntimeConfigurationReceipts } = await import(
    'next/dist/experimental/testing/coverage/runtime-configuration'
  )
  const f = await runtimeConfigurationGenerationFixture()
  try {
    const plan = await f.makePlan(),
      receipt = await f.receipt(plan, 'one')
    receipt.authority.entry = {
      ...receipt.authority.entry,
      revision: 'borrowed',
    }
    await expect(
      assertRuntimeConfigurationReceipts({
        receipts: [receipt],
        facts: [{ entryId: 'one', revision: receipt.compiler.revision }],
        signal: new AbortController().signal,
      })
    ).rejects.toThrow('incompatible parent runtime config receipt')
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

async function browserRuntimeConfigurationFixture() {
  const { createRuntimeConfigurationPlan } = await import(
    'next/dist/experimental/testing/coverage/runtime-configuration'
  )
  const { writeRuntimeConfigurationImportProof } = await import(
    'next/dist/experimental/testing/compiler/runtime-config-proof'
  )
  const f = await runtimeConfigurationFixture()
  const path = f.artifact.runtimeConfigurationImports!.path
  await rm(join(f.root, path))
  const files = f.artifact.files.filter((file) => file !== path)
  const browserProfile = {
    ...profile,
    id: 'browser-runtime-config',
    environment: 'browser' as const,
    browserClient: true as const,
  }
  const plan = await createRuntimeConfigurationPlan({
    projectDir: f.root,
    projects: [
      {
        profile: browserProfile,
        entries: [
          { id: f.entry.id, file: f.entry.file, profile: browserProfile },
        ],
      },
    ],
    signal: new AbortController().signal,
  })
  const request = plan.requests[0],
    entry = request.entries[0]
  const artifact = {
    ...f.artifact,
    kind: 'browser' as const,
    files,
    profile: browserProfile,
    revision: entry.revision,
    sourceHash: entry.sha256,
    client: {
      version: 1 as const,
      asyncScope: 'promise-continuations-v1' as const,
      sourceFile: entry.file,
      scripts: files.filter((file) => file.endsWith('.js')),
      styles: [],
      outputs: await Promise.all(
        files.map(async (file) => ({
          path: file,
          sha256: coverageHash(await readFile(join(f.root, file))),
        }))
      ),
    },
  }
  const nativeFiles = structuredClone(artifact.files),
    nativeOutputs = structuredClone(artifact.client.outputs)
  const reference = await writeRuntimeConfigurationImportProof(
    artifact,
    request.authorization,
    entry,
    f.graph,
    new AbortController().signal
  )
  artifact.runtimeConfigurationImports = reference
  return {
    ...f,
    artifact,
    plan,
    request,
    entry,
    reference,
    nativeFiles,
    nativeOutputs,
    fact: { entryId: artifact.entryId, revision: artifact.revision },
  }
}

it('pins the parent browser config proof without changing the complete native client allowlist', async () => {
  const {
    prepareRuntimeConfigurationReceipt,
    assertRuntimeConfigurationReceipts,
  } = await import(
    'next/dist/experimental/testing/coverage/runtime-configuration'
  )
  const { createClientAssetReader } = await import(
    'next/dist/experimental/testing/client/assets'
  )
  const f = await browserRuntimeConfigurationFixture()
  try {
    expect(f.artifact.files).toEqual(f.nativeFiles)
    expect(f.artifact.client.outputs).toEqual(f.nativeOutputs)
    expect(f.artifact.files).not.toContain(f.reference.path)
    expect(
      f.artifact.client.outputs.some(
        (output) => output.path === f.reference.path
      )
    ).toBe(false)
    expect(coverageHash(await readFile(join(f.root, f.reference.path)))).toBe(
      f.reference.sha256
    )
    const assets = await createClientAssetReader(f.artifact)
    await assets.verify()
    await expect(assets.read(f.reference.path)).rejects.toThrow(
      'outside the compiler-issued allowlist'
    )
    const staged = await prepareRuntimeConfigurationReceipt({
      artifact: f.artifact,
      plan: f.plan,
      artifactRoot: f.root,
      signal: new AbortController().signal,
    })
    const receipt = await staged.seal()
    expect(receipt.graph).toEqual(f.graph)
    await assertRuntimeConfigurationReceipts({
      receipts: [receipt],
      facts: [f.fact],
      plan: f.plan,
      signal: new AbortController().signal,
    })
    expect(f.artifact.files).toEqual(f.nativeFiles)
    expect(f.artifact.client.outputs).toEqual(f.nativeOutputs)
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it.each(['files', 'client-outputs'] as const)(
  'rejects a browser config proof colliding with %s on write and read',
  async (where) => {
    const {
      writeRuntimeConfigurationImportProof,
      readRuntimeConfigurationImportProof,
    } = await import(
      'next/dist/experimental/testing/compiler/runtime-config-proof'
    )
    const f = await browserRuntimeConfigurationFixture(),
      signal = new AbortController().signal
    try {
      if (where === 'files') f.artifact.files.push(f.reference.path)
      else
        f.artifact.client.outputs.push({
          path: f.reference.path,
          sha256: f.reference.sha256,
        })
      await expect(
        readRuntimeConfigurationImportProof(
          f.artifact,
          f.reference,
          f.request.authorization,
          f.entry,
          signal
        )
      ).rejects.toThrow('collides with')
      await expect(
        writeRuntimeConfigurationImportProof(
          f.artifact,
          f.request.authorization,
          f.entry,
          f.graph,
          signal
        )
      ).rejects.toThrow('collides with')
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  }
)

it.each([
  'missing',
  'reference-path',
  'reference-hash',
  'bytes',
  'symlink',
  'root-alias',
  'helper',
] as const)(
  'refuses a changed private browser config proof or input: %s',
  async (kind) => {
    const { readRuntimeConfigurationImportProof } = await import(
      'next/dist/experimental/testing/compiler/runtime-config-proof'
    )
    const f = await browserRuntimeConfigurationFixture(),
      signal = new AbortController().signal
    let alias: string | undefined
    try {
      let reference: typeof f.reference | undefined = f.reference
      if (kind === 'missing') reference = undefined
      if (kind === 'reference-path')
        reference = { ...f.reference, path: 'another-parent-proof.json' }
      if (kind === 'reference-hash')
        reference = { ...f.reference, sha256: '0'.repeat(64) }
      if (kind === 'bytes')
        await writeFile(join(f.root, f.reference.path), '{}')
      if (kind === 'helper')
        await writeFile(f.helper, 'export const marker = 99')
      if (kind === 'symlink') {
        const { rename, symlink } = await import('node:fs/promises')
        await rename(
          join(f.root, f.reference.path),
          join(f.root, 'original-parent-proof.json')
        )
        await symlink(
          join(f.root, 'original-parent-proof.json'),
          join(f.root, f.reference.path)
        )
      }
      if (kind === 'root-alias') {
        const { symlink } = await import('node:fs/promises')
        alias = f.root + '-alias'
        await symlink(f.root, alias)
        f.artifact.rootDir = alias
      }
      await expect(
        readRuntimeConfigurationImportProof(
          f.artifact,
          reference,
          f.request.authorization,
          f.entry,
          signal
        )
      ).rejects.toThrow()
      expect(f.artifact.files).toEqual(f.nativeFiles)
      expect(f.artifact.client.outputs).toEqual(f.nativeOutputs)
    } finally {
      if (alias) await rm(alias, { force: true })
      await rm(f.root, { recursive: true, force: true })
    }
  }
)

it('keeps the private browser config proof unreachable through the real client asset HTTP route', async () => {
  const { createClientServer } = await import(
    'next/dist/experimental/testing/client/server'
  )
  const f = await browserRuntimeConfigurationFixture()
  let server: Awaited<ReturnType<typeof createClientServer>> | undefined
  try {
    server = await createClientServer({
      artifact: f.artifact,
      configuration: {
        version: 1,
        runId: 'private-browser-proof',
        entryId: f.artifact.entryId,
        revision: f.artifact.revision,
        ownerToken: 'private-parent-owner',
        filePath: f.entry.file,
        sourceHash: f.entry.sha256,
        projectDir: f.root,
        snapshotUpdateMode: 'none',
        testTimeout: 1000,
        hookTimeout: 1000,
      },
      onMessage() {},
      onFailure() {},
    })
    const document = await fetch(server.url)
    const cookie = document.headers.get('set-cookie')!.split(';')[0]
    expect(
      (
        await fetch(
          new URL('/_next/' + f.artifact.client.scripts[0], server.url),
          { headers: { Cookie: cookie } }
        )
      ).status
    ).toBe(200)
    const privateResponse = await fetch(
      new URL('/_next/' + f.reference.path, server.url),
      { headers: { Cookie: cookie } }
    )
    expect(privateResponse.status).toBe(404)
    expect(await privateResponse.text()).toBe('')
    expect(f.artifact.files).toEqual(f.nativeFiles)
    expect(f.artifact.client.outputs).toEqual(f.nativeOutputs)
  } finally {
    await server?.dispose()
    await rm(f.root, { recursive: true, force: true })
  }
})

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

it('maps actual typed callback functions and statements to the complete reference reports', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'typescript-callbacks.cjs')],
    { timeout: 180000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({
    profiles: 4,
    cases: 4,
    completeReports: 4,
  })
}, 190000)

it('maps computed-member typed callbacks to complete reference reports in both Node profiles', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'computed-callbacks.cjs')],
    { timeout: 180000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({
    profiles: 4,
    cases: 4,
    completeReports: 4,
  })
}, 190000)

it('maps static object-property typed arrows to complete reference reports in both Node profiles', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const result = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'object-arrows.cjs')],
    { timeout: 180_000 }
  )
  expect(JSON.parse(result.stdout.trim())).toEqual({
    profiles: 4,
    cases: 4,
    completeReports: 4,
  })
}, 180_000)

it('maps function-expression callback boundaries to complete reference reports in both Node profiles', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'function-callbacks.cjs')],
    { timeout: 180000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({
    profiles: 4,
    cases: 4,
    completeReports: 4,
  })
}, 190000)

it('publishes complete pristine JSX and TSX standard coverage through the ordinary Node CLI in both profiles', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'jsx-standard.cjs')],
    { timeout: 180000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({
    profiles: 4,
    cases: 4,
    completeReports: 4,
  })
}, 190000)

it('keeps JSX report ownership bound to the current source/profile/entry/revision plans', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'jsx-ownership.cjs')],
    { timeout: 30000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({ controls: 7, passed: 7 })
}, 40000)

it('retains actual JSX initializer and logical-child ownership while rejecting ambiguous compiler roles', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'jsx-owner-maps.cjs')],
    { timeout: 30000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({ controls: 46, passed: 46 })
}, 40000)

it('publishes complete pristine nested, logical-child and typed-arrow JSX coverage in both Node profiles', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'jsx-owner-reports.cjs')],
    { timeout: 240000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({
    profiles: 6,
    cases: 6,
    completeReports: 6,
  })
}, 250000)

it('retains logical branch counters across typed fragment arrow conversions in both Node profiles', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'jsx-fragment-reports.cjs')],
    { timeout: 180000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({
    profiles: 2,
    cases: 4,
    completeReports: 2,
  })
}, 190000)

it('keeps fragment endpoints bound to unique compiler owners and the actual JSX profile', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
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

it('matches complete genuine development/production LCOV-only bytes with and without JSON', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'lcovonly.cjs')],
    { encoding: 'utf8', timeout: 180000 }
  )
  expect(JSON.parse(result)).toEqual({
    profiles: 2,
    flavors: 2,
    cases: 8,
    completeCoverageReports: 2,
    exactLcovReports: 4,
  })
}, 190000)

it('binds same-line if-return branch endpoints through actual compiler roles without changing counters', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'if-return-maps.cjs')],
    { encoding: 'utf8', timeout: 30000 }
  )
  expect(JSON.parse(result)).toEqual({ profiles: 2, controls: 44, passed: 44 })
})

it('binds conditional operands to unique authored and emitted roles without changing counters', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'conditional-operands.cjs')],
    { encoding: 'utf8', timeout: 30000 }
  )
  expect(JSON.parse(result)).toEqual({ profiles: 2, controls: 42, passed: 42 })
})

it('matches complete genuine conditional coverage in development and production', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'conditional-reports.cjs')],
    { encoding: 'utf8', timeout: 90000 }
  )
  expect(JSON.parse(result)).toEqual({
    profiles: 2,
    cases: 2,
    completeReports: 2,
  })
}, 100000)

it('associates multiline JSX arrow endpoints only with unique real compiler terminal facts', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'jsx-multiline-maps.cjs')],
    { timeout: 30000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({ controls: 34, passed: 34 })
}, 40000)

it('publishes complete pristine multiline typed-arrow JSX coverage in both Node profiles', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'jsx-multiline-reports.cjs')],
    { timeout: 180000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({
    profiles: 2,
    cases: 2,
    completeReports: 2,
  })
}, 190000)

it('binds parenthesized JSX return endpoints only through real unique compiler facts', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'jsx-return-maps.cjs')],
    { timeout: 30000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({ controls: 46, passed: 46 })
}, 40000)

it('publishes complete pristine parenthesized multiline JSX return coverage in both Node profiles', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'jsx-return-reports.cjs')],
    { timeout: 180000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({
    profiles: 2,
    cases: 2,
    completeReports: 2,
  })
}, 190000)

it('binds multiline parenthesized logical JSX only through unique native compiler roles', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'jsx-multiline-logical-maps.cjs')],
    { timeout: 30000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({ controls: 92, passed: 92 })
}, 40000)

it('publishes complete pristine multiline logical JSX reports in both Node profiles', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'jsx-multiline-logical-reports.cjs')],
    { timeout: 180000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({
    profiles: 2,
    cases: 2,
    completeReports: 2,
  })
}, 190000)

it('retains prior multiline fragment coverage when the logical element repair is selected', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'jsx-multiline-fragment-reports.cjs')],
    { timeout: 180000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({
    profiles: 2,
    cases: 2,
    completeReports: 2,
    genuineReports: 2,
    retainedDevelopmentDelta: false,
  })
}, 190000)

it('retains complete pristine ownerless multiline logical return reports', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'jsx-multiline-ownerless-reports.cjs')],
    { timeout: 180000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({
    profiles: 2,
    cases: 2,
    completeReports: 2,
    genuineReports: 2,
  })
}, 190000)

it('binds multiline Fragment coverage to actual native child and sibling mappings', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'jsx-multiline-fragment-maps.cjs')],
    { timeout: 30000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({ controls: 86, passed: 86 })
}, 40000)

it('retains actual parenthesis and owner map certificates for multiline JSX logical children', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'jsx-logical-shapes-maps.cjs')],
    { encoding: 'utf8', timeout: 30000 }
  )
  expect(JSON.parse(result)).toEqual({ controls: 172, passed: 172 })
})

it('matches complete original-source coverage for parenthesized Fragment and unparenthesized element children', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'jsx-logical-shapes-reports.cjs')],
    { encoding: 'utf8', timeout: 190000 }
  )
  expect(JSON.parse(result)).toEqual({
    profiles: 4,
    cases: 4,
    completeReports: 4,
    genuineReports: 4,
    retainedDevelopmentDelta: false,
  })
}, 200000)

it('binds constructor property descriptors only through actual compiler assignments and maps', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'parameter-property-maps.cjs')],
    { encoding: 'utf8', timeout: 30000 }
  )
  expect(JSON.parse(result)).toEqual({ controls: 170, passed: 170 })
})

it('matches complete pristine coverage for constructor parameter properties in both Node profiles', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'parameter-property-reports.cjs')],
    { encoding: 'utf8', timeout: 420000 }
  )
  expect(JSON.parse(result)).toEqual({
    profiles: 10,
    cases: 10,
    completeReports: 10,
    genuineReports: 10,
  })
}, 430000)

it('binds runtime namespace descriptors through actual compiler IIFEs and publication mappings', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'namespace-maps.cjs')],
    { encoding: 'utf8', timeout: 30000 }
  )
  expect(JSON.parse(result)).toEqual({ controls: 68, passed: 68 })
})

it('matches complete pristine runtime namespace coverage through the public CLI in both Node profiles', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'namespace-reports.cjs')],
    { encoding: 'utf8', timeout: 120000 }
  )
  expect(JSON.parse(result)).toEqual({
    profiles: 2,
    cases: 2,
    completeReports: 2,
    genuineReports: 2,
  })
}, 130000)

it('binds enum member counters only through actual compiler owners, literal writes and maps', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'enum-maps.cjs')],
    {
      encoding: 'utf8',
      timeout: 30000,
    }
  )
  expect(JSON.parse(result)).toEqual({ controls: 270, passed: 270 })
})

it('matches complete pristine enum coverage through the public CLI in both Node profiles', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'enum-reports.cjs')],
    {
      encoding: 'utf8',
      timeout: 420000,
    }
  )
  expect(JSON.parse(result)).toEqual({
    profiles: 10,
    cases: 10,
    completeReports: 10,
    genuineReports: 10,
  })
}, 430000)

it('binds typed class arrow fields only through actual class, key and terminal maps', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'class-arrows-maps.cjs')],
    { encoding: 'utf8', timeout: 30000 }
  )
  expect(JSON.parse(result)).toEqual({ controls: 60, passed: 60 })
})

it('matches complete pristine class arrow coverage and existing methods in both Node profiles', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'class-arrows-reports.cjs')],
    { encoding: 'utf8', timeout: 250000 }
  )
  expect(JSON.parse(result)).toEqual({
    profiles: 6,
    cases: 6,
    completeReports: 6,
    genuineReports: 6,
  })
}, 260000)

it('matches complete genuine imported and untouched TypeScript reports while preserving selected JavaScript and JSX plans', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'typescript-import-reports.cjs')],
    { timeout: 300000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({
    profiles: 14,
    cases: 14,
    completeReports: 14,
    genuineReports: 14,
  })
}, 310000)

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

it('matches full genuine executed and untouched class function reports in both Node modes', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'class-functions-reports.cjs')],
    { timeout: 240000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({
    profiles: 8,
    cases: 8,
    completeReports: 8,
    genuineReports: 8,
  })
}, 250000)

it('binds constructor property call defaults only through unique real compiler roles', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'parameter-property-call-maps.cjs')],
    { encoding: 'utf8', timeout: 30000 }
  )
  expect(JSON.parse(result)).toEqual({ controls: 72, passed: 72 })
})

it('matches complete pristine constructor call-default coverage for executed and untouched sources', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'parameter-property-call-reports.cjs')],
    { encoding: 'utf8', timeout: 180000 }
  )
  expect(JSON.parse(result)).toEqual({
    profiles: 4,
    cases: 4,
    completeReports: 4,
    genuineReports: 4,
  })
}, 190000)

it('binds constructor property single-numeric-argument defaults through unique real compiler roles', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'parameter-property-literal-call-maps.cjs')],
    { encoding: 'utf8', timeout: 30000 }
  )
  expect(JSON.parse(result)).toEqual({ controls: 128, passed: 128 })
})

it('matches complete pristine numeric-call-default coverage for executed and untouched sources', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'parameter-property-literal-call-reports.cjs')],
    { encoding: 'utf8', timeout: 180000 }
  )
  expect(JSON.parse(result)).toEqual({
    profiles: 4,
    cases: 4,
    completeReports: 4,
    genuineReports: 4,
  })
}, 190000)

describe('project-configured standard V8 coverage', () => {
  it('matches complete pristine configured reports and case rows through ordinary CLI execution', () => {
    const { execFileSync } = require('node:child_process')
    const result = execFileSync(
      process.execPath,
      [join(__dirname, 'project-configured-reports.cjs')],
      { encoding: 'utf8', timeout: 300000 }
    )
    expect(JSON.parse(result)).toEqual({
      profiles: 10,
      cases: 10,
      completeReports: 8,
      genuineReports: 8,
    })
  }, 310000)
  it('retains configured fields while replacing only explicit CLI values', async () => {
    const {
      parseProjectStandardCoverage,
      parseStandardCoverageOptions,
      resolveProjectStandardCoverage,
    } = await import('next/dist/experimental/testing/coverage/options')
    const configured = parseProjectStandardCoverage({
      provider: 'v8',
      enabled: false,
      include: ['configured.mjs'],
      exclude: ['excluded.mjs'],
      reporter: ['lcovonly'],
      reportsDirectory: 'configured-output',
      clean: false,
      reportOnFailure: true,
      thresholds: { lines: 100, branches: -9 },
    })!
    const flags = {
      coverage: true,
      'coverage.reporter': ['json'],
      'coverage.include': ['selected.mjs'],
      'coverage.thresholds.lines': '0',
    }
    const resolved = resolveProjectStandardCoverage(
      [{ standardCoverage: configured }],
      flags,
      parseStandardCoverageOptions(flags)
    )
    expect(resolved).toEqual({
      enabled: true,
      configured: true,
      options: {
        ...configured.options,
        reporter: ['json'],
        include: ['selected.mjs'],
        thresholds: { lines: 0, branches: -9 },
      },
    })
    expect(configured.options.include).toEqual(['configured.mjs'])
    expect(configured.options.thresholds.lines).toBe(100)
  })

  it('publishes genuine default formatter names instead of CLI defaults', async () => {
    const { parseProjectStandardCoverage } = await import(
      'next/dist/experimental/testing/coverage/options'
    )
    const configured = parseProjectStandardCoverage({
      provider: 'v8',
      enabled: true,
    })!
    expect(configured.options.reporter.slice(0, 4)).toEqual([
      'text',
      'html',
      'clover',
      'json',
    ])
    expect(configured.options.clean).toBe(true)
    expect(configured.options.formatterReports).toBe(true)
    expect(parseProjectStandardCoverage({ provider: 'custom' })).toBeUndefined()
  })

  it('disables configured capture without discarding its later explicit CLI enable defaults', async () => {
    const { parseProjectStandardCoverage, resolveProjectStandardCoverage } =
      await import('next/dist/experimental/testing/coverage/options')
    const configured = parseProjectStandardCoverage({
      provider: 'v8',
      enabled: true,
      reporter: ['json'],
    })!
    expect(
      resolveProjectStandardCoverage(
        [{ standardCoverage: configured }],
        { coverage: false },
        undefined
      )
    ).toEqual({ enabled: false, configured: true })
    configured.enabled = false
    expect(
      resolveProjectStandardCoverage(
        [{ standardCoverage: configured }],
        {},
        undefined
      ).enabled
    ).toBe(false)
    expect(
      resolveProjectStandardCoverage(
        [{ standardCoverage: configured }],
        { coverage: true },
        undefined
      ).options?.reporter
    ).toEqual(['json'])
  })

  it('does not choose one incompatible selected project configuration silently', async () => {
    const { parseProjectStandardCoverage, resolveProjectStandardCoverage } =
      await import('next/dist/experimental/testing/coverage/options')
    const configured = parseProjectStandardCoverage({
      enabled: true,
      reporter: ['json'],
    })!
    expect(() =>
      resolveProjectStandardCoverage(
        [{ standardCoverage: configured }, {}],
        {},
        undefined
      )
    ).toThrow('same V8 coverage configuration')
    expect(
      resolveProjectStandardCoverage(
        [{ standardCoverage: configured }, {}],
        { coverage: false },
        undefined
      )
    ).toEqual({ enabled: false, configured: true })
    expect(() =>
      parseProjectStandardCoverage({
        enabled: true,
        thresholds: { autoUpdate: true },
      })
    ).toThrow('Unsupported V8 coverage threshold')
    expect(() =>
      parseProjectStandardCoverage({
        enabled: true,
        reporter: [['json', { file: '../file.json' }]],
      })
    ).toThrow('Unsupported V8 coverage reporter option')
  })

  it('preserves unrelated prior report files with clean false through actual formatter publication', async () => {
    const { mkdir } = await import('fs/promises')
    const { publishStandardCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-standard'
    )
    const { parseProjectStandardCoverage } = await import(
      'next/dist/experimental/testing/coverage/options'
    )
    const f = await standardReportFixture()
    try {
      await mkdir(join(f.root, 'coverage'))
      await writeFile(join(f.root, 'coverage/sentinel.txt'), 'retain')
      const config = parseProjectStandardCoverage({
        provider: 'v8',
        enabled: true,
        reporter: ['json', 'html', 'clover'],
        include: ['*.mjs'],
        exclude: ['excluded.mjs'],
        clean: false,
      })!.options
      const result = await publishStandardCoverage({
        ...f,
        projectDir: f.root,
        config,
        status: 'passed',
      })
      expect(result.published).toBe(true)
      // A second real HTML publication retains its regular nested assets.
      expect(
        (
          await publishStandardCoverage({
            ...f,
            projectDir: f.root,
            config,
            status: 'passed',
          })
        ).published
      ).toBe(true)
      expect(
        await readFile(join(f.root, 'coverage/sentinel.txt'), 'utf8')
      ).toBe('retain')
      expect(
        await readFile(join(f.root, 'coverage/index.html'), 'utf8')
      ).toContain('subject.mjs')
      expect(
        await readFile(join(f.root, 'coverage/clover.xml'), 'utf8')
      ).toContain('subject.mjs')
      expect(
        JSON.parse(
          await readFile(join(f.root, 'coverage/coverage-final.json'), 'utf8')
        )[f.file].s
      ).toEqual(f.data.s)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it('cleans the actual dedicated directory before a failed unreported run', async () => {
    const { mkdir } = await import('fs/promises')
    const { prepareStandardCoverageDirectory, publishStandardCoverage } =
      await import('next/dist/experimental/testing/coverage/report-standard')
    const f = await standardReportFixture()
    try {
      await mkdir(join(f.root, 'coverage'))
      await writeFile(join(f.root, 'coverage/sentinel.txt'), 'prior')
      const config = { ...f.config, clean: true }
      await prepareStandardCoverageDirectory(
        f.root,
        config,
        new AbortController().signal
      )
      await expect(
        readFile(join(f.root, 'coverage/sentinel.txt'))
      ).rejects.toMatchObject({ code: 'ENOENT' })
      expect(
        await publishStandardCoverage({
          ...f,
          projectDir: f.root,
          config,
          status: 'failed',
        })
      ).toEqual({ published: false, thresholdErrors: [] })
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })
})

describe('explicitly disabled custom coverage', () => {
  it('rejects a disabled run carrying an actual parent-owned provider session before execution', async () => {
    const { copyFile } = await import('fs/promises')
    const { parseTestConfig } = await import(
      'next/dist/experimental/testing/config'
    )
    const { discoverTests } = await import(
      'next/dist/experimental/testing/discovery'
    )
    const { runTests } = await import(
      'next/dist/experimental/testing/orchestrator'
    )
    const { openCustomCoverageSession } = await import(
      'next/dist/experimental/testing/coverage/custom-session'
    )
    const root = await realpath(
      await mkdtemp(join(tmpdir(), 'next-custom-disable-session-'))
    )
    const source = join(
      __dirname,
      '../app-dir/next-testing-stable-release-gaps/fixtures/custom-coverage-provider'
    )
    let session:
      | Awaited<ReturnType<typeof openCustomCoverageSession>>
      | undefined
    try {
      for (const name of ['contract.case.mjs', 'coverage-provider.mjs'])
        await copyFile(join(source, name), join(root, name))
      const projects = await discoverTests(
        root,
        parseTestConfig({
          projects: [
            {
              name: 'disabled-session',
              include: ['contract.case.mjs'],
              coverage: {
                enabled: true,
                provider: 'custom',
                customProviderModule: './coverage-provider.mjs',
              },
            },
          ],
        })
      )
      const signal = new AbortController().signal
      session = await openCustomCoverageSession({
        projectDir: root,
        config: projects[0].customCoverage!,
        signal,
      })
      await expect(
        runTests(root, projects, {
          signal,
          write() {},
          customCoverageDisabled: true,
          customCoverageRequests: { [projects[0].profile.id]: session.request },
        })
      ).rejects.toThrow(
        'Disabled custom coverage cannot receive provider sessions'
      )
      const trace = (await readFile(join(root, 'provider-trace.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line).name)
      expect(trace).toEqual([
        'get-provider',
        'initialize',
        'resolve',
        'clean',
        'run-start',
      ])
      await expect(
        readFile(join(root, 'custom-coverage.json'))
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await session?.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
  it('matches pristine disabled cases and preserves the actual enabled provider trace and report', () => {
    const { execFileSync } = require('node:child_process')
    const result = execFileSync(
      process.execPath,
      [join(__dirname, 'custom-disable-reports.cjs')],
      { encoding: 'utf8', timeout: 150000 }
    )
    expect(JSON.parse(result)).toEqual({
      profiles: 3,
      cases: 3,
      referenceDisabledProfiles: 2,
      preservedEnabledProfiles: 1,
      customReports: 1,
    })
  }, 160000)
})

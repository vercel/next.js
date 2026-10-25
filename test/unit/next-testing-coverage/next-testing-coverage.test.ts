import { EventEmitter } from 'node:events'
import { promises as customFileSystem } from 'fs'
import { mkdtemp, writeFile, rm, readFile, realpath } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, join } from 'path'
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

describe('production Browser content-hashed source maps', () => {
  async function hashedMapFixture(reference = 'content-hash.js.map') {
    const f = await fixture()
    const baseline = await remapCoverage(f.artifact, f.capture)
    const bytes = `${generated}\n//# sourceMappingURL=${reference}\n`
    await writeFile(join(f.root, 'entry.js'), bytes)
    await writeFile(
      join(f.root, 'content-hash.js.map'),
      JSON.stringify(makeMap(f.subject))
    )
    return {
      ...f,
      bytes,
      baseline,
      options: {
        rootDir: f.root,
        files: ['entry.js', 'content-hash.js.map'],
        projectDir: f.root,
        sourceRootDir: f.root,
        entryFile: join(f.root, 'entry.test.ts'),
        setupFiles: [],
      },
    }
  }

  it('retains the emitted map, source identity and precise counts', async () => {
    const f = await hashedMapFixture()
    try {
      const coverage = await buildCoverageMetadata({
        ...f.options,
        browserSourceMapReferences: true,
      })
      expect(coverage.scripts[0]).toEqual({
        path: 'entry.js',
        sha256: coverageHash(f.bytes),
        mapPath: 'content-hash.js.map',
        mapSha256: coverageHash(
          await readFile(join(f.root, 'content-hash.js.map'))
        ),
      })
      expect(coverage.sources[pathToFileURL(f.subject).href]).toEqual({
        file: f.subject,
        sha256: coverageHash(source),
      })
      const capture = {
        ...f.capture,
        scripts: [{ ...f.capture.scripts[0], sha256: coverageHash(f.bytes) }],
      }
      expect(await remapCoverage({ ...f.artifact, coverage }, capture)).toEqual(
        f.baseline
      )
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it('preserves ordinary metadata discovery without Browser opt-in', async () => {
    const f = await hashedMapFixture()
    try {
      const coverage = await buildCoverageMetadata(f.options)
      expect(coverage.scripts).toEqual([
        { path: 'entry.js', sha256: coverageHash(f.bytes) },
      ])
      expect(coverage.sources).toEqual({})
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it.each([
    'https://example.invalid/content-hash.js.map',
    '/content-hash.js.map',
    '../missing.js.map',
    'content-hash.js.map?query',
    'content-hash.js.map#fragment',
    'content-hash.js.map\\other.js.map',
  ])(
    'rejects a map reference outside its emitted closure: %s',
    async (reference) => {
      const f = await hashedMapFixture(reference)
      try {
        await expect(
          buildCoverageMetadata({
            ...f.options,
            browserSourceMapReferences: true,
          })
        ).rejects.toThrow(
          'Browser coverage source map escaped its output closure'
        )
      } finally {
        await rm(f.root, { recursive: true, force: true })
      }
    }
  )
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
  it.each([
    'normal',
    'body-failure',
    'suite-failure',
    'stop-failure',
    'final-mismatch',
  ])(
    'awaits the actual provider suite hook before stopping the live collector for %s',
    async (mode) => {
      const f = await customFixture(
        mode,
        `
const originalSuite = ReleaseProvider.prototype.onAfterSuiteRun;
ReleaseProvider.prototype.onAfterSuiteRun = async function(meta) {
  originalSuite.call(this, meta);
  await new Promise(resolve => setImmediate(resolve));
  record('suite-settled');
  ${mode === 'suite-failure' ? "throw new Error('suite handoff sentinel');" : ''}
};
${mode === 'stop-failure' ? "import self from './provider.mjs'; const originalStop = self.stopCoverage; self.stopCoverage = function(options) {originalStop(options); throw new Error('collector stop sentinel')};" : ''}
`
      )
      const controller = new AbortController()
      let session: Awaited<ReturnType<typeof openSession>> | undefined
      let expectedProviderFailure = false
      try {
        session = await openSession(f.root, controller.signal, {
          reportOnFailure: true,
        })
        const { execute } = await import(
          'next/dist/experimental/testing/execution/execute'
        )
        const facts: import('next/dist/experimental/testing/coverage/custom-types').CustomCoverageFact[] =
          []
        const trace = async () =>
          (await readFile(join(f.root, 'provider-trace.jsonl'), 'utf8'))
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line).name)
        let handoffs = 0
        const result = await execute(f.artifact, {
          runId: 'custom-suite-run',
          projectDir: f.root,
          entry: f.entry,
          setupFiles: [],
          signal: controller.signal,
          testTimeout: 2000,
          hookTimeout: 1000,
          fileTimeout: 5000,
          snapshotUpdateMode: 'none',
          customCoverage: session.request,
          onEvent() {},
          async onCustomCoverageSuite(completion) {
            handoffs++
            const pid = JSON.parse(
              await readFile(join(f.root, 'body-pid.json'), 'utf8')
            )
            expect(() => process.kill(pid, 0)).not.toThrow()
            expect((await trace()).slice(-1)).toEqual(['take'])
            await session!.afterSuite({
              completion,
              testFiles: ['contract.case.mjs'],
              environment: 'ssr',
            })
            expect((await trace()).slice(-2)).toEqual([
              'suite',
              'suite-settled',
            ])
            expect(() => process.kill(pid, 0)).not.toThrow()
          },
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
        expect(handoffs).toBe(1)
        expect(result.status).toBe(
          mode === 'normal' || mode === 'final-mismatch' ? 'passed' : 'failed'
        )
        expect((await trace()).slice(6)).toEqual([
          'take',
          'suite',
          'suite-settled',
          'stop',
        ])
        await expect(
          readFile(join(f.root, 'custom-coverage.json'))
        ).rejects.toMatchObject({ code: 'ENOENT' })
        if (mode === 'suite-failure' || mode === 'stop-failure') {
          expect(facts).toEqual([])
          expectedProviderFailure = mode === 'suite-failure'
        } else if (mode === 'final-mismatch') {
          const wrong = structuredClone(facts)
          if (!wrong[0].completion.complete)
            throw new Error('Expected complete payload')
          wrong[0].completion.payload = { releasePayload: 0 }
          expectedProviderFailure = true
          await expect(session.finish(wrong, 'passed', true)).rejects.toThrow(
            'matching closed-worker facts'
          )
        } else {
          await session.finish(
            facts,
            result.status as 'passed' | 'failed',
            true
          )
          expect((await trace()).slice(-3)).toEqual([
            'stop',
            'generate',
            'report',
          ])
          expect(
            JSON.parse(
              await readFile(join(f.root, 'custom-coverage.json'), 'utf8')
            )
          ).toEqual({ payloads: [{ releasePayload: 42 }] })
        }
      } finally {
        if (expectedProviderFailure)
          await expect(session?.dispose()).rejects.toThrow()
        else await session?.dispose()
        await rm(f.root, { recursive: true, force: true })
      }
    }
  )
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

describe('mode-specific native Browser coverage certificates', () => {
  const id = 'b'.repeat(64)
  const descriptor = `server/next-test/${id}.client.json`
  const certificate = `server/next-test/${id}.browser-coverage.json`
  async function browserFixture(
    version: 1 | 2,
    fields: Record<string, unknown> = {}
  ) {
    const f = await fixture()
    try {
      const { mkdir } = await import('fs/promises')
      await mkdir(join(f.root, 'server/next-test'), { recursive: true })
      const bootstrap = 'globalThis.nativeCoverageBootstrap = 1;'
      await writeFile(join(f.root, 'bootstrap.js'), bootstrap)
      await writeFile(join(f.root, descriptor), JSON.stringify({ version: 1 }))
      await writeFile(
        join(f.root, certificate),
        JSON.stringify({
          version,
          ...(version === 2
            ? {
                mode: 'production',
                sourceMaps: 'absolute-file-uri',
                preserveOriginalSyntax: true,
              }
            : {}),
          scripts: [
            {
              path: 'bootstrap.js',
              sha256: coverageHash(bootstrap),
              role: 'native-ecmascript-bookkeeping',
            },
          ],
          ...fields,
        })
      )
      const files = [
        ...f.artifact.files,
        'bootstrap.js',
        descriptor,
        certificate,
      ]
      const { buildBrowserCoverageMetadata } = await import(
        'next/dist/experimental/testing/client/coverage-artifact'
      )
      const coverage = await buildBrowserCoverageMetadata({
        rootDir: f.root,
        files,
        projectDir: f.root,
        sourceRootDir: f.root,
        entryFile: join(f.root, 'entry.test.ts'),
        entryPath: descriptor,
        setupFiles: [],
      })
      const artifact = {
        ...f.artifact,
        kind: 'browser' as const,
        sourceHash: coverageHash(''),
        entryPath: descriptor,
        files,
        coverage,
        profile: {
          ...profile,
          mode:
            version === 2 ? ('production' as const) : ('development' as const),
          environment: 'browser' as const,
          browserClient: true as const,
        },
        client: {
          version: 1 as const,
          asyncScope: 'promise-continuations-v1' as const,
          sourceFile: join(f.root, 'entry.test.ts'),
          scripts: ['entry.js', 'bootstrap.js'],
          styles: [],
          outputs: await Promise.all(
            files.map(async (path) => ({
              path,
              sha256: coverageHash(await readFile(join(f.root, path))),
            }))
          ),
        },
      }
      const capture = {
        ...f.capture,
        kind: 'browser-cdp' as const,
        scripts: [
          ...f.capture.scripts,
          {
            path: 'bootstrap.js',
            sha256: coverageHash(bootstrap),
            functions: [
              {
                isBlockCoverage: true,
                ranges: [
                  { startOffset: 0, endOffset: bootstrap.length, count: 1 },
                ],
              },
            ],
          },
        ],
      }
      return { ...f, artifact, capture }
    } catch (error) {
      await rm(f.root, { recursive: true, force: true })
      throw error
    }
  }
  it.each([1, 2] as const)(
    'maps original ranges with a strict version%s Browser certificate',
    async (version) => {
      const f = await browserFixture(version)
      try {
        const { assertBrowserCoverageArtifact } = await import(
          'next/dist/experimental/testing/client/coverage-artifact'
        )
        await expect(
          assertBrowserCoverageArtifact(f.artifact)
        ).resolves.toBeUndefined()
        const result = await remapCoverage(f.artifact, f.capture)
        expect(result.complete).toBe(true)
        expect(result.files).toEqual([
          {
            file: f.subject,
            sha256: coverageHash(source),
            executableLines: [1, 2, 3, 4],
            coveredLines: [1, 2, 4],
          },
        ])
        expect(f.artifact.coverage.sourcePreservation).toBeUndefined()
      } finally {
        await rm(f.root, { recursive: true, force: true })
      }
    }
  )
  it.each([1, 2] as const)(
    'rejects version%s Browser proof reused in the other runtime mode',
    async (version) => {
      const f = await browserFixture(version)
      try {
        f.artifact.profile.mode = version === 1 ? 'production' : 'development'
        const { assertBrowserCoverageArtifact } = await import(
          'next/dist/experimental/testing/client/coverage-artifact'
        )
        await expect(assertBrowserCoverageArtifact(f.artifact)).rejects.toThrow(
          'mode-certified client artifact'
        )
        await expect(remapCoverage(f.artifact, f.capture)).rejects.toThrow(
          'mode-certified client artifact'
        )
      } finally {
        await rm(f.root, { recursive: true, force: true })
      }
    }
  )
  it.each([
    { mode: 'development' },
    { sourceMaps: 'turbopack-uri' },
    { preserveOriginalSyntax: false },
    { extra: true },
  ])(
    'rejects a production certificate without the exact native source profile (%s)',
    async (fields) => {
      await expect(browserFixture(2, fields)).rejects.toThrow(
        'Invalid native browser coverage certificate'
      )
    }
  )
  it.each([
    { version: 1, sectionsByScript: {} },
    { version: 1, sectionsByScript: { 'entry.js': [] } },
    { version: 1, sectionsByScript: { 'missing.js': [{}] } },
    { version: 1, sectionsByScript: { 'entry.js.map': [{}] } },
    { version: 2, sectionsByScript: { 'entry.js': [{}] } },
  ])(
    'rejects empty or foreign Browser import sections (%s)',
    async (importInitializers) => {
      await expect(browserFixture(2, { importInitializers })).rejects.toThrow(
        'Browser import'
      )
    }
  )
  it('keeps Browser import sections out of the original development certificate', async () => {
    await expect(
      browserFixture(1, {
        importInitializers: {
          version: 1,
          sectionsByScript: { 'entry.js': [{}] },
        },
      })
    ).rejects.toThrow('Invalid native browser coverage certificate')
  })
  it('validates the separate development import marker schema without granting production mode', async () => {
    const fields = {
      developmentImports: {
        version: 1,
        mode: 'development',
        sectionsByScript: { 'entry.js': [{}] },
      },
    }
    const f = await browserFixture(1, fields)
    try {
      expect(f.artifact.coverage.browser).toMatchObject({
        version: 1,
        developmentImports: { version: 1, mode: 'development' },
      })
      const { assertBrowserCoverageArtifact } = await import(
        'next/dist/experimental/testing/client/coverage-artifact'
      )
      f.artifact.profile.mode = 'production'
      await expect(assertBrowserCoverageArtifact(f.artifact)).rejects.toThrow(
        'mode-certified client artifact'
      )
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
    await expect(browserFixture(2, fields)).rejects.toThrow(
      'Invalid native browser coverage certificate'
    )
  })
  it.each([
    { version: 2, mode: 'development', sectionsByScript: { 'entry.js': [{}] } },
    { version: 1, mode: 'production', sectionsByScript: { 'entry.js': [{}] } },
    { version: 1, mode: 'development', sectionsByScript: {} },
    { version: 1, mode: 'development', sectionsByScript: { 'entry.js': [] } },
    {
      version: 1,
      mode: 'development',
      sectionsByScript: { 'missing.js': [{}] },
    },
    {
      version: 1,
      mode: 'development',
      sectionsByScript: { 'entry.js.map': [{}] },
    },
    {
      version: 1,
      mode: 'development',
      sectionsByScript: { 'entry.js': [{}] },
      extra: true,
    },
  ])(
    'rejects malformed development import marker fields without interpreting counters: %p',
    async (developmentImports) => {
      await expect(browserFixture(1, { developmentImports })).rejects.toThrow()
    }
  )
  it('keeps actual development import certificate bytes bound after schema decoding', async () => {
    const f = await browserFixture(1, {
      developmentImports: {
        version: 1,
        mode: 'development',
        sectionsByScript: { 'entry.js': [{}] },
      },
    })
    try {
      const { assertBrowserCoverageArtifact } = await import(
        'next/dist/experimental/testing/client/coverage-artifact'
      )
      await writeFile(join(f.root, certificate), 'changed')
      await expect(assertBrowserCoverageArtifact(f.artifact)).rejects.toThrow()
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })
  it('refuses development import requests without actual JSX value imports or the exact live plan', () => {
    const { execFileSync } = require('node:child_process')
    const stdout = execFileSync(
      process.execPath,
      [join(__dirname, 'development-import-plan-controls.mjs')],
      {
        encoding: 'utf8',
        timeout: 90000,
        env: { ...process.env, NODE_ENV: 'development' },
      }
    )
    const prefix = 'NEXT_DEVELOPMENT_IMPORT_PLAN_CONTROLS='
    const completion = stdout
      .split('\n')
      .filter((line: string) => line.startsWith(prefix))
    expect(completion).toHaveLength(1)
    const result = JSON.parse(completion[0].slice(prefix.length))
    expect(result.rows).toEqual([
      'no-jsx',
      'type-only-import',
      'stale-source',
      'mutated-plan',
      'foreign-profile',
      'missing-coverage',
      'wrong-mode',
    ])
    expect(result.closedSessions).toBe(6)
  })
  it('refuses a separate Node source-preservation proof in Browser metadata', async () => {
    const f = await browserFixture(2)
    try {
      f.artifact.coverage.sourcePreservation = {
        version: 1,
        nativeMetadata: {
          path: certificate,
          sha256: coverageHash(await readFile(join(f.root, certificate))),
        },
      }
      const { assertBrowserCoverageArtifact } = await import(
        'next/dist/experimental/testing/client/coverage-artifact'
      )
      await expect(assertBrowserCoverageArtifact(f.artifact)).rejects.toThrow(
        'mode-certified client artifact'
      )
      await expect(remapCoverage(f.artifact, f.capture)).rejects.toThrow(
        'Unrequested production source coverage provenance'
      )
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })
  it.each(['bootstrap.js', 'entry.js.map', certificate])(
    'rejects changed certified Browser output %s',
    async (file) => {
      const f = await browserFixture(2)
      try {
        await writeFile(join(f.root, file), 'changed')
        const { assertBrowserCoverageArtifact } = await import(
          'next/dist/experimental/testing/client/coverage-artifact'
        )
        await expect(assertBrowserCoverageArtifact(f.artifact)).rejects.toThrow(
          'Browser output changed'
        )
      } finally {
        await rm(f.root, { recursive: true, force: true })
      }
    }
  )
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
      sdk161Initializer?: boolean
      missingCapture?: boolean
      hold?: string
      framed?: {
        sdk161?: boolean
        borrowed?: 'context' | 'page'
        tree?: 'extra child' | 'different child' | 'nested child' | 'host URL'
        hostPrecise?: boolean
        hostScriptAfterStart?: boolean
        revokedAfterCapture?: boolean
      }
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
    if (options.framed && !options.engine) options = { ...options, engine: {} }
    const actualInitializer =
      options.sdk161Initializer || options.framed?.sdk161
        ? "(() => {\n      \nif (navigator.serviceWorker) navigator.serviceWorker.register = async () => { console.warn('Service Worker registration blocked by Playwright'); };\n\n    })();"
        : initializer
    let frameLive = true,
      navigated = false
    let rejectHeld!: (reason: unknown) => void
    let heldStarted!: () => void
    const holding = new Promise<void>((resolve) => {
      heldStarted = resolve
    })
    const calls: string[] = []
    const discoveryFilters: unknown[] = []
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
        if (method === 'Target.setDiscoverTargets' && params.discover)
          discoveryFilters.push(params.filter)
        if (
          method === 'Profiler.stopPreciseCoverage' &&
          options.engine?.revokedAfterCapture
        )
          factLive = false
        if (
          method === 'Profiler.stopPreciseCoverage' &&
          options.framed?.revokedAfterCapture
        )
          frameLive = false
        if (method === options.hold) {
          heldStarted()
          return await new Promise((_, reject) => {
            rejectHeld = reject
          })
        }
        if (method === 'Target.getTargetInfo')
          return {
            targetInfo: {
              targetId: 'target',
              type: 'page',
              ...(options.framed ? { url: `${url}host` } : {}),
            },
          }
        if (method === 'Page.getFrameTree') {
          if (!options.framed) return { frameTree: { frame: { id: 'frame' } } }
          const child = {
            frame: {
              id:
                options.framed.tree === 'different child'
                  ? 'borrowed'
                  : 'frame',
              parentId: 'host-frame',
              url: navigated ? url : 'about:blank',
            },
            ...(options.framed.tree === 'nested child'
              ? { childFrames: [{ frame: { id: 'nested' } }] }
              : {}),
          }
          return {
            frameTree: {
              frame: {
                id: 'host-frame',
                url:
                  options.framed.tree === 'host URL'
                    ? `${url}foreign`
                    : `${url}host`,
              },
              childFrames: [
                child,
                ...(options.framed.tree === 'extra child' ? [child] : []),
              ],
            },
          }
        }
        if (method === 'Debugger.enable' && options.framed) {
          for (const [id, uniqueId, frameId] of [
            [10, 'host-realm', 'host-frame'],
            [11, 'old-child-realm', 'frame'],
          ] as const)
            pageSession.emit('Runtime.executionContextCreated', {
              context: {
                id,
                uniqueId,
                origin: new URL(url).origin,
                auxData: { isDefault: true, type: 'default', frameId },
              },
            })
          for (const [scriptId, executionContextId] of [
            ['setup-host', 10],
            ['setup-child', 11],
          ] as const)
            pageSession.emit('Debugger.scriptParsed', {
              scriptId,
              url: '',
              executionContextId,
            })
        }
        if (method === 'Profiler.startPreciseCoverage') {
          if (options.framed) {
            pageSession.emit('Runtime.executionContextDestroyed', {
              executionContextId: 11,
              executionContextUniqueId: 'old-child-realm',
            })
            navigated = true
            pageSession.emit('Page.frameNavigated', {
              frame: { id: 'frame', parentId: 'host-frame', url },
            })
            if (options.framed.hostScriptAfterStart)
              pageSession.emit('Debugger.scriptParsed', {
                scriptId: 'new-host',
                url: '',
                executionContextId: 10,
              })
          }
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
              ...(options.framed?.hostPrecise
                ? [
                    {
                      scriptId: 'setup-host',
                      functions: [
                        {
                          ranges: [
                            {
                              startOffset: 0,
                              endOffset: emitted.length,
                              count: 1,
                            },
                          ],
                        },
                      ],
                    },
                  ]
                : []),
              {
                scriptId: 'initializer',
                functions: [
                  {
                    isBlockCoverage: true,
                    ranges: [
                      {
                        startOffset: 0,
                        endOffset: actualInitializer.length,
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
                  ? actualInitializer + ';'
                  : actualInitializer
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
      const actualContext = {
        _guid: 'actual-context',
        newCDPSession: async () => pageSession,
      } as any
      const actualPage = {
        _guid: 'actual-page',
        context: () => actualContext,
      } as any
      coverage = createClientCoverage({
        artifact,
        browser: { newBrowserCDPSession: async () => targetSession } as any,
        context: actualContext,
        page: actualPage,
        ...(options.framed
          ? {
              hostURL: `${url}host`,
              frameOwner: {
                engine: 'chromium',
                contextGuid:
                  options.framed.borrowed === 'context'
                    ? 'borrowed'
                    : 'actual-context',
                pageGuid:
                  options.framed.borrowed === 'page'
                    ? 'borrowed'
                    : 'actual-page',
                frameGuid: 'actual-frame',
                assertCurrent() {
                  if (!frameLive) throw new Error('Actual child lease revoked')
                },
                nativeFrameId: () => 'frame',
              },
            }
          : {}),
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
      discoveryFilters,
      controller,
      holding,
      onFailure,
      emit: (event: string, value: unknown) => pageSession.emit(event, value),
      emitTarget: (event: string, value: unknown) =>
        targetSession.emit(event, value),
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

  it('excludes browser chrome discovery while retaining only actual authored page ranges', async () => {
    const p = protocol()
    await p.coverage.start()
    expect(p.discoveryFilters).toEqual([
      [
        { type: 'browser', exclude: true },
        { type: 'tab', exclude: true },
        { type: 'browser_ui', exclude: true },
        {},
      ],
    ])
    await p.coverage.take()
    p.coverage.close()
    await p.coverage.afterOwnersClosed()
    expect(
      (await p.coverage.result()).scripts.map((script) => script.path)
    ).toEqual(['entry.js'])
    expect(p.onFailure).not.toHaveBeenCalled()
  })

  it.each([
    ['page', 'about:blank'],
    ['page', 'http://127.0.0.1:4321/popup'],
    ['worker', url + 'worker.js'],
    ['service_worker', url + 'service-worker.js'],
    ['shared_worker', url + 'shared-worker.js'],
    ['iframe', url + 'foreign-frame'],
    ['unknown', 'chrome://omnibox-popup.top-chrome/'],
  ])(
    'rejects a discovered %s target outside its exact page owner (%s)',
    async (type, targetURL) => {
      const p = protocol()
      await p.coverage.start()
      p.emitTarget('Target.targetCreated', {
        targetInfo: { targetId: 'foreign-target', type, url: targetURL },
      })
      expect(p.onFailure).toHaveBeenCalledTimes(1)
      await expect(p.coverage.take()).rejects.toThrow(
        'uncaptured worker, popup, or target'
      )
      p.coverage.close()
      await p.coverage.afterOwnersClosed()
      await expect(p.coverage.result()).rejects.toThrow(
        'uncaptured worker, popup, or target'
      )
    }
  )

  it.each([false, true])(
    'captures only the selected child after real setup-realm retirement (SDK161=%s)',
    async (sdk161) => {
      const p = protocol({ framed: { sdk161 } })
      await p.coverage.start()
      await p.coverage.take()
      await expect(p.coverage.result()).rejects.toThrow('did not close')
      p.coverage.close()
      await p.coverage.afterOwnersClosed()
      expect(
        (await p.coverage.result()).scripts.map((script) => script.path)
      ).toEqual(['entry.js'])
      expect(p.onFailure).not.toHaveBeenCalled()
    }
  )

  it.each(['context', 'page'] as const)(
    'rejects a borrowed child %s GUID before CDP acquisition',
    async (borrowed) => {
      const p = protocol({ framed: { borrowed } })
      await expect(p.coverage.start()).rejects.toThrow(
        'differs from its Page or context'
      )
      expect(p.calls).toEqual([])
      p.coverage.close()
      await p.coverage.afterOwnersClosed()
      await expect(p.coverage.result()).rejects.toThrow('did not close')
    }
  )

  it.each([
    'extra child',
    'different child',
    'nested child',
    'host URL',
  ] as const)('rejects an actual child topology with %s', async (tree) => {
    const p = protocol({ framed: { tree } })
    await expect(p.coverage.start()).rejects.toThrow('actual inert host tree')
    p.coverage.close()
    await p.coverage.afterOwnersClosed()
    await expect(p.coverage.result()).rejects.toThrow('did not close')
  })

  it.each([
    [{ hostPrecise: true }, 'owned default realm'],
    [{ hostScriptAfterStart: true }, 'outside its selected child'],
    [{ revokedAfterCapture: true }, 'Actual child lease revoked'],
  ])(
    'withholds child capture for a host script or revoked actual lease (%s)',
    async (framed, diagnostic) => {
      const p = protocol({ framed })
      let error: unknown
      try {
        await p.coverage.start()
        await p.coverage.take()
      } catch (caught) {
        error = caught
      }
      expect(error).toEqual(
        expect.objectContaining({
          message: expect.stringContaining(diagnostic as string),
        })
      )
      p.coverage.close()
      await p.coverage.afterOwnersClosed()
      await expect(p.coverage.result()).rejects.toThrow()
    }
  )

  it.each([
    ['Page.frameDetached', { frameId: 'frame' }],
    ['Page.frameAttached', { frameId: 'foreign', parentFrameId: 'host-frame' }],
    ['Page.frameNavigated', { frame: { id: 'host-frame', url: `${url}host` } }],
    [
      'Runtime.executionContextDestroyed',
      { executionContextId: 1, executionContextUniqueId: 'realm' },
    ],
  ])('vetoes a selected child after live %s changes', async (event, value) => {
    const p = protocol({ framed: {} })
    await p.coverage.start()
    p.emit(event as string, value)
    expect(p.onFailure).toHaveBeenCalledTimes(1)
    await expect(p.coverage.take()).rejects.toThrow()
    p.coverage.close()
    await p.coverage.afterOwnersClosed()
    await expect(p.coverage.result()).rejects.toThrow()
  })

  it('drains held child CDP capture after cancellation and actual owner closure', async () => {
    const p = protocol({ framed: {}, hold: 'Profiler.enable' })
    const starting = p.coverage.start()
    await p.holding
    const reason = new Error('child owner cancelled')
    p.controller.abort(reason)
    p.coverage.close()
    let joined = false
    const closing = p.coverage.afterOwnersClosed().then(() => {
      joined = true
    })
    await Promise.resolve()
    expect(joined).toBe(false)
    p.rejectHeld(new Error('actual child target terminated'))
    await expect(starting).rejects.toThrow('actual child target terminated')
    await closing
    await expect(p.coverage.result()).rejects.toBe(reason)
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

  it('retains only owned top-frame SDK 1.61 ranges through actual closure', async () => {
    const p = protocol({ sdk161Initializer: true })
    try {
      await p.coverage.start()
      await p.coverage.take()
      await expect(p.coverage.result()).rejects.toThrow('did not close')
      p.coverage.close()
      await p.coverage.afterOwnersClosed()
      expect(
        (await p.coverage.result()).scripts.map((script) => script.path)
      ).toEqual(['entry.js'])
      expect(p.onFailure).not.toHaveBeenCalled()
    } finally {
      p.restore()
    }
  })

  it('rejects changed top-frame SDK 1.61 initializer bytes', async () => {
    const p = protocol({ sdk161Initializer: true, unknownAnonymous: true })
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
    expect(
      parseProjectStandardCoverage({
        enabled: true,
        thresholds: { autoUpdate: true },
      })
    ).toMatchObject({
      enabled: true,
      options: { thresholds: { autoUpdate: true } },
    })
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

describe('project-configured V8 coverage watch', () => {
  it.each([
    ['matrix', { profiles: 8, generations: 16, completeReports: 16 }],
    ['refresh', { profiles: 2, generations: 10, completeReports: 8 }],
    ['empty', { profiles: 6, generations: 12, completeReports: 12 }],
    ['overrides', { profiles: 2, generations: 4, completeReports: 4 }],
    ['defaults', { profiles: 2, generations: 2, completeReports: 2 }],
    ['disabled', { profiles: 4, generations: 8, completeReports: 0 }],
    ['enable', { profiles: 2, generations: 4, completeReports: 4 }],
  ])(
    'matches complete pristine development and production reports for %s',
    (scenario, expected) => {
      const { execFileSync } = require('node:child_process')
      const result = execFileSync(
        process.execPath,
        [
          join(__dirname, 'configured-watch-reports.cjs'),
          `--scenario=${scenario}`,
        ],
        { encoding: 'utf8', timeout: 300000 }
      )
      expect(JSON.parse(result)).toEqual(expected)
    },
    310000
  )
})

it('captures fresh orderly-cancel coverage only after actual dev/prod worker closure', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'orderly-cancel-producer.cjs')],
    { encoding: 'utf8', timeout: 190000 }
  )
  expect(JSON.parse(result)).toEqual({
    profiles: 10,
    cases: 20,
    completeReports: 10,
    closedWorkers: 10,
  })
}, 200000)

it.each([
  'early-seal',
  'foreign-seal',
  'duplicate-seal',
  'spontaneous-signal',
  'late-rejection',
  'before-seal-rejection',
  'nonzero-exit',
])(
  'does not publish actual cancellation capture after %s',
  (control) => {
    const { execFileSync } = require('node:child_process')
    const result = execFileSync(
      process.execPath,
      [
        join(__dirname, 'orderly-cancel-producer.cjs'),
        '--mode=development',
        `--control=${control}`,
      ],
      {
        encoding: 'utf8',
        timeout: 90000,
        env: { ...process.env, NODE_ENV: 'development' },
      }
    )
    const summaries = result
      .split('\n')
      .filter((line) => line.startsWith('{"mode":'))
    expect(summaries).toHaveLength(1)
    expect(JSON.parse(summaries[0])).toEqual({
      mode: 'development',
      control,
      captures: 0,
      closedWorkers: 1,
    })
  },
  100000
)

it('keeps only actual captures in an initial cancelled generation with an unlaunched file', async () => {
  const f = await generationCoverageFixture()
  try {
    const prepared = await f.cache.prepare({
      facts: [f.fact('one', 1)],
      expected: new Set(['one']),
      notExecutedEntryIds: new Set(['two']),
      revisions: new Map([['one', 'one']]),
      registry: await f.registry(),
      cleanOnRerun: false,
    })
    expect(prepared.facts.map((fact) => fact.entryId)).toEqual(['one'])
    expect(prepared.retainedEntryIds.size).toBe(0)
    prepared.commit()
    await expect(
      f.cache.prepare({
        facts: [],
        expected: new Set(['one']),
        notExecutedEntryIds: new Set(['one']),
        revisions: new Map(),
        registry: await f.registry(),
      })
    ).rejects.toThrow('Invalid parent unexecuted')
    await expect(
      f.cache.prepare({
        facts: [],
        expected: new Set(),
        notExecutedEntryIds: new Set(['foreign']),
        revisions: new Map(),
        registry: await f.registry(),
      })
    ).rejects.toThrow('Invalid parent unexecuted')
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it('retains original closed source counters across a queued test edit while preserving source and config vetoes', async () => {
  const f = await runtimeConfigurationGenerationFixture()
  try {
    const initial = await f.makePlan()
    const oldTwo = await f.receipt(initial, 'two')
    ;(await f.prepared(initial, { one: 1, two: 2 })).commit()
    await writeFile(f.two, 'test("changed queued title", () => {})\n')
    const current = await f.makePlan()
    const one = await f.receipt(current, 'one')
    const fresh = f.fact('one', 3, one.compiler.revision)
    const prepare = async () =>
      f.cache.prepare({
        facts: [fresh],
        expected: new Set(['one']),
        notExecutedEntryIds: new Set(['two']),
        revisions: new Map([['one', fresh.revision]]),
        registry: await f.registry(),
        cleanOnRerun: false,
        runtimeConfiguration: { plan: current, receipts: [one] },
      })
    const retained = await prepare()
    expect(
      retained.facts.map((fact) => [fact.entryId, fact.files[0].data.f[0]])
    ).toEqual([
      ['two', 2],
      ['one', 3],
    ])
    expect([...retained.retainedEntryIds]).toEqual(['two'])
    expect(
      retained.runtimeConfigurationReceipts!.find(
        (receipt) => receipt.compiler.entryId === 'two'
      )
    ).toEqual(oldTwo)
    const helperBefore = await readFile(f.helper)
    await writeFile(f.helper, 'export const marker = "changed config"')
    await expect(prepare()).rejects.toThrow(/changed after|configuration/)
    await writeFile(f.helper, helperBefore)
    await writeFile(f.file, f.source + '\n// changed covered source\n')
    await expect(prepare()).rejects.toThrow('source changed')
    await writeFile(f.file, f.source)
    const recovery = await f.prepared(await f.makePlan(), { one: 4, two: 5 })
    expect(recovery.facts.map((fact) => fact.files[0].data.f[0])).toEqual([
      4, 5,
    ])
    expect(recovery.retainedEntryIds.size).toBe(0)
    recovery.commit()
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it('retains a never-launched file across only scheduling metadata revisions with parent coverage context', async () => {
  const f = await generationCoverageFixture()
  try {
    ;(
      await f.cache.prepare({
        facts: [f.fact('one', 1), f.fact('two', 2)],
        expected: new Set(['one', 'two']),
        revisions: new Map([
          ['one', 'one'],
          ['two', 'two'],
        ]),
        registry: await f.registry(undefined, 'before-directory-metadata'),
        retentionConfigurationRevision: 'same-effective-profile-and-config',
        cleanOnRerun: false,
      })
    ).commit()
    const registry = await f.registry(undefined, 'after-directory-metadata')
    const prepare = (
      retentionConfigurationRevision?: string,
      current = registry
    ) =>
      f.cache.prepare({
        facts: [f.fact('one', 3, 'fresh')],
        expected: new Set(['one']),
        notExecutedEntryIds: new Set(['two']),
        revisions: new Map([['one', 'fresh']]),
        registry: current,
        retentionConfigurationRevision,
        cleanOnRerun: false,
      })
    const retained = await prepare('same-effective-profile-and-config')
    expect(
      retained.facts.map((fact) => [fact.entryId, fact.files[0].data.f['0']])
    ).toEqual([
      ['two', 2],
      ['one', 3],
    ])
    expect([...retained.retainedEntryIds]).toEqual(['two'])
    for (const revision of [
      undefined,
      'changed-effective-config',
      'changed-profile',
    ]) {
      const refused = await prepare(revision)
      expect(refused.facts.map((fact) => fact.entryId)).toEqual(['one'])
      expect(refused.retainedEntryIds.size).toBe(0)
    }
    const input = {
      file: f.one,
      sourceHash: coverageHash(await readFile(f.one)),
    }
    const changedInputs = await prepare('same-effective-profile-and-config', {
      ...registry,
      inputs: [input],
    })
    expect(changedInputs.retainedEntryIds.size).toBe(0)
    await expect(
      f.cache.prepare({
        facts: [f.fact('one', 3, 'fresh')],
        expected: new Set(['one']),
        revisions: new Map([['one', 'fresh']]),
        registry,
        retentionConfigurationRevision: 'same-effective-profile-and-config',
        cleanOnRerun: false,
      })
    ).rejects.toThrow('no valid facts')
    expect(
      await f.cache.selectEntryIds({
        registry,
        entryIds: ['one', 'two'],
        selected: ['one'],
        cleanOnRerun: false,
      })
    ).toEqual(['one', 'two'])
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

it('matches pristine cancelled coverage with actually empty interactive new-mode snapshot plans', () => {
  const { execFileSync } = require('node:child_process')
  const stdout = execFileSync(
    process.execPath,
    [join(__dirname, 'orderly-cancel-producer.cjs'), '--snapshot-mode=new'],
    { encoding: 'utf8', timeout: 240000 }
  )
  expect(JSON.parse(stdout)).toEqual({
    profiles: 10,
    cases: 20,
    completeReports: 10,
    closedWorkers: 10,
  })
}, 250000)

it.each(
  (['development', 'production'] as const).flatMap((mode) =>
    (['file', 'inline', 'path', 'cleanup-failure'] as const).map((intent) => ({
      mode,
      intent,
    }))
  )
)(
  'vetoes cancelled coverage for an actual $intent snapshot writer in $mode',
  ({ mode, intent }) => {
    const { execFileSync } = require('node:child_process')
    const stdout = execFileSync(
      process.execPath,
      [
        join(__dirname, 'orderly-cancel-producer.cjs'),
        `--mode=${mode}`,
        '--snapshot-mode=new',
        `--snapshot-intent=${intent}`,
      ],
      {
        encoding: 'utf8',
        timeout: 90000,
        env: { ...process.env, NODE_ENV: mode },
      }
    )
    const rows = stdout
      .split('\n')
      .filter((line: string) => line.startsWith('{"mode":'))
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0])).toEqual({
      mode,
      control: `snapshot-${intent}`,
      captures: 0,
      closedWorkers: 1,
    })
  },
  100000
)

it.each(['development', 'production'] as const)(
  'retains real read-only inline snapshot assertions during new-mode cancellation in %s',
  (mode) => {
    const { execFileSync } = require('node:child_process')
    const stdout = execFileSync(
      process.execPath,
      [
        join(__dirname, 'orderly-cancel-producer.cjs'),
        `--mode=${mode}`,
        '--snapshot-mode=new',
        '--snapshot-intent=read-only',
      ],
      {
        encoding: 'utf8',
        timeout: 90000,
        env: { ...process.env, NODE_ENV: mode },
      }
    )
    const rows = stdout
      .split('\n')
      .filter((line: string) => line.startsWith('{"mode":'))
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0])).toEqual({
      mode,
      cases: 2,
      completeReports: 1,
      closedWorkers: 1,
    })
  },
  100000
)

it.each(
  (['development', 'production'] as const).flatMap((mode) =>
    (['initial', 'prior'] as const).map((kind) => ({ mode, kind }))
  )
)(
  'matches genuine public $mode watch $kind cancellation reports and recovery',
  ({ mode, kind }) => {
    const { execFileSync } = require('node:child_process')
    const stdout = execFileSync(
      process.execPath,
      [
        join(__dirname, 'watch-user-cancel-reports.cjs'),
        `--mode=${mode}`,
        `--kind=${kind}`,
      ],
      { encoding: 'utf8', timeout: 180000 }
    )
    const rows = stdout
      .split('\n')
      .filter((line: string) => line.startsWith('{"mode":'))
    expect(rows).toHaveLength(1)
    const profiles = kind === 'prior' ? 2 : 1
    expect(JSON.parse(rows[0])).toEqual({
      mode,
      kind,
      profiles,
      completeReports: profiles * 2,
      closedWorkers: profiles,
    })
  },
  190000
)

it.each(['development', 'production'] as const)(
  'preserves genuine parallel watch cancellation case, map and selected-file order in %s',
  (mode) => {
    const { execFileSync } = require('node:child_process')
    const stdout = execFileSync(
      process.execPath,
      [
        join(__dirname, 'watch-user-cancel-reports.cjs'),
        `--mode=${mode}`,
        '--kind=parallel',
      ],
      { encoding: 'utf8', timeout: 180000 }
    )
    const rows = stdout
      .split('\n')
      .filter((line: string) => line.startsWith('{"mode":'))
    expect(rows).toHaveLength(1)
    const row = JSON.parse(rows[0])
    expect(row).toMatchObject({
      mode,
      kind: 'parallel',
      profiles: 1,
      completeReports: 2,
      closedWorkers: 2,
    })
    expect(
      row.parallelObservations.map(
        (observation: { phase: string }) => observation.phase
      )
    ).toEqual(['cancelled', 'recovery'])
    for (const observation of row.parallelObservations) {
      expect(observation.trace).toEqual(expect.any(Array))
      expect(observation.processExit).toEqual({
        reference: expect.any(Array),
        actual: expect.any(Array),
        compatible: expect.any(Boolean),
      })
    }
  },
  190000
)

describe('actual Browser import statement composition', () => {
  function body(count: number): StandardCoverageData {
    return {
      path: '/subject.tsx',
      statementMap: {
        0: { start: { line: 3, column: 2 }, end: { line: 3, column: 18 } },
      },
      s: { 0: count },
      fnMap: {},
      f: {},
      branchMap: {},
      b: {},
      meta: {
        lastStatement: 1,
        lastFunction: 0,
        lastBranch: 0,
        seen: {},
        fnNames: {},
      },
    }
  }
  it('keeps declaration zeros separate from distinct real initializer counts', async () => {
    const { bindBrowserImportStatements } = await import(
      'next/dist/experimental/testing/coverage/browser-imports'
    )
    const original = body(0),
      observed = body(9)
    bindBrowserImportStatements(original, observed, [
      { start: { line: 1, column: 7 }, count: 3 },
      { start: { line: 1, column: 18 }, count: 1 },
    ])
    expect(original.s).toEqual({ 0: 0, 1: 0, 2: 0 })
    expect(observed.s).toEqual({ 0: 3, 1: 1, 2: 9 })
    expect(observed.statementMap).toEqual({
      0: { start: { line: 1, column: 7 }, end: { line: 1, column: Infinity } },
      1: { start: { line: 1, column: 18 }, end: { line: 1, column: Infinity } },
      2: { start: { line: 3, column: 2 }, end: { line: 3, column: 18 } },
    })
    expect(original.meta!.lastStatement).toBe(3)
    expect(observed.meta!.lastStatement).toBe(3)
    expect([
      observed.fnMap,
      observed.f,
      observed.branchMap,
      observed.b,
    ]).toEqual([{}, {}, {}, {}])
  })
  it('preserves no-import models without adding a runtime hit', async () => {
    const { bindBrowserImportStatements } = await import(
      'next/dist/experimental/testing/coverage/browser-imports'
    )
    const original = body(0),
      observed = body(9)
    const before = structuredClone([original, observed])
    bindBrowserImportStatements(original, observed, [])
    expect([original, observed]).toEqual(before)
  })
  it('refuses a missing real initializer count', async () => {
    const { bindBrowserImportStatements } = await import(
      'next/dist/experimental/testing/coverage/browser-imports'
    )
    expect(() =>
      bindBrowserImportStatements(body(0), body(9), [
        { start: { line: 1, column: 7 }, count: -1 },
      ])
    ).toThrow('Browser import coverage ownership')
  })
})

describe('native-owned classic JSX conditional child boundaries', () => {
  async function fixture(zero = false) {
    const { parse: parseAuthored } = require('next/dist/compiled/babel/parser')
    const { parse: parseEmitted } = require('next/dist/compiled/acorn')
    const { SourceMapGenerator } = require('next/dist/compiled/source-map')
    const source = await readFile(
      join(
        __dirname,
        'fixtures/browser-production/classic/layout-classic.tsx.txt'
      ),
      'utf8'
    )
    const authored = parseAuthored(source, {
      sourceType: 'module',
      plugins: ['estree', 'jsx', 'typescript'],
    }).program
    const owner = authored.body
      .map((node: any) =>
        node.type === 'ExportNamedDeclaration' ? node.declaration : node
      )
      .find((node: any) => node?.type === 'FunctionDeclaration').body
      .body[0].argument
    const conditional = owner.children[0].expression
    const code =
      '(() => { var nativeReact = context.i(1); function Card({ active }) { return nativeReact["default"].createElement("p", null, active ? "yes" : "no"); } })'
    const emitted = parseEmitted(code, {
      ecmaVersion: 'latest',
      locations: true,
    })
    const call = emitted.body[0].expression.body.body[1].body.body[0].argument
    const file = '/layout-classic.tsx'
    const mapFor = (identity = file, alternateShift = 0) => {
      const map = new SourceMapGenerator()
      for (const [generated, original] of [
        [call.loc.start, owner.loc.start],
        [call.arguments[0].loc.start, owner.openingElement.name.loc.start],
        [call.arguments[2].loc.start, conditional.loc.start],
        [
          call.arguments[2].consequent.loc.start,
          conditional.consequent.loc.start,
        ],
        [
          call.arguments[2].alternate.loc.start,
          conditional.alternate.loc.start,
        ],
      ])
        map.addMapping({
          generated,
          source: identity,
          original:
            original === conditional.alternate.loc.start
              ? {
                  line: original.line,
                  column: original.column + alternateShift,
                }
              : original,
        })
      map.setSourceContent(identity, source)
      return JSON.parse(map.toString())
    }
    const expected = JSON.parse(
      await readFile(
        join(__dirname, 'fixtures/browser-production/classic.expected.json'),
        'utf8'
      ),
      (key, value) => (key === 'column' && value === null ? Infinity : value)
    ).coverage['layout-classic.tsx'] as StandardCoverageData
    expected.path = file
    if (zero) {
      for (const key of ['s', 'f'] as const)
        for (const id of Object.keys(expected[key])) expected[key][id] = 0
      for (const id of Object.keys(expected.b))
        expected.b[id] = expected.b[id].map(() => 0)
    }
    const data = structuredClone(expected)
    data.branchMap['0'].loc.end.column = Infinity
    data.branchMap['0'].locations[1].end.column = Infinity
    delete data.meta!.seen['b:5:22:5:30:5:30:5:38']
    data.meta!.seen['b:5:22:5:30:5:30:5:Infinity'] = 0
    return {
      file,
      authored,
      emitted,
      owner,
      conditional,
      call,
      data,
      expected,
      map: mapFor(),
      mapFor,
      factories: [
        { binding: 'nativeReact', moduleStart: 0, moduleEnd: code.length },
      ],
    }
  }
  it.each([false, true])(
    'preserves every actual count while binding the owned closing name with zero=%s',
    async (zero) => {
      const { bindJsxClassicConditionalChildEnds } = await import(
        'next/dist/experimental/testing/coverage/jsx-owners'
      )
      const f = await fixture(zero)
      const counts = structuredClone([f.data.s, f.data.f, f.data.b])
      bindJsxClassicConditionalChildEnds(
        f.file,
        f.data,
        f.authored,
        f.emitted,
        f.map,
        f.factories
      )
      expect(f.data).toEqual(f.expected)
      expect([f.data.s, f.data.f, f.data.b]).toEqual(counts)
    }
  )
  it('never grants a source-zero repair from authored syntax without an actual factory lease', async () => {
    const { bindJsxClassicConditionalChildEnds } = await import(
      'next/dist/experimental/testing/coverage/jsx-owners'
    )
    const f = await fixture(true),
      before = structuredClone(f.data)
    bindJsxClassicConditionalChildEnds(
      f.file,
      f.data,
      f.authored,
      f.emitted,
      f.map,
      undefined
    )
    expect(f.data).toEqual(before)
  })
  it.each([
    {
      name: 'foreign binding',
      mutate(f: any) {
        f.factories[0].binding = 'foreign'
      },
    },
    {
      name: 'foreign module bounds',
      mutate(f: any) {
        f.factories[0].moduleStart = f.call.end
      },
    },
    {
      name: 'duplicate factory leases',
      mutate(f: any) {
        f.factories.push({ ...f.factories[0] })
      },
    },
    {
      name: 'foreign mapped source',
      mutate(f: any) {
        f.map = f.mapFor('/foreign.tsx')
      },
    },
    {
      name: 'shifted same-source alternate anchor',
      mutate(f: any) {
        f.map = f.mapFor(f.file, 1)
      },
    },
    {
      name: 'mismatched emitted tag',
      mutate(f: any) {
        f.call.arguments[0].value = 'q'
      },
    },
    {
      name: 'duplicate branch association',
      mutate(f: any) {
        f.data.branchMap['1'] = structuredClone(f.data.branchMap['0'])
      },
    },
    {
      name: 'duplicate emitted call association',
      mutate(f: any) {
        f.emitted.duplicate = f.call
      },
    },
    {
      name: 'mismatched closing name',
      mutate(f: any) {
        f.owner.closingElement.name.name = 'q'
      },
    },
    {
      name: 'unowned closing whitespace',
      mutate(f: any) {
        f.owner.closingElement.name.loc.end.column--
      },
    },
    {
      name: 'changed conditional literal',
      mutate(f: any) {
        f.call.arguments[2].alternate.value = 'foreign'
      },
    },
    {
      name: 'incorrect existing seen identity',
      mutate(f: any) {
        f.data.meta.seen['b:5:22:5:30:5:30:5:Infinity'] = 9
      },
    },
  ])(
    'refuses $name without partially editing the coverage model',
    async ({ mutate }) => {
      const { bindJsxClassicConditionalChildEnds } = await import(
        'next/dist/experimental/testing/coverage/jsx-owners'
      )
      const f = await fixture()
      mutate(f)
      const before = structuredClone(f.data)
      expect(() =>
        bindJsxClassicConditionalChildEnds(
          f.file,
          f.data,
          f.authored,
          f.emitted,
          f.map,
          f.factories
        )
      ).toThrow('classic JSX child association')
      expect(f.data).toEqual(before)
    }
  )
})

describe('native-owned named JSX factory role maps', () => {
  async function fixture() {
    const { parse } = require('next/dist/compiled/babel/parser')
    const { SourceMapGenerator } = require('next/dist/compiled/source-map')
    const { decodeCoverageMap } = await import(
      'next/dist/experimental/testing/coverage/maps'
    )
    const { browserNamedJsxRoleMap } = await import(
      'next/dist/experimental/testing/coverage/jsx-owners'
    )
    const source = await readFile(
      join(
        __dirname,
        'fixtures/browser-production/pragma/layout-pragma.tsx.txt'
      ),
      'utf8'
    )
    const parsed = parse(source, {
      sourceType: 'module',
      plugins: ['estree', 'jsx', 'typescript'],
    })
    const authored = parsed.program
    const code =
      '(() => { var nativeReact = context.i(1); function Card({ active }) { return (0, nativeReact["createElement"])("p", null, active ? "yes" : "no"); } const Unused = () => (0, nativeReact["createElement"])("i", null, "unused"); })'
    const emitted = parse(code, { plugins: ['estree'] }).program
    const collect = (ast: any, type: string) => {
      const values: any[] = []
      function visit(node: any) {
        if (!node || typeof node !== 'object') return
        if (Array.isArray(node)) return node.forEach(visit)
        if (node.type === type) values.push(node)
        for (const [key, child] of Object.entries(node))
          if (!['loc', 'comments', 'tokens'].includes(key)) visit(child)
      }
      visit(ast)
      return values
    }
    const owners = collect(authored, 'JSXElement')
    const calls = collect(emitted, 'CallExpression').filter(
      (node) => node.callee.type === 'SequenceExpression'
    )
    const arrow = collect(authored, 'ArrowFunctionExpression')[0],
      actualArrow = collect(emitted, 'ArrowFunctionExpression')[1]
    const authoredBinding = collect(authored, 'VariableDeclarator')[0].id,
      actualBinding = collect(emitted, 'VariableDeclarator').find(
        (node) => node.id.name === 'Unused'
      ).id
    const directive = parsed.comments.find(
      (comment: any) => comment.value.trim() === '* @jsx h'
    )
    const file = '/layout-pragma.tsx'
    const positions: { generated: any; original: any }[] = []
    for (const [index, owner] of owners.entries()) {
      const call = calls[index],
        child = owner.children[0]
      positions.push(
        { generated: call.loc.start, original: owner.loc.start },
        {
          generated: call.arguments[0].loc.start,
          original: owner.openingElement.name.loc.start,
        },
        {
          generated: call.callee.expressions[1].loc.start,
          original: directive.loc.start,
        },
        { generated: call.callee.loc.end, original: directive.loc.end }
      )
      if (child.expression)
        for (const key of ['test', 'consequent', 'alternate'])
          positions.push({
            generated: call.arguments[2][key].loc.start,
            original: child.expression[key].loc.start,
          })
      else
        positions.push({
          generated: call.arguments[2].loc.start,
          original: child.loc.start,
        })
    }
    positions.push(
      {
        generated: actualBinding.loc.start,
        original: authoredBinding.loc.start,
      },
      { generated: actualArrow.loc.start, original: arrow.loc.start }
    )
    const mapFor = (alter = (mapping: any) => mapping) => {
      const map = new SourceMapGenerator()
      for (const mapping of positions)
        map.addMapping(alter({ source: file, ...structuredClone(mapping) }))
      map.setSourceContent(file, source)
      return JSON.parse(map.toString())
    }
    const factories = [
      {
        binding: 'nativeReact',
        moduleStart: 0,
        moduleEnd: code.length,
        namedPragma: {
          local: 'h',
          start: { ...directive.loc.start },
          end: { ...directive.loc.end },
        },
      },
    ]
    const map = mapFor()
    return {
      file,
      authored,
      emitted,
      owners,
      calls,
      factories,
      map,
      mapFor,
      decodeCoverageMap,
      apply: () =>
        browserNamedJsxRoleMap(file, authored, emitted, map, factories),
    }
  }
  it('repairs only the two actual pragma callee roles per owned call and preserves the retained input map', async () => {
    const f = await fixture(),
      before = structuredClone(f.map)
    const { associateArrowBindings } = await import(
      'next/dist/experimental/testing/coverage/arrow-bindings'
    )
    expect(() =>
      associateArrowBindings(f.file, f.authored, f.emitted, f.map)
    ).toThrow('compiler-qualified binding maps')
    const actual = f.apply()!
    const beforeMappings = f.decodeCoverageMap(f.map).mappings,
      after = f.decodeCoverageMap(actual).mappings
    expect(after).toHaveLength(beforeMappings.length)
    let changed = 0
    for (const [index, mapping] of beforeMappings.entries()) {
      if (mapping.originalLine === f.factories[0].namedPragma.start.line) {
        changed++
        expect(after[index].source).toBe(mapping.source)
        expect([
          after[index].generatedLine,
          after[index].generatedColumn,
        ]).toEqual([mapping.generatedLine, mapping.generatedColumn])
      } else expect(after[index]).toEqual(mapping)
    }
    expect(changed).toBe(4)
    expect(
      associateArrowBindings(f.file, f.authored, f.emitted, actual)
    ).toHaveLength(1)
    expect(f.map).toEqual(before)
  })
  it('keeps the existing default React factory record outside named role mapping', async () => {
    const f = await fixture(),
      { browserNamedJsxRoleMap } = await import(
        'next/dist/experimental/testing/coverage/jsx-owners'
      )
    const { namedPragma: _pragma, ...legacy } = f.factories[0]
    expect(
      browserNamedJsxRoleMap(f.file, f.authored, f.emitted, f.map, [legacy])
    ).toBeUndefined()
  })
  it.each([
    [
      'wrong directive start',
      (f: any) => {
        f.factories[0].namedPragma.start.column++
      },
    ],
    [
      'wrong directive end',
      (f: any) => {
        f.factories[0].namedPragma.end.column++
      },
    ],
    [
      'foreign binding',
      (f: any) => {
        f.factories[0].binding = 'foreign'
      },
    ],
    [
      'foreign module',
      (f: any) => {
        f.factories[0].moduleStart = f.calls[0].end
      },
    ],
    [
      'foreign function scope',
      (f: any) => {
        f.emitted.body[0].expression.body.body[1].params.push({
          type: 'Identifier',
          name: 'nativeReact',
        })
      },
    ],
    [
      'duplicate factory',
      (f: any) => {
        f.factories.push(structuredClone(f.factories[0]))
      },
    ],
    [
      'duplicate emitted call',
      (f: any) => {
        f.emitted.body.push(structuredClone(f.calls[0]))
      },
    ],
    [
      'wrong sequence prefix',
      (f: any) => {
        f.calls[0].callee.expressions[0].value = 1
      },
    ],
    [
      'wrong callee property',
      (f: any) => {
        f.calls[0].callee.expressions[1].property.value = 'other'
      },
    ],
    [
      'wrong tag',
      (f: any) => {
        f.calls[0].arguments[0].value = 'other'
      },
    ],
    [
      'wrong child',
      (f: any) => {
        f.calls[0].arguments[2].alternate.value = 'other'
      },
    ],
  ])('refuses %s without changing original map', async (_name, change) => {
    const f = await fixture(),
      before = structuredClone(f.map)
    change(f)
    expect(f.apply).toThrow('named JSX factory role is ambiguous or absent')
    expect(f.map).toEqual(before)
  })
  it.each(['foreign callee source', 'wrong mapped directive endpoint'])(
    'refuses %s without rewriting any mapping',
    async (kind) => {
      const f = await fixture()
      const { browserNamedJsxRoleMap } = await import(
        'next/dist/experimental/testing/coverage/jsx-owners'
      )
      const map = f.mapFor((mapping: any) => {
        if (mapping.original.line === f.factories[0].namedPragma.start.line) {
          if (kind === 'foreign callee source') mapping.source = '/foreign.tsx'
          else mapping.original.column++
        }
        return mapping
      })
      const before = structuredClone(map)
      expect(() =>
        browserNamedJsxRoleMap(f.file, f.authored, f.emitted, map, f.factories)
      ).toThrow('named JSX factory role is ambiguous or absent')
      expect(map).toEqual(before)
    }
  )
})

describe('native-owned named JSX fragment roles', () => {
  async function fixture(zero = false) {
    const { parse } = require('next/dist/compiled/babel/parser'),
      { SourceMapGenerator } = require('next/dist/compiled/source-map')
    const { browserNamedJsxRoleMap, bindJsxNamedFragmentConditionalChildEnds } =
      await import('next/dist/experimental/testing/coverage/jsx-owners')
    const { decodeCoverageMap } = await import(
      'next/dist/experimental/testing/coverage/maps'
    )
    const source = await readFile(
      join(
        __dirname,
        'fixtures/browser-production/pragmafrag/layout-pragmafrag.tsx.txt'
      ),
      'utf8'
    )
    const parsed = parse(source, {
      sourceType: 'module',
      plugins: ['estree', 'jsx', 'typescript'],
    })
    const code =
      '(() => { var nativeReact = context.i(1); function Card({ active }) { return (0, nativeReact["createElement"])(nativeReact["Fragment"], null, active ? "yes" : "no"); } const Unused = () => (0, nativeReact["createElement"])("i", null, "unused"); })'
    const authored = parsed.program,
      emitted = parse(code, { plugins: ['estree'] }).program
    function collect(ast: any, predicate: (node: any) => boolean) {
      const values: any[] = []
      function visit(node: any) {
        if (!node || typeof node !== 'object') return
        if (Array.isArray(node)) return node.forEach(visit)
        if (predicate(node)) values.push(node)
        for (const [key, child] of Object.entries(node))
          if (!['loc', 'comments', 'tokens'].includes(key)) visit(child)
      }
      visit(ast)
      return values
    }
    const owners = collect(authored, (node) =>
      ['JSXElement', 'JSXFragment'].includes(node.type)
    )
    const calls = collect(
      emitted,
      (node) =>
        node.type === 'CallExpression' &&
        node.callee.type === 'SequenceExpression'
    )
    const directive = parsed.comments.find(
        (comment: any) => comment.value.trim() === '* @jsx h'
      ),
      fragmentDirective = parsed.comments.find(
        (comment: any) => comment.value.trim() === '* @jsxFrag Frag'
      )
    const file = '/layout-pragmafrag.tsx'
    const positions: { generated: any; original: any; role?: true }[] = []
    for (const [index, owner] of owners.entries()) {
      const call = calls[index],
        child = owner.children[0]
      positions.push(
        { generated: call.loc.start, original: owner.loc.start },
        {
          generated: call.callee.expressions[1].loc.start,
          original: directive.loc.start,
          role: true,
        },
        {
          generated: call.callee.loc.end,
          original: directive.loc.end,
          role: true,
        }
      )
      if (owner.type === 'JSXFragment')
        positions.push(
          {
            generated: call.arguments[0].loc.start,
            original: fragmentDirective.loc.start,
            role: true,
          },
          {
            generated: call.arguments[0].loc.end,
            original: fragmentDirective.loc.end,
            role: true,
          }
        )
      else
        positions.push({
          generated: call.arguments[0].loc.start,
          original: owner.openingElement.name.loc.start,
        })
      if (child.expression)
        for (const key of ['test', 'consequent', 'alternate'])
          positions.push({
            generated: call.arguments[2][key].loc.start,
            original: child.expression[key].loc.start,
          })
      else
        positions.push({
          generated: call.arguments[2].loc.start,
          original: child.loc.start,
        })
    }
    const mapFor = (alter = (mapping: any) => mapping) => {
      const map = new SourceMapGenerator()
      for (const { role: _role, ...position } of positions)
        map.addMapping(alter({ source: file, ...structuredClone(position) }))
      map.setSourceContent(file, source)
      return JSON.parse(map.toString())
    }
    const factories = [
      {
        binding: 'nativeReact',
        moduleStart: 0,
        moduleEnd: code.length,
        namedPragma: {
          local: 'h',
          start: { ...directive.loc.start },
          end: { ...directive.loc.end },
          fragment: {
            local: 'Frag',
            start: { ...fragmentDirective.loc.start },
            end: { ...fragmentDirective.loc.end },
          },
        },
      },
    ]
    const expected = JSON.parse(
      await readFile(
        join(__dirname, 'fixtures/browser-production/pragmafrag.expected.json'),
        'utf8'
      ),
      (key, value) => (key === 'column' && value === null ? Infinity : value)
    ).coverage['layout-pragmafrag.tsx'] as StandardCoverageData
    expected.path = file
    if (zero) {
      for (const key of ['s', 'f'] as const)
        for (const id of Object.keys(expected[key])) expected[key][id] = 0
      for (const id of Object.keys(expected.b))
        expected.b[id] = expected.b[id].map(() => 0)
    }
    const data = structuredClone(expected),
      branch = data.branchMap['0']
    const oldKey = Object.keys(data.meta!.seen).find((key) =>
      key.startsWith('b:')
    )!
    branch.loc.end.column = Infinity
    branch.locations[1].end.column = Infinity
    delete data.meta!.seen[oldKey]
    data.meta!.seen[
      'b:' +
        branch.locations
          .flatMap(({ start, end }) => [
            start.line,
            start.column,
            end.line,
            end.column,
          ])
          .join(':')
    ] = 0
    const map = mapFor()
    return {
      file,
      authored,
      emitted,
      owners,
      calls,
      factories,
      data,
      expected,
      map,
      mapFor,
      decodeCoverageMap,
      roleMap: () =>
        browserNamedJsxRoleMap(file, authored, emitted, map, factories),
      bind: (mapped: object) =>
        bindJsxNamedFragmentConditionalChildEnds(
          file,
          data,
          authored,
          emitted,
          mapped,
          factories
        ),
    }
  }
  it.each([false, true])(
    'keeps full genuine maps/counts and uses the real fragment close for zero=%s',
    async (zero) => {
      const f = await fixture(zero),
        before = structuredClone(f.map),
        counts = structuredClone([f.data.s, f.data.f, f.data.b])
      const mapped = f.roleMap()!
      f.bind(mapped)
      expect(f.data).toEqual(f.expected)
      expect([f.data.s, f.data.f, f.data.b]).toEqual(counts)
      expect(f.map).toEqual(before)
    }
  )
  it('changes only both actual factory and fragment directive endpoint mappings', async () => {
    const f = await fixture(),
      before = f.decodeCoverageMap(f.map).mappings,
      after = f.decodeCoverageMap(f.roleMap()).mappings
    expect(after).toHaveLength(before.length)
    let changed = 0
    for (const [index, mapping] of before.entries()) {
      if (
        [
          f.factories[0].namedPragma.start.line,
          f.factories[0].namedPragma.fragment.start.line,
        ].includes(mapping.originalLine!)
      ) {
        changed++
        expect(after[index].source).toBe(mapping.source)
        expect([
          after[index].generatedLine,
          after[index].generatedColumn,
        ]).toEqual([mapping.generatedLine, mapping.generatedColumn])
      } else expect(after[index]).toEqual(mapping)
    }
    expect(changed).toBe(6)
  })
  it('does not derive a declaration-zero fragment close without its real native fragment fact', async () => {
    const f = await fixture(true),
      { bindJsxNamedFragmentConditionalChildEnds } = await import(
        'next/dist/experimental/testing/coverage/jsx-owners'
      )
    const { fragment: _fragment, ...namedPragma } = f.factories[0].namedPragma
    const before = structuredClone(f.data)
    bindJsxNamedFragmentConditionalChildEnds(
      f.file,
      f.data,
      f.authored,
      f.emitted,
      f.map,
      [{ ...f.factories[0], namedPragma }]
    )
    expect(f.data).toEqual(before)
  })
  it.each([
    [
      'absent fragment fact',
      (f: any) => {
        delete f.factories[0].namedPragma.fragment
      },
    ],
    [
      'wrong fragment directive start',
      (f: any) => {
        f.factories[0].namedPragma.fragment.start.column++
      },
    ],
    [
      'wrong fragment directive end',
      (f: any) => {
        f.factories[0].namedPragma.fragment.end.column++
      },
    ],
    [
      'foreign fragment namespace',
      (f: any) => {
        f.calls[0].arguments[0].object.name = 'foreign'
      },
    ],
    [
      'foreign fragment property',
      (f: any) => {
        f.calls[0].arguments[0].property.value = 'Other'
      },
    ],
    [
      'duplicate fragment call',
      (f: any) => {
        f.emitted.body.push(structuredClone(f.calls[0]))
      },
    ],
    [
      'foreign function scope',
      (f: any) => {
        f.emitted.body[0].expression.body.body[1].params.push({
          type: 'Identifier',
          name: 'nativeReact',
        })
      },
    ],
  ])(
    'refuses %s without changing any original mapping',
    async (_name, change) => {
      const f = await fixture(),
        before = structuredClone(f.map)
      change(f)
      expect(f.roleMap).toThrow('named JSX factory role is ambiguous or absent')
      expect(f.map).toEqual(before)
    }
  )
  it.each(['foreign fragment map', 'wrong fragment mapped endpoint'])(
    'refuses %s',
    async (kind) => {
      const f = await fixture(),
        { browserNamedJsxRoleMap } = await import(
          'next/dist/experimental/testing/coverage/jsx-owners'
        )
      const map = f.mapFor((mapping: any) => {
          if (
            mapping.original.line ===
            f.factories[0].namedPragma.fragment.start.line
          ) {
            if (kind === 'foreign fragment map') mapping.source = '/foreign.tsx'
            else mapping.original.column++
          }
          return mapping
        }),
        before = structuredClone(map)
      expect(() =>
        browserNamedJsxRoleMap(f.file, f.authored, f.emitted, map, f.factories)
      ).toThrow('named JSX factory role is ambiguous or absent')
      expect(map).toEqual(before)
    }
  )
  it.each([
    [
      'wrong closing fragment',
      (f: any) => {
        f.owners[0].closingFragment.loc.end.column--
      },
    ],
    [
      'duplicate branch',
      (f: any) => {
        f.data.branchMap['1'] = structuredClone(f.data.branchMap['0'])
      },
    ],
    [
      'wrong seen key',
      (f: any) => {
        f.data.meta.seen = {}
      },
    ],
  ])(
    'refuses %s without partially changing counters or model',
    async (_name, change) => {
      const f = await fixture(),
        mapped = f.roleMap()!
      change(f)
      const before = structuredClone(f.data)
      expect(() => f.bind(mapped)).toThrow(
        'classic JSX fragment child association is ambiguous or absent'
      )
      expect(f.data).toEqual(before)
    }
  )
})

describe('native-owned Browser JSX call associations', () => {
  const profiles =
    require('./fixtures/browser-production/child-shapes.emission.json').profiles
  async function fixture(record = profiles[0]) {
    const { parse: authoredParse } = require('next/dist/compiled/babel/parser')
    const { parse: emittedParse } = require('next/dist/compiled/acorn')
    const { associateBrowserJsxCalls } = await import(
      'next/dist/experimental/testing/coverage/browser-jsx-associations'
    )
    const authored = authoredParse(record.source, {
      sourceType: 'module',
      plugins: ['estree', 'jsx', 'typescript'],
    }).program
    const emitted = emittedParse(record.code, {
      ecmaVersion: 'latest',
      locations: true,
      sourceType: 'module',
    })
    function collect(value: any): any[] {
      if (!value || typeof value !== 'object') return []
      if (Array.isArray(value)) return value.flatMap(collect)
      return [
        ...(value.type ? [value] : []),
        ...Object.entries(value)
          .filter(([key]) => !['loc', 'comments', 'tokens'].includes(key))
          .flatMap(([, child]) => collect(child)),
      ]
    }
    const options: Parameters<typeof associateBrowserJsxCalls>[0] = {
      file: record.file,
      code: record.code,
      authored,
      emitted,
      sourceMap: structuredClone(record.map),
      ...(record.factory.imports
        ? { automatic: [structuredClone(record.factory)] }
        : { classic: [structuredClone(record.factory)] }),
    }
    return {
      record,
      authored,
      emitted,
      options,
      collect,
      apply: () => associateBrowserJsxCalls(options),
    }
  }
  it.each(
    profiles.flatMap((record: any) =>
      [0, 3].map((count) => [record.name, count, record])
    )
  )(
    'preserves all counter identities for actual emitted %s with count=%s',
    async (_name, count, record) => {
      const f = await fixture(record)
      const inputs = JSON.stringify(f.options)
      const result = f.apply()!
      expect(result).toBeDefined()
      expect(JSON.stringify(f.options)).toBe(inputs)
      const before = decodeCoverageMap(f.options.sourceMap)
      const after = decodeCoverageMap(result.sourceMap)
      expect(after.sources).toEqual(before.sources)
      for (const mapping of before.mappings)
        expect(after.mappings).toContainEqual(mapping)
      expect(result.children.size).toBe(
        /-(logical|conditional)\.tsx$/.test(record.name) ? 1 : 0
      )
      const { convert } = require('next/dist/compiled/next-test-coverage')
      const ast = structuredClone(f.emitted)
      ast.body[0].expression.body.body =
        ast.body[0].expression.body.body.filter(
          (node: any) =>
            node.type !== 'VariableDeclaration' ||
            node.declarations[0].id.name !== record.factory.binding
        )
      const convertMap = async (sourceMap: unknown) =>
        (
          await convert({
            code: record.code,
            ast: structuredClone(ast),
            sourceMap,
            coverage: {
              url: 'file:///browser-children/generated.js',
              functions: [
                {
                  isBlockCoverage: true,
                  ranges: [
                    { startOffset: 0, endOffset: record.code.length, count },
                  ],
                },
              ],
            },
          })
        )[record.file]
      const previous = await convertMap(f.options.sourceMap)
      const actual = await convertMap(result.sourceMap)
      expect([actual.s, actual.f, actual.b]).toEqual([
        previous.s,
        previous.f,
        previous.b,
      ])
      expect(JSON.parse(JSON.stringify(actual.branchMap))).toEqual(
        record.expected.branchMap
      )
      expect(JSON.parse(JSON.stringify(actual.statementMap['0']))).toEqual(
        record.expected.statementMap['0']
      )
    }
  )
  it('does not infer a factory from source syntax or a named pragma descriptor', async () => {
    const f = await fixture(
      profiles.find((record: any) => record.name === 'shape-classic-props.tsx')
    )
    delete f.options.classic
    expect(f.apply()).toBeUndefined()
    f.options.classic = [
      {
        ...f.record.factory,
        namedPragma: {
          local: 'h',
          start: { line: 1, column: 0 },
          end: { line: 1, column: 13 },
        },
      },
    ]
    expect(f.apply()).toBeUndefined()
  })
  it.each([
    'foreign binding',
    'wrong module',
    'shadowed namespace',
    'different child',
    'different property',
    'duplicate property',
    'different closing tag',
    'foreign map',
    'conflicting terminal',
    'duplicated call',
    'wrong token',
  ])('rejects %s atomically', async (kind) => {
    const f = await fixture(
      profiles.find((record: any) => record.name === 'shape-classic-props.tsx')
    )
    const calls = f
      .collect(f.emitted)
      .filter(
        (node: any) =>
          node.type === 'CallExpression' && node.arguments[0]?.value === 'p'
      )
    const call = calls[0]
    if (kind === 'foreign binding')
      f.options.classic![0].binding = 'foreignReact'
    if (kind === 'wrong module') f.options.classic![0].moduleEnd = call.start
    if (kind === 'shadowed namespace') {
      const fn = f
        .collect(f.emitted)
        .find((node: any) => node.type === 'FunctionDeclaration')
      fn.params.push({ type: 'Identifier', name: f.record.factory.binding })
    }
    if (kind === 'different child') call.arguments[2].name = 'different'
    if (kind === 'different property')
      call.arguments[1].properties[0].key.name = 'different'
    if (kind === 'duplicate property')
      call.arguments[1].properties.push(
        structuredClone(call.arguments[1].properties[0])
      )
    if (kind === 'different closing tag') {
      f
        .collect(f.authored)
        .find((node: any) => node.type === 'JSXClosingElement').name.name =
        'foreign'
    }
    if (kind === 'foreign map' || kind === 'conflicting terminal') {
      const { SourceMapGenerator } = require('next/dist/compiled/source-map')
      const map = new SourceMapGenerator()
      const decoded = decodeCoverageMap(f.options.sourceMap)
      for (const mapping of decoded.mappings) {
        const generated = {
          line: mapping.generatedLine,
          column: mapping.generatedColumn,
        }
        if (mapping.source === null) map.addMapping({ generated })
        else
          map.addMapping({
            generated,
            source: mapping.source,
            original: {
              line: mapping.originalLine,
              column: mapping.originalColumn,
            },
          })
      }
      for (const [source, content] of decoded.sources)
        if (content !== null) map.setSourceContent(source, content)
      map.addMapping({
        generated:
          kind === 'foreign map'
            ? call.arguments[2].loc.start
            : { line: call.loc.end.line, column: call.loc.end.column - 1 },
        source: '/foreign.tsx',
        original: { line: 1, column: 0 },
      })
      map.setSourceContent('/foreign.tsx', 'foreign')
      f.options.sourceMap = JSON.parse(map.toString())
    }
    if (kind === 'duplicated call')
      f.emitted.body.push({ type: 'ExpressionStatement', expression: call })
    if (kind === 'wrong token')
      f.options.code =
        f.options.code.slice(0, call.end - 1) +
        ']' +
        f.options.code.slice(call.end)
    const inputs = JSON.stringify(f.options)
    expect(f.apply).toThrow(
      'Browser JSX call association is ambiguous or absent'
    )
    expect(JSON.stringify(f.options)).toBe(inputs)
  })
})

describe('native-owned named Browser JSX child associations', () => {
  const profiles =
    require('./fixtures/browser-production/named-child-shapes.emission.json').profiles
  async function fixture(record = profiles[0]) {
    const { parse: parseAuthored } = require('next/dist/compiled/babel/parser')
    const { parse: parseEmitted } = require('next/dist/compiled/acorn')
    const { associateBrowserJsxCalls } = await import(
      'next/dist/experimental/testing/coverage/browser-jsx-associations'
    )
    const parsed = parseAuthored(record.source, {
      sourceType: 'module',
      plugins: ['estree', 'jsx', 'typescript'],
    })
    const authored = Object.assign(parsed.program, {
      comments: parsed.comments,
    })
    const emitted = parseEmitted(record.code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
    })
    function collect(value: any): any[] {
      if (!value || typeof value !== 'object') return []
      if (Array.isArray(value)) return value.flatMap(collect)
      return [
        ...(value.type ? [value] : []),
        ...Object.entries(value)
          .filter(([key]) => !['loc', 'comments', 'tokens'].includes(key))
          .flatMap(([, child]) => collect(child)),
      ]
    }
    const options: Parameters<typeof associateBrowserJsxCalls>[0] = {
      file: record.file,
      code: record.code,
      authored,
      emitted,
      sourceMap: structuredClone(record.map),
      classic: [structuredClone(record.factory)],
    }
    return {
      record,
      authored,
      emitted,
      options,
      collect,
      apply: () => associateBrowserJsxCalls(options),
    }
  }
  it.each(
    profiles.flatMap((record: any) =>
      [0, 3].map((count) => [record.name, count, record])
    )
  )(
    'preserves actual source/native role and every counter for %s with count=%s',
    async (_name, count, record) => {
      const f = await fixture(record),
        inputs = JSON.stringify(f.options)
      expect(coverageHash(record.source)).toBe(record.sourceSHA)
      const result = f.apply()!
      expect(result).toBeDefined()
      expect(JSON.stringify(f.options)).toBe(inputs)
      const before = decodeCoverageMap(f.options.sourceMap),
        after = decodeCoverageMap(result.sourceMap)
      expect(after.sources).toEqual(before.sources)
      const changed = before.mappings.filter(
        (mapping) =>
          !after.mappings.some(
            (actual) => JSON.stringify(actual) === JSON.stringify(mapping)
          )
      )
      const owners = f
        .collect(f.authored)
        .filter((node: any) =>
          ['JSXElement', 'JSXFragment'].includes(node.type)
        )
      expect(changed).toHaveLength(
        owners.length * 2 +
          owners.filter((node: any) => node.type === 'JSXFragment').length * 2
      )
      const directive = record.factory.namedPragma
      const permitted = [
        directive.start,
        directive.end,
        directive.fragment?.start,
        directive.fragment?.end,
      ].filter(Boolean)
      for (const mapping of changed) {
        expect(mapping.source).toBe(record.file)
        expect(
          permitted.some(
            (point: any) =>
              point.line === mapping.originalLine &&
              point.column === mapping.originalColumn
          )
        ).toBe(true)
        const actual = after.mappings.filter(
          (point) =>
            point.generatedLine === mapping.generatedLine &&
            point.generatedColumn === mapping.generatedColumn
        )
        expect(actual).toHaveLength(1)
        expect(
          owners.some(
            (owner: any) =>
              owner.loc.start.line === actual[0].originalLine &&
              owner.loc.start.column === actual[0].originalColumn
          )
        ).toBe(true)
        expect((actual[0] as any).name).toBe((mapping as any).name)
      }
      const { convert } = require('next/dist/compiled/next-test-coverage'),
        ast = structuredClone(f.emitted)
      ast.body[0].expression.body.body =
        ast.body[0].expression.body.body.filter(
          (node: any) =>
            node.type !== 'VariableDeclaration' ||
            node.declarations[0].id.name !== record.factory.binding
        )
      const convertMap = async (sourceMap: unknown) =>
        (
          await convert({
            code: record.code,
            ast: structuredClone(ast),
            sourceMap,
            coverage: {
              url: 'file:///browser-children/generated.js',
              functions: [
                {
                  isBlockCoverage: true,
                  ranges: [
                    { startOffset: 0, endOffset: record.code.length, count },
                  ],
                },
              ],
            },
          })
        )[record.file]
      const original = await convertMap(f.options.sourceMap),
        actual = await convertMap(result.sourceMap)
      expect([actual.s, actual.f, actual.b]).toEqual([
        original.s,
        original.f,
        original.b,
      ])
      expect(JSON.parse(JSON.stringify(actual.branchMap))).toEqual(
        record.expected.branchMap
      )
      expect(JSON.parse(JSON.stringify(actual.statementMap['0']))).toEqual(
        record.expected.statementMap['0']
      )
    }
  )
  it.each([
    'missing factory',
    'wrong directive',
    'wrong endpoint',
    'missing fragment owner',
  ])('never infers a named role from %s', async (kind) => {
    const f = await fixture(
      profiles.find((record: any) => record.name === 'shape-named-fragment.tsx')
    )
    if (kind === 'missing factory') delete f.options.classic
    if (kind === 'wrong directive')
      f.authored.comments[1].value = '* @jsx foreign'
    if (kind === 'wrong endpoint')
      f.options.classic![0].namedPragma!.end.column--
    if (kind === 'missing fragment owner')
      delete f.options.classic![0].namedPragma!.fragment
    expect(f.apply()).toBeUndefined()
  })
  it.each([
    'foreign callee',
    'foreign fragment',
    'different child',
    'duplicate call',
    'foreign scope',
    'wrong directive map',
  ])('rejects %s without changing retained inputs', async (kind) => {
    const f = await fixture(
      profiles.find((record: any) => record.name === 'shape-named-fragment.tsx')
    )
    const calls = f
      .collect(f.emitted)
      .filter(
        (node: any) =>
          node.type === 'CallExpression' &&
          node.callee.type === 'SequenceExpression'
      )
    if (kind === 'foreign callee')
      calls[0].callee.expressions[1].property.value = 'foreign'
    if (kind === 'foreign fragment')
      calls[0].arguments[0].object.name = 'foreign'
    if (kind === 'different child') calls[0].arguments[2].name = 'foreign'
    if (kind === 'duplicate call')
      f.emitted.body.push({ type: 'ExpressionStatement', expression: calls[0] })
    if (kind === 'foreign scope')
      f.collect(f.emitted)
        .find((node: any) => node.type === 'FunctionDeclaration')
        .params.push({ type: 'Identifier', name: f.record.factory.binding })
    if (kind === 'wrong directive map') {
      const { SourceMapGenerator } = require('next/dist/compiled/source-map'),
        map = new SourceMapGenerator(),
        decoded = decodeCoverageMap(f.options.sourceMap)
      const target = calls[0].callee.expressions[1].loc.start
      for (const mapping of decoded.mappings) {
        const generated = {
          line: mapping.generatedLine,
          column: mapping.generatedColumn,
        }
        if (mapping.source === null) map.addMapping({ generated })
        else
          map.addMapping({
            generated,
            source: mapping.source,
            original: {
              line: mapping.originalLine,
              column:
                mapping.originalColumn! +
                (generated.line === target.line &&
                generated.column === target.column
                  ? 1
                  : 0),
            },
            ...((mapping as any).name ? { name: (mapping as any).name } : {}),
          })
      }
      for (const [source, content] of decoded.sources)
        if (content !== null) map.setSourceContent(source, content)
      f.options.sourceMap = JSON.parse(map.toString())
    }
    const inputs = JSON.stringify(f.options)
    expect(f.apply).toThrow(
      'Browser JSX call association is ambiguous or absent'
    )
    expect(JSON.stringify(f.options)).toBe(inputs)
  })
})

describe('native-retained unused named JSX Fragment imports', () => {
  async function fixture(
    change: string = 'none',
    aliases = false,
    defaultMode: 'absent' | 'retained' | 'removed' = 'absent'
  ) {
    const { parse: parseAuthored } = require('next/dist/compiled/babel/parser'),
      { parse: parseEmitted } = require('next/dist/compiled/acorn'),
      { SourceMapGenerator } = require('next/dist/compiled/source-map')
    const { buildBrowserCoverageMetadata } = await import(
      'next/dist/experimental/testing/client/coverage-artifact'
    )
    const { prepareBrowserImportInitializers } = await import(
      'next/dist/experimental/testing/coverage/browser-imports'
    )
    const root = await realpath(
        await mkdtemp(join(tmpdir(), 'next-browser-retained-jsx-'))
      ),
      file = join(root, 'subject.tsx'),
      entryFile = join(root, 'entry.test.tsx')
    try {
      let source =
        "/** @jsxRuntime classic */\n/** @jsx h */\n/** @jsxFrag Frag */\nimport { createElement as h, Fragment as Frag } from 'react'\nexport function Card() { return <i>unused</i> }\n"
      if (defaultMode !== 'absent')
        source = source.replace('import {', 'import React, {')
      if (defaultMode === 'retained' || change === 'live default')
        source += 'export const Base = React.Component\n'
      if (change === 'default component tag')
        source = source.replace('<i>unused</i>', '<React>unused</React>')
      if (change === 'extra source specifier')
        source = source.replace(
          'Fragment as Frag',
          'Fragment as Frag, createRef as makeRef'
        )
      if (change === 'type source specifier')
        source = source.replace('createElement as h', 'type createElement as h')
      if (change === 'live reference')
        source += 'export const retained = Frag\n'
      if (change === 'real fragment')
        source = source.replace('<i>unused</i>', '<>unused</>')
      if (change === 'component tag')
        source = source.replace('<i>unused</i>', '<Frag>unused</Frag>')
      if (change === 'reordered source')
        source = source.replace(
          'createElement as h, Fragment as Frag',
          'Fragment as Frag, createElement as h'
        )
      if (change === 'duplicate directive') source = '/** @jsx h */\n' + source
      if (change === 'missing directive')
        source = source.replace('/** @jsxFrag Frag */\n', '')
      if (change === 'wrong target')
        source = source.replace("from 'react'", "from 'other'")
      if (aliases)
        source = source
          .replaceAll(/\bh\b/g, 'makeNode')
          .replaceAll(/\bFrag\b/g, 'Group')
          .replaceAll(/\bReact\b/g, 'Foundation')
      if (change === 'mismatched factory directive')
        source = source.replace('@jsx makeNode', '@jsx otherFactory')
      if (change === 'mismatched fragment directive')
        source = source.replace('@jsxFrag Group', '@jsxFrag otherFragment')
      const parsed = parseAuthored(source, {
          sourceType: 'module',
          plugins: ['estree', 'jsx', 'typescript'],
        }),
        imported = parsed.program.body[0]
      const declaration = 'var nativeReact = context.i(1);',
        body =
          declaration +
          '\nfunction Card() { return (0, nativeReact["createElement"])("i", null, "unused"); }\n',
        prefix = '["owned", context => {\n',
        code = prefix + body + '}];\n'
      const map = new SourceMapGenerator()
      map.setSourceContent(pathToFileURL(file).href, source)
      map.addMapping({
        generated: { line: 2, column: 0 },
        source: pathToFileURL(file).href,
        original: imported.loc.start,
      })
      map.addMapping({
        generated: { line: 3, column: 0 },
        source: pathToFileURL(file).href,
        original: parsed.program.body[1].loc.start,
      })
      const rawMap = JSON.parse(map.toString()),
        bootstrap = 'globalThis.nativeCoverageBootstrap = 1;',
        id = 'c'.repeat(64),
        descriptor = `server/next-test/${id}.client.json`,
        certificate = `server/next-test/${id}.browser-coverage.json`
      const { mkdir } = await import('fs/promises')
      await mkdir(join(root, 'server/next-test'), { recursive: true })
      await Promise.all([
        writeFile(file, source),
        writeFile(entryFile, ''),
        writeFile(join(root, 'entry.js'), code),
        writeFile(join(root, 'entry.js.map'), JSON.stringify(rawMap)),
        writeFile(join(root, 'bootstrap.js'), bootstrap),
        writeFile(join(root, descriptor), '{"version":1}'),
      ])
      const h = {
          kind: 'named',
          local: aliases ? 'makeNode' : 'h',
          imported: 'createElement',
        },
        frag = {
          kind: 'named',
          local: aliases ? 'Group' : 'Frag',
          imported: 'Fragment',
        }
      const defaultImport = {
        kind: 'default',
        local: aliases ? 'Foundation' : 'React',
        imported: 'default',
      }
      const actual =
        change === 'foreign default binding'
          ? [{ ...defaultImport, local: 'Foreign' }, h]
          : change === 'missing live default'
            ? [h]
            : defaultMode === 'retained'
              ? [defaultImport, h]
              : change === 'mismatched retained binding'
                ? [{ ...h, local: 'otherFactory' }]
                : change === 'missing h'
                  ? [frag]
                  : change === 'duplicate retained'
                    ? [h, h]
                    : [h]
      const proof = {
        version: 2,
        mode: 'production',
        sourceMaps: 'absolute-file-uri',
        preserveOriginalSyntax: true,
        scripts: [
          {
            path: 'bootstrap.js',
            sha256: coverageHash(bootstrap),
            role: 'native-ecmascript-bookkeeping',
          },
        ],
        importInitializers: {
          version: 1,
          sectionsByScript: {
            'entry.js': [
              {
                offset: { line: 1, column: 0 },
                data: {
                  version: 1,
                  kind: 'browser-import-initializers',
                  issuer: { sha256: coverageHash(source) },
                  moduleEnd: { line: 2, column: 0 },
                  roles: [
                    {
                      kind: 'esm-namespace-initializer',
                      start: { line: 0, column: 0 },
                      end: { line: 0, column: declaration.length },
                      binding: 'nativeReact',
                      context: 'context',
                      target: { kind: 'number', value: 1 },
                      request: 'react',
                      resolvedFormat: 'commonjs',
                      imports: [
                        {
                          declarationOrder: 0,
                          origin: 'authored',
                          sourceRange: {
                            start: {
                              line: imported.loc.start.line,
                              column: imported.loc.start.column,
                            },
                            end: {
                              line: imported.loc.end.line,
                              column: imported.loc.end.column,
                            },
                          },
                          specifiers: actual,
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        },
      }
      await writeFile(join(root, certificate), JSON.stringify(proof))
      const files = [
        'entry.js',
        'entry.js.map',
        'bootstrap.js',
        descriptor,
        certificate,
      ]
      const coverage = await buildBrowserCoverageMetadata({
        rootDir: root,
        files,
        projectDir: root,
        sourceRootDir: root,
        entryFile,
        entryPath: descriptor,
        setupFiles: [],
      })
      const artifact = {
        version: 2 as const,
        kind: 'browser' as const,
        profile: {
          ...profile,
          mode: 'production' as const,
          environment: 'browser' as const,
          browserClient: true as const,
        },
        entryId: 'owned',
        revision: 'one',
        rootDir: root,
        entryPath: descriptor,
        files,
        diagnostics: [],
        sourceHash: coverageHash(''),
        coverage,
        client: {
          version: 1 as const,
          asyncScope: 'promise-continuations-v1' as const,
          sourceFile: entryFile,
          scripts: ['entry.js', 'bootstrap.js'],
          styles: [],
          outputs: await Promise.all(
            files.map(async (path) => ({
              path,
              sha256: coverageHash(await readFile(join(root, path))),
            }))
          ),
        },
      }
      return {
        root,
        file,
        apply: () =>
          prepareBrowserImportInitializers({
            artifact,
            metadata: coverage.scripts.find(
              (script) => script.path === 'entry.js'
            )!,
            code,
            rawMap,
            ast: parseEmitted(code, { ecmaVersion: 'latest', locations: true }),
            selectedSources: new Map([[file, source]]),
            generatedCoverage: async () => {
              throw new Error(
                'A stripped unused import must not invent initializer counters'
              )
            },
          }),
      }
    } catch (error) {
      await rm(root, { recursive: true, force: true })
      throw error
    }
  }
  it('accepts only the actually retained h and never manufactures a Fragment owner or counter', async () => {
    const f = await fixture()
    try {
      const actual = await f.apply()
      expect(actual.statements.get(f.file)).toEqual([])
      expect(actual.classicFactories.get(f.file)).toEqual([
        {
          binding: 'nativeReact',
          moduleStart: expect.any(Number),
          moduleEnd: expect.any(Number),
          namedPragma: {
            local: 'h',
            start: expect.objectContaining({ line: 2, column: 0 }),
            end: expect.objectContaining({ line: 2, column: 13 }),
          },
        },
      ])
      expect(
        actual.classicFactories.get(f.file)![0].namedPragma!.fragment
      ).toBeUndefined()
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })
  it('derives renamed factory and unused Fragment bindings from actual imports and directives', async () => {
    const f = await fixture('none', true)
    try {
      const actual = await f.apply()
      expect(actual.statements.get(f.file)).toEqual([])
      expect(actual.classicFactories.get(f.file)![0].namedPragma).toEqual({
        local: 'makeNode',
        start: expect.objectContaining({ line: 2, column: 0 }),
        end: expect.objectContaining({ line: 2, column: 20 }),
      })
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })
  it.each([
    'mismatched factory directive',
    'mismatched fragment directive',
    'mismatched retained binding',
  ])('rejects renamed directive or binding mismatch: %s', async (change) => {
    const f = await fixture(change, true)
    try {
      await expect(f.apply()).rejects.toThrow(
        'Unsupported or ambiguous native Browser import coverage ownership'
      )
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })
  it.each([
    'live reference',
    'real fragment',
    'component tag',
    'reordered source',
    'duplicate directive',
    'missing directive',
    'wrong target',
    'missing h',
    'duplicate retained',
  ])('does not accept an absent actual binding for %s', async (change) => {
    const f = await fixture(change)
    try {
      await expect(f.apply()).rejects.toThrow(
        'Unsupported or ambiguous native Browser import coverage ownership'
      )
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })
  it.each([
    ['retained', false],
    ['removed', false],
    ['retained', true],
    ['removed', true],
  ] as const)(
    'derives an actual named factory with its default import %s and aliases=%s',
    async (defaultMode, aliases) => {
      const f = await fixture('none', aliases, defaultMode)
      try {
        const actual = await f.apply()
        expect(actual.statements.get(f.file)).toEqual([])
        expect(actual.classicFactories.get(f.file)).toEqual([
          {
            binding: 'nativeReact',
            moduleStart: expect.any(Number),
            moduleEnd: expect.any(Number),
            namedPragma: {
              local: aliases ? 'makeNode' : 'h',
              start: expect.objectContaining({ line: 2, column: 0 }),
              end: expect.objectContaining({ line: 2 }),
            },
          },
        ])
        expect(
          actual.classicFactories.get(f.file)![0].namedPragma!.fragment
        ).toBeUndefined()
      } finally {
        await rm(f.root, { recursive: true, force: true })
      }
    }
  )
  it.each([
    'live default',
    'default component tag',
    'extra source specifier',
    'type source specifier',
    'live reference',
    'real fragment',
    'component tag',
    'reordered source',
    'duplicate directive',
    'missing directive',
    'wrong target',
    'missing h',
    'duplicate retained',
    'mismatched factory directive',
    'mismatched fragment directive',
    'mismatched retained binding',
  ])(
    'rejects a dropped default/import composition mismatch: %s',
    async (change) => {
      const f = await fixture(change, true, 'removed')
      try {
        await expect(f.apply()).rejects.toThrow(
          'Unsupported or ambiguous native Browser import coverage ownership'
        )
      } finally {
        await rm(f.root, { recursive: true, force: true })
      }
    }
  )
  it.each(['foreign default binding', 'missing live default'])(
    'rejects an unowned retained default: %s',
    async (change) => {
      const f = await fixture(change, true, 'retained')
      try {
        await expect(f.apply()).rejects.toThrow(
          'Unsupported or ambiguous native Browser import coverage ownership'
        )
      } finally {
        await rm(f.root, { recursive: true, force: true })
      }
    }
  )
})

describe('native-owned Browser self-closing and boolean JSX associations', () => {
  const profiles =
    require('./fixtures/browser-production/self-closing-shapes.emission.json').profiles
  async function fixture(record = profiles[0]) {
    const { parse: parseAuthored } = require('next/dist/compiled/babel/parser')
    const { parse: parseEmitted } = require('next/dist/compiled/acorn')
    const { associateBrowserJsxCalls } = await import(
      'next/dist/experimental/testing/coverage/browser-jsx-associations'
    )
    const parsed = parseAuthored(record.source, {
      sourceType: 'module',
      plugins: ['estree', 'jsx', 'typescript'],
    })
    const authored = Object.assign(parsed.program, {
      comments: parsed.comments,
    })
    const emitted = parseEmitted(record.code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
    })
    function collect(value: any): any[] {
      if (!value || typeof value !== 'object') return []
      if (Array.isArray(value)) return value.flatMap(collect)
      return [
        ...(value.type ? [value] : []),
        ...Object.entries(value)
          .filter(([key]) => !['loc', 'comments', 'tokens'].includes(key))
          .flatMap(([, child]) => collect(child)),
      ]
    }
    const options: Parameters<typeof associateBrowserJsxCalls>[0] = {
      file: record.file,
      code: record.code,
      authored,
      emitted,
      sourceMap: structuredClone(record.map),
      classic:
        record.runtime === 'automatic'
          ? undefined
          : [structuredClone(record.factory)],
      automatic:
        record.runtime === 'automatic'
          ? [structuredClone(record.factory)]
          : undefined,
    }
    return {
      record,
      authored,
      emitted,
      options,
      collect,
      apply: () => associateBrowserJsxCalls(options),
    }
  }
  it.each(
    profiles.flatMap((record: any) =>
      [0, 3].map((count) => [record.name, count, record])
    )
  )(
    'preserves actual source/native role and every counter for %s with count=%s',
    async (_name, count, record) => {
      const f = await fixture(record),
        inputs = JSON.stringify(f.options)
      expect(coverageHash(record.source)).toBe(record.sourceSHA)
      const result = f.apply()!
      expect(result).toBeDefined()
      expect(JSON.stringify(f.options)).toBe(inputs)
      const before = decodeCoverageMap(f.options.sourceMap),
        after = decodeCoverageMap(result.sourceMap)
      expect(after.sources).toEqual(before.sources)
      const changed = before.mappings.filter(
        (mapping) =>
          !after.mappings.some(
            (actual) => JSON.stringify(actual) === JSON.stringify(mapping)
          )
      )
      const owners = f
        .collect(f.authored)
        .filter((node: any) =>
          ['JSXElement', 'JSXFragment'].includes(node.type)
        )
      expect(changed).toHaveLength(
        record.runtime === 'named' ? owners.length * 2 : 0
      )
      const directive = record.factory.namedPragma
      const permitted = directive
        ? [directive.start, directive.end].filter(Boolean)
        : []
      for (const mapping of changed) {
        expect(mapping.source).toBe(record.file)
        expect(
          permitted.some(
            (point: any) =>
              point.line === mapping.originalLine &&
              point.column === mapping.originalColumn
          )
        ).toBe(true)
        const actual = after.mappings.filter(
          (point) =>
            point.generatedLine === mapping.generatedLine &&
            point.generatedColumn === mapping.generatedColumn
        )
        expect(actual).toHaveLength(1)
        expect(
          owners.some(
            (owner: any) =>
              owner.loc.start.line === actual[0].originalLine &&
              owner.loc.start.column === actual[0].originalColumn
          )
        ).toBe(true)
        expect((actual[0] as any).name).toBe((mapping as any).name)
      }
      const { convert } = require('next/dist/compiled/next-test-coverage'),
        ast = structuredClone(f.emitted)
      ast.body[0].expression.body.body =
        ast.body[0].expression.body.body.filter(
          (node: any) =>
            node.type !== 'VariableDeclaration' ||
            node.declarations[0].id.name !== record.factory.binding
        )
      const convertMap = async (sourceMap: unknown) =>
        (
          await convert({
            code: record.code,
            ast: structuredClone(ast),
            sourceMap,
            coverage: {
              url: 'file:///browser-children/generated.js',
              functions: [
                {
                  isBlockCoverage: true,
                  ranges: [
                    { startOffset: 0, endOffset: record.code.length, count },
                  ],
                },
              ],
            },
          })
        )[record.file]
      const original = await convertMap(f.options.sourceMap),
        actual = await convertMap(result.sourceMap)
      expect([actual.s, actual.f, actual.b]).toEqual([
        original.s,
        original.f,
        original.b,
      ])
      expect(JSON.parse(JSON.stringify(actual.branchMap))).toEqual(
        record.expected.branchMap
      )
      expect(JSON.parse(JSON.stringify(actual.statementMap['0']))).toEqual(
        record.expected.statementMap['0']
      )
    }
  )
  function mapWith(f: any, change: (mapping: any) => any, extra: any[] = []) {
    const { SourceMapGenerator } = require('next/dist/compiled/source-map'),
      map = new SourceMapGenerator(),
      decoded = decodeCoverageMap(f.options.sourceMap)
    for (const original of decoded.mappings) {
      const mapping = change({ ...original })
      if (!mapping) continue
      const generated = {
        line: mapping.generatedLine,
        column: mapping.generatedColumn,
      }
      if (mapping.source === null) map.addMapping({ generated })
      else
        map.addMapping({
          generated,
          source: mapping.source,
          original: {
            line: mapping.originalLine,
            column: mapping.originalColumn,
          },
          ...(mapping.name ? { name: mapping.name } : {}),
        })
    }
    for (const mapping of extra) map.addMapping(mapping)
    for (const [file, content] of decoded.sources)
      if (content !== null) map.setSourceContent(file, content)
    f.options.sourceMap = JSON.parse(map.toString())
  }
  it.each([
    'missing self-closing flag',
    'wrong opening end',
    'nonempty children',
    'extra closing node',
  ])('does not derive a self-closing terminal for %s', async (kind) => {
    const f = await fixture(
      profiles.find((record: any) => record.name === 'shape-named-empty.tsx')
    )
    for (const node of f
      .collect(f.authored)
      .filter((node: any) => node.type === 'JSXElement')) {
      if (kind === 'missing self-closing flag')
        node.openingElement.selfClosing = false
      if (kind === 'wrong opening end')
        node.openingElement.loc.end = {
          ...node.openingElement.loc.end,
          column: node.openingElement.loc.end.column - 1,
        }
      if (kind === 'nonempty children')
        node.children.push({ type: 'JSXText', value: 'foreign' })
      if (kind === 'extra closing node')
        node.closingElement = { type: 'JSXClosingElement' }
    }
    const inputs = JSON.stringify(f.options)
    expect(f.apply()).toBeUndefined()
    expect(JSON.stringify(f.options)).toBe(inputs)
  })
  it.each([
    'false value',
    'nonliteral value',
    'duplicate property',
    'computed property',
    'foreign key anchor',
    'foreign value anchor',
  ])('rejects ambiguous implicit boolean property %s', async (kind) => {
    const f = await fixture(
      profiles.find(
        (record: any) => record.name === 'shape-classic-boolean.tsx'
      )
    )
    const property = f
      .collect(f.emitted)
      .find(
        (node: any) => node.type === 'Property' && node.key.name === 'disabled'
      )
    if (kind === 'false value') property.value.value = false
    if (kind === 'nonliteral value') property.value.type = 'Identifier'
    if (kind === 'duplicate property')
      f.collect(f.emitted)
        .find(
          (node: any) =>
            node.type === 'ObjectExpression' &&
            node.properties.includes(property)
        )
        .properties.push(structuredClone(property))
    if (kind === 'computed property') property.computed = true
    if (['foreign key anchor', 'foreign value anchor'].includes(kind)) {
      const point =
        kind === 'foreign key anchor'
          ? property.key.loc.start
          : property.value.loc.start
      mapWith(f, (mapping: any) =>
        mapping.generatedLine === point.line &&
        mapping.generatedColumn === point.column
          ? { ...mapping, originalColumn: mapping.originalColumn + 1 }
          : mapping
      )
    }
    const inputs = JSON.stringify(f.options)
    expect(f.apply).toThrow(
      'Browser JSX call association is ambiguous or absent'
    )
    expect(JSON.stringify(f.options)).toBe(inputs)
  })
  it.each(['missing key end', 'foreign key end', 'conflicting literal anchor'])(
    'requires the actual automatic boolean mapping boundary: %s',
    async (kind) => {
      const f = await fixture(
        profiles.find(
          (record: any) => record.name === 'shape-automatic-boolean.tsx'
        )
      )
      const property = f
          .collect(f.emitted)
          .find(
            (node: any) =>
              node.type === 'Property' && node.key.name === 'disabled'
          ),
        point = property.key.loc.end
      const attribute = f
        .collect(f.authored)
        .find(
          (node: any) =>
            node.type === 'JSXAttribute' && node.name.name === 'disabled'
        )
      mapWith(
        f,
        (mapping: any) => {
          if (
            mapping.generatedLine !== point.line ||
            mapping.generatedColumn !== point.column
          )
            return mapping
          if (kind === 'missing key end') return null
          if (kind === 'foreign key end')
            return { ...mapping, originalColumn: mapping.originalColumn + 1 }
          return mapping
        },
        kind === 'conflicting literal anchor'
          ? [
              {
                generated: property.value.loc.start,
                source: f.record.file,
                original: {
                  line: attribute.name.loc.start.line,
                  column: attribute.name.loc.start.column + 1,
                },
              },
            ]
          : []
      )
      const inputs = JSON.stringify(f.options)
      expect(f.apply).toThrow(
        'Browser JSX call association is ambiguous or absent'
      )
      expect(JSON.stringify(f.options)).toBe(inputs)
    }
  )
  it.each([
    'wrong tag',
    'foreign namespace',
    'duplicate call',
    'foreign scope',
    'conflicting terminal',
  ])('rejects unowned self-closing call %s', async (kind) => {
    const f = await fixture(
      profiles.find(
        (record: any) => record.name === 'shape-named-attributes.tsx'
      )
    )
    const call = f
      .collect(f.emitted)
      .find(
        (node: any) =>
          node.type === 'CallExpression' &&
          node.callee.type === 'SequenceExpression'
      )
    if (kind === 'wrong tag') call.arguments[0].value = 'foreign'
    if (kind === 'foreign namespace')
      call.callee.expressions[1].object.name = 'foreign'
    if (kind === 'duplicate call')
      f.emitted.body.push({ type: 'ExpressionStatement', expression: call })
    if (kind === 'foreign scope')
      f.collect(f.emitted)
        .find((node: any) => node.type === 'FunctionDeclaration')
        .params.push({ type: 'Identifier', name: f.record.factory.binding })
    if (kind === 'conflicting terminal') {
      const { SourceMapGenerator } = require('next/dist/compiled/source-map'),
        decoded = decodeCoverageMap(f.options.sourceMap),
        map = new SourceMapGenerator()
      for (const mapping of decoded.mappings) {
        const generated = {
          line: mapping.generatedLine,
          column: mapping.generatedColumn,
        }
        if (mapping.source === null) map.addMapping({ generated })
        else
          map.addMapping({
            generated,
            source: mapping.source,
            original: {
              line: mapping.originalLine,
              column: mapping.originalColumn,
            },
            ...((mapping as any).name ? { name: (mapping as any).name } : {}),
          })
      }
      map.addMapping({
        generated: { line: call.loc.end.line, column: call.loc.end.column - 1 },
        source: f.record.file,
        original: { line: 1, column: 0 },
      })
      for (const [file, content] of decoded.sources)
        if (content !== null) map.setSourceContent(file, content)
      f.options.sourceMap = JSON.parse(map.toString())
    }
    const inputs = JSON.stringify(f.options)
    expect(f.apply).toThrow(
      'Browser JSX call association is ambiguous or absent'
    )
    expect(JSON.stringify(f.options)).toBe(inputs)
  })
})

describe('native-owned Browser local component tag associations', () => {
  const profiles =
    require('./fixtures/browser-production/component-tags.emission.json').profiles
  async function fixture(record = profiles[0]) {
    const { parse: parseAuthored } = require('next/dist/compiled/babel/parser')
    const { parse: parseEmitted } = require('next/dist/compiled/acorn')
    const { associateBrowserJsxCalls } = await import(
      'next/dist/experimental/testing/coverage/browser-jsx-associations'
    )
    const parsed = parseAuthored(record.source, {
      sourceType: 'module',
      plugins: ['estree', 'jsx', 'typescript'],
    })
    const authored = Object.assign(parsed.program, {
      comments: parsed.comments,
    })
    const emitted = parseEmitted(record.code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
    })
    function collect(value: any): any[] {
      if (!value || typeof value !== 'object') return []
      if (Array.isArray(value)) return value.flatMap(collect)
      return [
        ...(value.type ? [value] : []),
        ...Object.entries(value)
          .filter(([key]) => !['loc', 'comments', 'tokens'].includes(key))
          .flatMap(([, child]) => collect(child)),
      ]
    }
    const options: Parameters<typeof associateBrowserJsxCalls>[0] = {
      file: record.file,
      code: record.code,
      authored,
      emitted,
      sourceMap: structuredClone(record.map),
      classic:
        record.runtime === 'automatic'
          ? undefined
          : [structuredClone(record.factory)],
      automatic:
        record.runtime === 'automatic'
          ? [structuredClone(record.factory)]
          : undefined,
    }
    return {
      record,
      authored,
      emitted,
      options,
      collect,
      apply: () => associateBrowserJsxCalls(options),
    }
  }
  it.each(
    profiles.flatMap((record: any) =>
      [0, 3].map((count) => [record.name, count, record])
    )
  )(
    'preserves actual source/native role and every counter for %s with count=%s',
    async (_name, count, record) => {
      const f = await fixture(record),
        inputs = JSON.stringify(f.options)
      expect(coverageHash(record.source)).toBe(record.sourceSHA)
      const result = f.apply()!
      expect(result).toBeDefined()
      expect(JSON.stringify(f.options)).toBe(inputs)
      const before = decodeCoverageMap(f.options.sourceMap),
        after = decodeCoverageMap(result.sourceMap)
      expect(after.sources).toEqual(before.sources)
      const changed = before.mappings.filter(
        (mapping) =>
          !after.mappings.some(
            (actual) => JSON.stringify(actual) === JSON.stringify(mapping)
          )
      )
      const owners = f
        .collect(f.authored)
        .filter((node: any) =>
          ['JSXElement', 'JSXFragment'].includes(node.type)
        )
      expect(changed).toHaveLength(
        record.runtime === 'named' ? owners.length * 2 : 0
      )
      const directive = record.factory.namedPragma
      const permitted = directive
        ? [directive.start, directive.end].filter(Boolean)
        : []
      for (const mapping of changed) {
        expect(mapping.source).toBe(record.file)
        expect(
          permitted.some(
            (point: any) =>
              point.line === mapping.originalLine &&
              point.column === mapping.originalColumn
          )
        ).toBe(true)
        const actual = after.mappings.filter(
          (point) =>
            point.generatedLine === mapping.generatedLine &&
            point.generatedColumn === mapping.generatedColumn
        )
        expect(actual).toHaveLength(1)
        expect(
          owners.some(
            (owner: any) =>
              owner.loc.start.line === actual[0].originalLine &&
              owner.loc.start.column === actual[0].originalColumn
          )
        ).toBe(true)
        expect((actual[0] as any).name).toBe((mapping as any).name)
      }
      const { convert } = require('next/dist/compiled/next-test-coverage'),
        ast = structuredClone(f.emitted)
      ast.body[0].expression.body.body =
        ast.body[0].expression.body.body.filter(
          (node: any) =>
            node.type !== 'VariableDeclaration' ||
            node.declarations[0].id.name !== record.factory.binding
        )
      const convertMap = async (sourceMap: unknown) =>
        (
          await convert({
            code: record.code,
            ast: structuredClone(ast),
            sourceMap,
            coverage: {
              url: 'file:///browser-children/generated.js',
              functions: [
                {
                  isBlockCoverage: true,
                  ranges: [
                    { startOffset: 0, endOffset: record.code.length, count },
                  ],
                },
              ],
            },
          })
        )[record.file]
      const original = await convertMap(f.options.sourceMap),
        actual = await convertMap(result.sourceMap)
      expect([actual.s, actual.f, actual.b]).toEqual([
        original.s,
        original.f,
        original.b,
      ])
      expect(JSON.parse(JSON.stringify(actual.branchMap))).toEqual(
        record.expected.branchMap
      )
      const card = f
          .collect(f.authored)
          .find(
            (node: any) =>
              node.type === 'FunctionDeclaration' && node.id.name === 'Card'
          ),
        start = card.body.body[0].loc.start,
        atReturn = (map: any) =>
          Object.values(map).filter(
            (location: any) =>
              location.start.line === start.line &&
              location.start.column === start.column
          ),
        expectedReturn = atReturn(record.expected.statementMap)
      expect(expectedReturn).toHaveLength(1)
      expect(JSON.parse(JSON.stringify(atReturn(actual.statementMap)))).toEqual(
        expectedReturn
      )
    }
  )
  function changeMap(f: any, point: any) {
    const { SourceMapGenerator } = require('next/dist/compiled/source-map'),
      map = new SourceMapGenerator(),
      decoded = decodeCoverageMap(f.options.sourceMap)
    for (const mapping of decoded.mappings) {
      const generated = {
        line: mapping.generatedLine,
        column: mapping.generatedColumn,
      }
      if (mapping.source === null) map.addMapping({ generated })
      else
        map.addMapping({
          generated,
          source: mapping.source,
          original: {
            line: mapping.originalLine,
            column:
              mapping.originalColumn! +
              (generated.line === point.line &&
              generated.column === point.column
                ? 1
                : 0),
          },
          ...((mapping as any).name ? { name: (mapping as any).name } : {}),
        })
    }
    for (const [file, content] of decoded.sources)
      if (content !== null) map.setSourceContent(file, content)
    f.options.sourceMap = JSON.parse(map.toString())
  }
  it('ignores same-name bindings from a separate static lexical scope', async () => {
    const f = await fixture(
      profiles.find((record: any) => record.name === 'shape-named-single.tsx')
    )
    const original = f
      .collect(f.emitted)
      .find(
        (node: any) =>
          node.type === 'FunctionDeclaration' && node.id.name === 'Badge'
      )
    f.emitted.body.push({
      type: 'ClassDeclaration',
      start: f.record.factory.moduleStart,
      end: f.record.factory.moduleEnd,
      body: {
        type: 'ClassBody',
        body: [
          {
            type: 'StaticBlock',
            start: f.record.factory.moduleStart + 1,
            end: f.record.factory.moduleEnd - 1,
            body: [
              {
                type: 'VariableDeclaration',
                kind: 'const',
                start: original.start,
                end: original.end,
                declarations: [
                  {
                    type: 'VariableDeclarator',
                    id: structuredClone(original.id),
                    init: {
                      type: 'ArrowFunctionExpression',
                      params: [],
                      body: { type: 'Literal', value: 0 },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    })
    const inputs = JSON.stringify(f.options)
    expect(f.apply()).toBeDefined()
    expect(JSON.stringify(f.options)).toBe(inputs)
  })
  it.each([
    'missing function',
    'duplicate function',
    'wrong function map',
    'changed function kind',
    'dynamic object',
    'computed property',
    'foreign property value',
    'wrong object map',
    'wrong property map',
  ])('does not infer a local component binding from %s', async (kind) => {
    const record = profiles.find(
        (row: any) => row.name === 'shape-named-member.tsx'
      ),
      f = await fixture(record),
      body = f.emitted.body[0].expression.body.body
    const declaration = body.find(
        (node: any) =>
          node.type === 'FunctionDeclaration' && node.id.name === 'Badge'
      ),
      object = body.find(
        (node: any) =>
          node.type === 'VariableDeclaration' &&
          node.declarations[0].id.name === 'parts'
      )
    if (kind === 'missing function') body.splice(body.indexOf(declaration), 1)
    if (kind === 'duplicate function') body.push(structuredClone(declaration))
    if (kind === 'wrong function map') changeMap(f, declaration.id.loc.start)
    if (kind === 'changed function kind') declaration.async = true
    if (kind === 'dynamic object')
      object.declarations[0].init.type = 'CallExpression'
    if (kind === 'computed property')
      object.declarations[0].init.properties[0].computed = true
    if (kind === 'foreign property value') {
      const property = object.declarations[0].init.properties[0]
      property.value = { ...property.value, name: 'foreign' }
    }
    if (kind === 'wrong object map')
      changeMap(f, object.declarations[0].id.loc.start)
    if (kind === 'wrong property map')
      changeMap(f, object.declarations[0].init.properties[0].key.loc.start)
    const inputs = JSON.stringify(f.options)
    expect(f.apply()).toBeUndefined()
    expect(JSON.stringify(f.options)).toBe(inputs)
  })
  it.each([
    'wrong identifier',
    'foreign tag map',
    'wrong member property',
    'foreign property map',
    'computed member',
    'optional member',
    'wrong closing identifier',
    'wrong closing member',
    'foreign emitted scope',
    'foreign original scope',
    'duplicate component call',
  ])('rejects unowned actual component tag %s', async (kind) => {
    const member = [
        'wrong member property',
        'foreign property map',
        'computed member',
        'optional member',
        'wrong closing member',
      ].includes(kind),
      record = profiles.find(
        (row: any) =>
          row.name === 'shape-named-' + (member ? 'member' : 'paired') + '.tsx'
      ),
      f = await fixture(record)
    const call = f
      .collect(f.emitted)
      .find(
        (node: any) =>
          node.type === 'CallExpression' &&
          node.callee.type === 'SequenceExpression' &&
          (node.arguments[0]?.type === 'Identifier' ||
            node.arguments[0]?.type === 'MemberExpression')
      )
    if (kind === 'wrong identifier') call.arguments[0].name = 'foreign'
    if (kind === 'foreign tag map') changeMap(f, call.arguments[0].loc.start)
    if (kind === 'wrong member property')
      call.arguments[0].property.name = 'foreign'
    if (kind === 'foreign property map')
      changeMap(f, call.arguments[0].property.loc.start)
    if (kind === 'computed member') call.arguments[0].computed = true
    if (kind === 'optional member') call.arguments[0].optional = true
    if (kind === 'wrong closing identifier')
      f
        .collect(f.authored)
        .find(
          (node: any) =>
            node.type === 'JSXClosingElement' && node.name.name === 'Badge'
        ).name.name = 'foreign'
    if (kind === 'wrong closing member') {
      const owner = f
        .collect(f.authored)
        .find(
          (node: any) =>
            node.type === 'JSXElement' &&
            node.openingElement.name.type === 'JSXMemberExpression'
        )
      owner.openingElement.selfClosing = false
      owner.closingElement = {
        type: 'JSXClosingElement',
        name: {
          type: 'JSXMemberExpression',
          object: { type: 'JSXIdentifier', name: 'parts' },
          property: { type: 'JSXIdentifier', name: 'foreign' },
        },
        loc: { end: owner.loc.end },
      }
    }
    if (kind === 'foreign emitted scope')
      f.collect(f.emitted)
        .find(
          (node: any) =>
            node.type === 'FunctionDeclaration' && node.id.name === 'Card'
        )
        .params.push({ type: 'Identifier', name: member ? 'parts' : 'Badge' })
    if (kind === 'foreign original scope')
      f.collect(f.authored)
        .find(
          (node: any) =>
            node.type === 'FunctionDeclaration' && node.id.name === 'Card'
        )
        .params.push({ type: 'Identifier', name: 'Badge' })
    if (kind === 'duplicate component call')
      f.emitted.body.push({ type: 'ExpressionStatement', expression: call })
    const inputs = JSON.stringify(f.options)
    expect(f.apply).toThrow(
      'Browser JSX call association is ambiguous or absent'
    )
    expect(JSON.stringify(f.options)).toBe(inputs)
  })
})

describe('native-owned Browser creator coverage geometry', () => {
  const acorn = require('next/dist/compiled/acorn')
  const {
    normalizeBrowserCreatorScopes,
  } = require('next/dist/experimental/testing/coverage/browser-creator-scope')
  const emitted = require('./fixtures/browser-production/creator-scopes.emission.json')
  function nodes(value: any): any[] {
    if (!value || typeof value !== 'object') return []
    if (Array.isArray(value)) return value.flatMap(nodes)
    return [
      ...(typeof value.type === 'string' ? [value] : []),
      ...Object.entries(value)
        .filter(([key]) => !['loc', 'comments', 'tokens'].includes(key))
        .flatMap(([, child]) => nodes(child)),
    ]
  }
  function state(profile = emitted.profiles[0]) {
    const ast = acorn.parse(profile.code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
    })
    for (const block of nodes(ast).filter(
      (node) => node.type === 'BlockStatement'
    ))
      block.body = block.body.filter(
        (node: any) => !profile.removeNativeDeclarations.includes(node.start)
      )
    const all = nodes(ast)
    const property = (node: any, name: string) =>
      node?.type === 'CallExpression' &&
      node.callee?.type === 'SequenceExpression' &&
      node.callee.expressions[1]?.property?.value === name
    const capture = all.find(
      (node) =>
        node.type === 'VariableDeclaration' &&
        property(node.declarations[0]?.init, 'captureCreatorScope')
    )
    const entry = all.find(
      (node) =>
        node.type === 'VariableDeclaration' &&
        property(node.declarations[0]?.init, 'enterCreatorScope')
    )
    const body = all.find(
      (node) => node.type === 'BlockStatement' && node.body.includes(entry)
    )
    const transaction = body.body.at(-1)
    return {
      ast,
      scope: structuredClone(profile.scope),
      capture,
      entry,
      body,
      transaction,
    }
  }
  for (const profile of emitted.profiles) {
    it(`preserves actual native ${profile.name} methods and authored return nodes`, () => {
      const input = state(profile),
        before = JSON.stringify(input.ast)
      const scoped = (value: any) =>
        nodes(value).filter(
          (node) =>
            node.start >= input.scope.moduleStart &&
            node.end <= input.scope.moduleEnd
        )
      const returns = scoped(input.ast).filter(
        (node) => node.type === 'ReturnStatement'
      )
      const functions = scoped(input.ast)
        .filter((node) => /^(Function|ArrowFunction)/.test(node.type))
        .map((node) => [node.type, node.start, node.end])
      const actual = normalizeBrowserCreatorScopes(input.ast, [input.scope]).ast
      expect(JSON.stringify(input.ast)).toBe(before)
      expect(
        JSON.stringify(
          scoped(actual).filter((node) => node.type === 'ReturnStatement')
        )
      ).toBe(JSON.stringify(returns))
      expect(
        scoped(actual)
          .filter((node) => /^(Function|ArrowFunction)/.test(node.type))
          .map((node) => [node.type, node.start, node.end])
      ).toEqual(functions)
      expect(
        scoped(actual).some(
          (node) =>
            node.type === 'Identifier' && node.name === input.scope.binding
        )
      ).toBe(false)
      expect(
        scoped(actual).some(
          (node) =>
            node.type === 'Identifier' &&
            [
              input.capture.declarations[0].id.name,
              input.entry.declarations[0].id.name,
            ].includes(node.name)
        )
      ).toBe(false)
      expect(
        scoped(actual).filter((node) => node.type === 'TryStatement')
      ).toHaveLength(0)
    })
  }
  const changes: [string, (input: ReturnType<typeof state>) => void][] = [
    [
      'wrong native namespace',
      (input) => {
        input.scope.binding += '_foreign'
      },
    ],
    [
      'wrong native module start',
      (input) => {
        input.scope.moduleStart = input.entry.start
      },
    ],
    [
      'wrong native module end',
      (input) => {
        input.scope.moduleEnd = input.capture.end
      },
    ],
    [
      'mutable capture',
      (input) => {
        input.capture.kind = 'let'
      },
    ],
    [
      'capture argument',
      (input) => {
        input.capture.declarations[0].init.arguments.push({
          type: 'Literal',
          value: 1,
        })
      },
    ],
    [
      'wrong capture helper',
      (input) => {
        input.capture.declarations[0].init.callee.expressions[1].property.value =
          'other'
      },
    ],
    [
      'optional capture',
      (input) => {
        input.capture.declarations[0].init.optional = true
      },
    ],
    [
      'nonzero sequence receiver',
      (input) => {
        input.capture.declarations[0].init.callee.expressions[0].value = 1
      },
    ],
    [
      'mutable entry',
      (input) => {
        input.entry.kind = 'let'
      },
    ],
    [
      'wrong entry cell',
      (input) => {
        input.entry.declarations[0].init.arguments[0].name += '_foreign'
      },
    ],
    [
      'extra entry argument',
      (input) => {
        input.entry.declarations[0].init.arguments.push({
          type: 'Literal',
          value: 1,
        })
      },
    ],
    [
      'missing entry',
      (input) => {
        input.body.body.shift()
      },
    ],
    [
      'authored statement before entry',
      (input) => {
        input.body.body.unshift({ type: 'EmptyStatement' })
      },
    ],
    [
      'extra statement after transaction',
      (input) => {
        input.body.body.push({ type: 'EmptyStatement' })
      },
    ],
    [
      'catch handler',
      (input) => {
        input.transaction.handler = { type: 'CatchClause' }
      },
    ],
    [
      'missing finalizer',
      (input) => {
        input.transaction.finalizer = null
      },
    ],
    [
      'extra finalizer effect',
      (input) => {
        input.transaction.finalizer.body.push({ type: 'EmptyStatement' })
      },
    ],
    [
      'wrong leave binding',
      (input) => {
        input.transaction.finalizer.body[0].expression.callee.name += '_foreign'
      },
    ],
    [
      'leave argument',
      (input) => {
        input.transaction.finalizer.body[0].expression.arguments.push({
          type: 'Literal',
          value: 1,
        })
      },
    ],
    [
      'optional leave',
      (input) => {
        input.transaction.finalizer.body[0].expression.optional = true
      },
    ],
    [
      'escaped capture cell',
      (input) => {
        input.transaction.block.body.push({
          type: 'ExpressionStatement',
          expression: { ...input.entry.declarations[0].init.arguments[0] },
        })
      },
    ],
    [
      'escaped leave binding',
      (input) => {
        input.transaction.block.body.push({
          type: 'ExpressionStatement',
          expression: { ...input.entry.declarations[0].id },
        })
      },
    ],
  ]
  for (const [name, change] of changes) {
    it(`refuses ${name}`, () => {
      const input = state()
      change(input)
      expect(() =>
        normalizeBrowserCreatorScopes(input.ast, [input.scope])
      ).toThrow(/native Browser creator coverage/)
    })
  }
  it('keeps the exact original AST when no issued creator scope exists', () => {
    const input = state()
    expect(normalizeBrowserCreatorScopes(input.ast, []).ast).toBe(input.ast)
  })
  it('refuses duplicate native creator scopes', () => {
    const input = state()
    expect(() =>
      normalizeBrowserCreatorScopes(input.ast, [input.scope, input.scope])
    ).toThrow(/native Browser creator coverage/)
  })
})

describe('native-owned Browser creator method endpoints', () => {
  const acorn = require('next/dist/compiled/acorn')
  const babel = require('next/dist/compiled/babel/parser')
  const { SourceMapGenerator } = require('next/dist/compiled/source-map')
  const { convert } = require('next/dist/compiled/next-test-coverage')
  const {
    normalizeBrowserCreatorScopes,
    bindBrowserCreatorMethodEnds,
  } = require('next/dist/experimental/testing/coverage/browser-creator-scope')
  const emitted = require('./fixtures/browser-production/creator-scopes.emission.json')
  const profiles = emitted.profiles.filter((value: any) => value.map)
  function visit(value: any, fn: (node: any) => void) {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach((child) => visit(child, fn))
      return
    }
    if (value.type) fn(value)
    for (const [key, child] of Object.entries(value))
      if (!['loc', 'comments', 'tokens'].includes(key)) visit(child, fn)
  }
  async function state(profile = profiles[0]) {
    const ast = acorn.parse(profile.code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
    })
    visit(ast, (node) => {
      if (node.type === 'BlockStatement')
        node.body = node.body.filter(
          (value: any) =>
            !profile.removeNativeDeclarations.includes(value.start)
        )
    })
    const actual = normalizeBrowserCreatorScopes(ast, [
      structuredClone(profile.scope),
    ])
    const authored = babel.parse(profile.source, {
      sourceType: 'module',
      plugins: ['estree', 'jsx', 'typescript'],
    }).program
    const identity = new SourceMapGenerator()
    for (const [index, line] of profile.source.split('\n').entries()) {
      let column = 0
      for (const token of line.matchAll(/\w+|\s|[^\w\s]/g)) {
        const point = { line: index + 1, column }
        identity.addMapping({
          generated: point,
          source: profile.file,
          original: point,
        })
        column += token[0].length
      }
    }
    identity.setSourceContent(profile.file, profile.source)
    const capture = (code: string) => ({
      url: pathToFileURL(profile.file).href,
      functions: [
        {
          isBlockCoverage: true,
          ranges: [{ startOffset: 0, endOffset: code.length, count: 0 }],
        },
      ],
    })
    const model = (
      await convert({
        code: profile.source,
        ast: authored,
        sourceMap: JSON.parse(identity.toString()),
        coverage: capture(profile.source),
      })
    )[profile.file]
    const observed = (
      await convert({
        code: profile.code,
        ast: actual.ast,
        sourceMap: profile.map,
        coverage: {
          ...capture(profile.code),
          url: pathToFileURL(profile.file + '.generated.js').href,
        },
      })
    )[profile.file]
    return {
      profile,
      authored,
      model,
      observed,
      methods: structuredClone(actual.methods),
      map: structuredClone(profile.map),
    }
  }
  function unchanged(value: any) {
    const serialized = JSON.stringify(value),
      names = value.meta.fnNames,
      entries = [...names]
    return () => {
      expect(JSON.stringify(value)).toBe(serialized)
      expect(value.meta.fnNames).toBe(names)
      expect(names.size).toBe(entries.length)
      for (const [key, name] of entries) expect(names.get(key)).toBe(name)
    }
  }
  function apply(input: Awaited<ReturnType<typeof state>>) {
    bindBrowserCreatorMethodEnds(
      input.profile.file,
      input.model,
      input.observed,
      input.authored,
      input.methods,
      input.map
    )
  }
  for (const profile of profiles) {
    it(`retains actual native endpoints and counters for ${profile.name}`, async () => {
      const input = await state(profile),
        observed = unchanged(input.observed),
        counts = structuredClone([input.model.s, input.model.f, input.model.b])
      apply(input)
      observed()
      expect([input.model.s, input.model.f, input.model.b]).toEqual(counts)
      for (const method of input.methods) {
        const candidates = Object.values(input.model.fnMap).filter(
          (fn: any) => fn.name === method.method.key.name
        )
        const expected = Object.values(profile.expectedCoverage.fnMap).filter(
          (fn: any) => fn.name === method.method.key.name
        )
        expect(candidates).toHaveLength(1)
        expect(expected).toHaveLength(1)
        expect(
          JSON.parse(JSON.stringify((candidates[0] as any).loc.end))
        ).toEqual((expected[0] as any).loc.end)
      }
    })
  }
  const changes: [
    string,
    (input: Awaited<ReturnType<typeof state>>) => void,
  ][] = [
    [
      'foreign source identity',
      (input) => {
        input.map.sources[0] += '.foreign'
      },
    ],
    [
      'foreign class scope',
      (input) => {
        input.methods[0].scope.moduleStart = input.methods[0].owner.start + 1
      },
    ],
    [
      'wrong actual class kind',
      (input) => {
        input.methods[0].owner.type = 'ClassDeclaration'
      },
    ],
    [
      'computed actual method',
      (input) => {
        input.methods[0].method.computed = true
      },
    ],
    [
      'wrong actual method kind',
      (input) => {
        input.methods[0].method.kind = 'get'
      },
    ],
    [
      'detached actual method',
      (input) => {
        input.methods[0].owner.body.body =
          input.methods[0].owner.body.body.filter(
            (method: any) => method !== input.methods[0].method
          )
      },
    ],
    [
      'wrong actual method staticness',
      (input) => {
        input.methods[0].method.static = !input.methods[0].method.static
      },
    ],
    [
      'wrong actual key name',
      (input) => {
        input.methods[0].method.key.name += '_foreign'
      },
    ],
    [
      'foreign body start',
      (input) => {
        input.methods[0].method.value.body.loc.start.column++
      },
    ],
    [
      'foreign body close',
      (input) => {
        input.methods[0].method.value.body.loc.end.column++
      },
    ],
    [
      'foreign class close',
      (input) => {
        input.methods[0].owner.body.loc.end.column++
      },
    ],
    [
      'duplicate method receipt',
      (input) => {
        input.methods.push(structuredClone(input.methods[0]))
      },
    ],
    [
      'duplicate original descriptor',
      (input) => {
        input.model.fnMap.foreign = structuredClone(
          Object.values(input.model.fnMap)[0]
        )
      },
    ],
    [
      'duplicate observed descriptor',
      (input) => {
        input.observed.fnMap.foreign = structuredClone(
          Object.values(input.observed.fnMap)[0]
        )
      },
    ],
    [
      'wrong original start',
      (input) => {
        ;(Object.values(input.model.fnMap)[0] as any).loc.start.column++
      },
    ],
    [
      'wrong observed start',
      (input) => {
        ;(Object.values(input.observed.fnMap)[0] as any).loc.start.column++
      },
    ],
    [
      'wrong observed name',
      (input) => {
        ;(Object.values(input.observed.fnMap)[0] as any).name += '_foreign'
      },
    ],
    [
      'observed endpoint before real body',
      (input) => {
        ;(Object.values(input.observed.fnMap)[0] as any).loc.end.column = 0
      },
    ],
    [
      'observed endpoint outside real class',
      (input) => {
        ;(Object.values(input.observed.fnMap)[0] as any).loc.end.column += 1000
      },
    ],
    [
      'unbounded observed endpoint',
      (input) => {
        ;(Object.values(input.observed.fnMap)[0] as any).loc.end.column =
          Infinity
      },
    ],
  ]
  for (const [name, change] of changes) {
    it(`refuses ${name} before changing the model`, async () => {
      const input = await state(),
        before = structuredClone([input.model.s, input.model.f, input.model.b])
      change(input)
      const changed = unchanged(input.model)
      expect(() => apply(input)).toThrow(/native Browser creator coverage/)
      changed()
      expect([input.model.s, input.model.f, input.model.b]).toEqual(before)
    })
  }
  it('does not borrow method endpoint authority without actual creator facts', async () => {
    const input = await state(),
      before = unchanged(input.model)
    input.methods = []
    apply(input)
    before()
  })
})

describe('production Browser standard coverage profile boundaries', () => {
  const project = {
    profile: {
      id: 'browser',
      mode: 'production',
      environment: 'browser',
      runtime: 'nodejs',
      bundler: 'turbopack',
      browserClient: true,
    },
    entries: [],
    setupFiles: [],
    include: [],
    exclude: [],
  } as any
  it('admits the isolated Chromium client profile with no setup or rendering graph', async () => {
    const { isProductionBrowserCoverageProject } = await import(
      'next/dist/experimental/testing/coverage/production-browser'
    )
    expect(isProductionBrowserCoverageProject(project)).toBe(true)
    expect(
      isProductionBrowserCoverageProject({
        ...project,
        browserEngine: 'chromium',
      })
    ).toBe(true)
  })
  it.each([
    { browserEngine: 'firefox' },
    { browserEngine: 'webkit' },
    { isolate: false },
    { setupFiles: ['setup.mjs'] },
    { browserFixtures: [{}] },
    { typecheck: { enabled: true } },
    { executionEnvironment: {} },
    { entries: [{ executionEnvironment: {} }] },
    { profile: { ...project.profile, route: '/' } },
    { profile: { ...project.profile, mode: 'development' } },
    { profile: { ...project.profile, runtime: 'edge' } },
    { profile: { ...project.profile, bundler: 'webpack' } },
    { profile: { ...project.profile, browserClient: false } },
    { profile: { ...project.profile, environment: 'node' } },
  ])('keeps the unqualified profile closed: %j', async (patch) => {
    const { isProductionBrowserCoverageProject } = await import(
      'next/dist/experimental/testing/coverage/production-browser'
    )
    expect(isProductionBrowserCoverageProject({ ...project, ...patch })).toBe(
      false
    )
  })
})

describe('native-owned Browser local creator component bindings', () => {
  const profiles =
    require('./fixtures/browser-production/component-creators.emission.json').profiles
  async function fixture(record = profiles[0]) {
    const { parse: parseAuthored } = require('next/dist/compiled/babel/parser')
    const { parse: parseEmitted } = require('next/dist/compiled/acorn')
    const { normalizeBrowserCreatorScopes } = await import(
      'next/dist/experimental/testing/coverage/browser-creator-scope'
    )
    const { associateBrowserJsxCalls } = await import(
      'next/dist/experimental/testing/coverage/browser-jsx-associations'
    )
    const parsed = parseAuthored(record.source, {
        sourceType: 'module',
        plugins: ['estree', 'jsx', 'typescript'],
      }),
      authored = Object.assign(parsed.program, { comments: parsed.comments })
    const native = parseEmitted(record.code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
    })
    native.body[0].expression.body.body =
      native.body[0].expression.body.body.filter(
        (node: any) =>
          node.type !== 'VariableDeclaration' ||
          !record.nativeDeclarations.includes(node.declarations[0].id.name)
      )
    expect(record.bridgeRole.request).toBe('private-next-test-creator-scope')
    expect(record.bridgeRole.imports[0].origin).toBe('generated')
    const emitted = normalizeBrowserCreatorScopes(native, [record.creatorScope])
      .ast as any
    function collect(value: any): any[] {
      if (!value || typeof value !== 'object') return []
      if (Array.isArray(value)) return value.flatMap(collect)
      return [
        ...(value.type ? [value] : []),
        ...Object.entries(value)
          .filter(([key]) => !['loc', 'comments', 'tokens'].includes(key))
          .flatMap(([, child]) => collect(child)),
      ]
    }
    const options: Parameters<typeof associateBrowserJsxCalls>[0] = {
      file: record.file,
      code: record.code,
      authored,
      emitted,
      sourceMap: structuredClone(record.map),
      ...(record.runtime === 'automatic'
        ? { automatic: [structuredClone(record.factory)] }
        : { classic: [structuredClone(record.factory)] }),
    }
    const convertMap = async (sourceMap: unknown, count = 0) => {
      const { convert } = require('next/dist/compiled/next-test-coverage')
      return (
        await convert({
          code: record.code,
          ast: structuredClone(emitted),
          sourceMap,
          coverage: {
            url: 'file:///browser-children/creator-generated.js',
            functions: [
              {
                isBlockCoverage: true,
                ranges: [
                  { startOffset: 0, endOffset: record.code.length, count },
                ],
              },
            ],
          },
        })
      )[record.file]
    }
    return {
      record,
      options,
      authored,
      emitted,
      collect,
      convertMap,
      apply: () => associateBrowserJsxCalls(options),
    }
  }
  it.each(
    profiles.flatMap((profile: any) =>
      [0, 3].map((count) => [profile.name, count, profile])
    )
  )(
    'associates actual creator component %s while retaining every counter at count=%s',
    async (_name, count, record) => {
      const f = await fixture(record),
        before = JSON.stringify(f.options)
      expect(coverageHash(record.source)).toBe(record.sourceSHA)
      const result = f.apply()!
      expect(result).toBeDefined()
      expect(JSON.stringify(f.options)).toBe(before)
      const original = await f.convertMap(f.options.sourceMap, count),
        actual = await f.convertMap(result.sourceMap, count)
      expect([actual.s, actual.f, actual.b]).toEqual([
        original.s,
        original.f,
        original.b,
      ])
      expect(JSON.parse(JSON.stringify(actual.branchMap))).toEqual(
        record.expected.branchMap
      )
    }
  )
  function changeMap(f: any, at: any) {
    const { SourceMapGenerator } = require('next/dist/compiled/source-map'),
      map = new SourceMapGenerator(),
      decoded = decodeCoverageMap(f.options.sourceMap)
    for (const item of decoded.mappings) {
      const generated = {
        line: item.generatedLine,
        column: item.generatedColumn,
      }
      if (item.source === null) map.addMapping({ generated })
      else
        map.addMapping({
          generated,
          source: item.source,
          original: {
            line: item.originalLine,
            column:
              item.originalColumn +
              (generated.line === at.line && generated.column === at.column
                ? 1
                : 0),
          },
          ...((item as any).name ? { name: (item as any).name } : {}),
        })
    }
    for (const [file, content] of decoded.sources)
      if (content !== null) map.setSourceContent(file, content)
    f.options.sourceMap = JSON.parse(map.toString())
  }
  const faults = [
    'missing declaration',
    'duplicate declaration',
    'foreign outer name',
    'foreign inner name',
    'foreign outer map',
    'foreign inner map',
    'foreign value start',
    'different declaration kind',
    'foreign method name',
    'foreign method map',
    'foreign method body',
    'computed method',
    'getter method',
    'static method mismatch',
    'foreign class member',
  ]
  it.each(faults)(
    'does not derive a component branch from %s',
    async (kind) => {
      const f = await fixture(
          profiles.find(
            (row: any) => row.name === 'creator-classic-classexpression.tsx'
          )
        ),
        body = f.emitted.body[0].expression.body.body
      const declaration = body.find(
          (node: any) =>
            node.type === 'VariableDeclaration' &&
            node.declarations[0].id.name === 'Badge'
        ),
        binding = declaration.declarations[0],
        value = binding.init,
        method = value.body.body[0]
      if (kind === 'missing declaration')
        body.splice(body.indexOf(declaration), 1)
      if (kind === 'duplicate declaration')
        body.push(structuredClone(declaration))
      if (kind === 'foreign outer name') binding.id.name = 'Foreign'
      if (kind === 'foreign inner name') value.id.name = 'ForeignInner'
      if (kind === 'foreign outer map') changeMap(f, binding.id.loc.start)
      if (kind === 'foreign inner map') changeMap(f, value.id.loc.start)
      if (kind === 'foreign value start') changeMap(f, value.loc.start)
      if (kind === 'different declaration kind')
        value.type = 'FunctionExpression'
      if (kind === 'foreign method name') method.key.name = 'foreign'
      if (kind === 'foreign method map') changeMap(f, method.key.loc.start)
      if (kind === 'foreign method body')
        changeMap(f, method.value.body.loc.start)
      if (kind === 'computed method') method.computed = true
      if (kind === 'getter method') method.kind = 'get'
      if (kind === 'static method mismatch') method.static = !method.static
      if (kind === 'foreign class member')
        value.body.body.push({ type: 'StaticBlock', body: [] })
      const before = JSON.stringify(f.options),
        result = f.apply()
      expect(JSON.stringify(f.options)).toBe(before)
      const actual = await f.convertMap(
        result?.sourceMap ?? f.options.sourceMap
      )
      expect(JSON.parse(JSON.stringify(actual.branchMap))).not.toEqual(
        f.record.expected.branchMap
      )
    }
  )
  it.each(['foreign inner name', 'foreign keyword map', 'async', 'generator'])(
    'refuses an unowned function expression component: %s',
    async (kind) => {
      const f = await fixture(
          profiles.find(
            (row: any) => row.name === 'creator-classic-expression.tsx'
          )
        ),
        body = f.emitted.body[0].expression.body.body,
        value = body.find(
          (node: any) =>
            node.type === 'VariableDeclaration' &&
            node.declarations[0].id.name === 'Badge'
        ).declarations[0].init
      if (kind === 'foreign inner name') value.id.name = 'Foreign'
      if (kind === 'foreign keyword map') changeMap(f, value.loc.start)
      if (kind === 'async') value.async = true
      if (kind === 'generator') value.generator = true
      const before = JSON.stringify(f.options),
        result = f.apply()
      expect(JSON.stringify(f.options)).toBe(before)
      const actual = await f.convertMap(
        result?.sourceMap ?? f.options.sourceMap
      )
      expect(JSON.parse(JSON.stringify(actual.branchMap))).not.toEqual(
        f.record.expected.branchMap
      )
    }
  )
  it.each([
    'foreign leaf property',
    'foreign leaf map',
    'foreign inner property',
    'foreign inner map',
    'foreign this map',
    'foreign member endpoint',
    'foreign authored endpoint',
    'foreign base kind',
    'optional member',
    'computed member',
    'call expression',
  ])('refuses an unowned named JSX static child: %s', async (kind) => {
    const f = await fixture(
      profiles.find(
        (row: any) => row.name === 'creator-named-classexpression.tsx'
      )
    )
    const leaf = f
        .collect(f.emitted)
        .find(
          (node: any) =>
            node.type === 'MemberExpression' &&
            !node.computed &&
            node.property?.name === 'label'
        ),
      inner = leaf.object,
      base = inner.object
    expect(base.type).toBe('ThisExpression')
    if (kind === 'foreign leaf property') leaf.property.name = 'foreign'
    if (kind === 'foreign leaf map') changeMap(f, leaf.property.loc.start)
    if (kind === 'foreign inner property') inner.property.name = 'foreign'
    if (kind === 'foreign inner map') changeMap(f, inner.property.loc.start)
    if (kind === 'foreign this map') changeMap(f, base.loc.start)
    if (kind === 'foreign member endpoint') changeMap(f, leaf.loc.end)
    if (kind === 'foreign authored endpoint') {
      const original = f
        .collect(f.authored)
        .find(
          (node: any) =>
            node.type === 'MemberExpression' && node.property?.name === 'label'
        )
      original.loc.end.column++
    }
    if (kind === 'foreign base kind')
      Object.assign(base, { type: 'Identifier', name: 'foreign' })
    if (kind === 'optional member') inner.optional = true
    if (kind === 'computed member') inner.computed = true
    if (kind === 'call expression')
      Object.assign(inner, {
        type: 'CallExpression',
        callee: base,
        arguments: [],
      })
    const before = JSON.stringify(f.options)
    expect(() => f.apply()).toThrow(
      'Standard coverage Browser JSX call association is ambiguous or absent'
    )
    expect(JSON.stringify(f.options)).toBe(before)
  })
})

describe('configured development Browser coverage profile boundaries', () => {
  const project = {
    profile: {
      id: 'browser',
      mode: 'development',
      environment: 'browser',
      runtime: 'nodejs',
      bundler: 'turbopack',
      browserClient: true,
    },
    entries: [],
    setupFiles: [],
    include: [],
    exclude: [],
  } as any
  it('admits only the isolated development Chromium client shape', async () => {
    const { isDevelopmentBrowserCoverageProject } = await import(
      'next/dist/experimental/testing/coverage/production-browser'
    )
    expect(isDevelopmentBrowserCoverageProject(project)).toBe(true)
    expect(
      isDevelopmentBrowserCoverageProject({
        ...project,
        browserEngine: 'chromium',
      })
    ).toBe(true)
  })
  it.each([
    { browserEngine: 'firefox' },
    { browserEngine: 'webkit' },
    { isolate: false },
    { setupFiles: ['setup.mjs'] },
    { browserFixtures: [{}] },
    { typecheck: { enabled: true } },
    { executionEnvironment: {} },
    { entries: [{ executionEnvironment: {} }] },
    { profile: { ...project.profile, route: '/' } },
    { profile: { ...project.profile, mode: 'production' } },
    { profile: { ...project.profile, runtime: 'edge' } },
    { profile: { ...project.profile, bundler: 'webpack' } },
    { profile: { ...project.profile, browserClient: false } },
    { profile: { ...project.profile, environment: 'node' } },
  ])('keeps the unqualified development profile closed: %j', async (patch) => {
    const { isDevelopmentBrowserCoverageProject } = await import(
      'next/dist/experimental/testing/coverage/production-browser'
    )
    expect(isDevelopmentBrowserCoverageProject({ ...project, ...patch })).toBe(
      false
    )
  })
})

describe('configured coverage threshold 100 shorthand', () => {
  it('matches complete genuine shorthand CLI reports and exits in both modes', async () => {
    const { execFileSync } = await import('node:child_process')
    const root = await mkdtemp(join(tmpdir(), 'next-threshold-100-proof-'))
    try {
      for (const mode of ['development', 'production']) {
        const output = join(root, mode)
        execFileSync(
          process.execPath,
          [
            join(__dirname, 'threshold-100-reports.mjs'),
            join(__dirname, '../../..'),
            output,
            mode,
          ],
          { encoding: 'utf8', timeout: 180000 }
        )
        const profiles = mode === 'development' ? 12 : 8
        expect(
          JSON.parse(await readFile(join(output, 'RESULTS.json'), 'utf8'))
        ).toMatchObject({
          status: 'passed',
          mode,
          profiles,
          cases: profiles,
          completeReports: profiles,
          fullFileModels: profiles * 2,
        })
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 370000)

  it('retains shorthand until ordinary overrides merge, and replaces configured groups only for explicit CLI 100', async () => {
    const {
      parseProjectStandardCoverage,
      parseStandardCoverageOptions,
      resolveProjectStandardCoverage,
    } = await import('next/dist/experimental/testing/coverage/options')
    const configured = parseProjectStandardCoverage({
      enabled: true,
      thresholds: {
        100: true,
        lines: 0,
        '*.mjs': { 100: true, perFile: true },
      },
    })!
    const before = structuredClone(configured)
    const flags = { 'coverage.thresholds.lines': '0' }
    expect(
      resolveProjectStandardCoverage(
        [{ standardCoverage: configured }],
        flags,
        parseStandardCoverageOptions(flags)
      ).options
    ).toMatchObject({
      thresholds: { 100: true, lines: 0 },
      thresholdGroups: [
        { pattern: '*.mjs', thresholds: { 100: true, perFile: true } },
      ],
    })
    const explicit = {
      'coverage.thresholds.100': 'false',
      'coverage.thresholds.lines': '0',
    }
    const resolved = resolveProjectStandardCoverage(
      [{ standardCoverage: configured }],
      explicit,
      parseStandardCoverageOptions(explicit)
    ).options!
    expect(resolved.thresholds).toEqual({ 100: false, lines: 0 })
    expect(resolved.thresholdGroups).toBeUndefined()
    expect(configured).toEqual(before)
  })

  it.each([true, false, 'true', 'false'])(
    'parses the explicit CLI shorthand %p',
    async (value) => {
      const { parseStandardCoverageOptions } = await import(
        'next/dist/experimental/testing/coverage/options'
      )
      expect(
        parseStandardCoverageOptions({ 'coverage.thresholds.100': value })!
          .thresholds
      ).toEqual({ 100: value === true || value === 'true' })
    }
  )
  it.each([0, 1, 'sometimes', {}, []])(
    'rejects invalid shorthand booleans %p',
    async (value) => {
      const { parseProjectStandardCoverage, parseStandardCoverageOptions } =
        await import('next/dist/experimental/testing/coverage/options')
      expect(() =>
        parseStandardCoverageOptions({ 'coverage.thresholds.100': value })
      ).toThrow('must be true or false')
      expect(() =>
        parseProjectStandardCoverage({
          enabled: true,
          thresholds: { 100: value },
        })
      ).toThrow('must be true or false')
      expect(() =>
        parseProjectStandardCoverage({
          enabled: true,
          thresholds: { '*.mjs': { 100: value } },
        })
      ).toThrow('must be true or false')
    }
  )
})

describe('configured coverage threshold glob groups', () => {
  it('matches complete genuine development and production CLI reports, cases and threshold exits', async () => {
    const { execFileSync } = await import('node:child_process')
    const root = await mkdtemp(join(tmpdir(), 'next-threshold-glob-cli-proof-'))
    try {
      for (const mode of ['development', 'production']) {
        const output = join(root, mode)
        execFileSync(
          process.execPath,
          [
            join(__dirname, 'threshold-glob-reports.mjs'),
            join(__dirname, '../../..'),
            output,
            mode,
          ],
          { encoding: 'utf8', timeout: 180000 }
        )
        const result = JSON.parse(
          await readFile(join(output, 'RESULTS.json'), 'utf8')
        )
        expect(result).toMatchObject({
          status: 'passed',
          mode,
          profiles: 12,
          cases: 12,
          completeReports: 12,
          fullFileModels: 24,
        })
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 370000)

  const pristine = require('./fixtures/threshold-globs/pristine.json') as {
    sourceFiles: Record<string, { source: string; sha256: string }>
    coverage: Record<string, Pick<StandardCoverageData, 's' | 'f' | 'b'>>
    rows: {
      name: string
      thresholds: Record<string, unknown>
      thresholdErrors: string[]
    }[]
  }

  it.each(pristine.rows)(
    'matches genuine threshold groups without changing complete file reports: $name',
    async ({ thresholds, thresholdErrors }) => {
      const { parseProjectStandardCoverage } = await import(
        'next/dist/experimental/testing/coverage/options'
      )
      const { createUncoveredJavaScript } = await import(
        'next/dist/experimental/testing/coverage/istanbul'
      )
      const { publishStandardCoverage } = await import(
        'next/dist/experimental/testing/coverage/report-standard'
      )
      const f = await standardReportFixture()
      try {
        const files = []
        for (const [name, reference] of Object.entries(pristine.coverage)) {
          const source = pristine.sourceFiles[name]
          const file = join(f.root, name)
          expect(coverageHash(source.source)).toBe(source.sha256)
          await writeFile(file, source.source)
          const data = await createUncoveredJavaScript(file, source.source)
          // Publisher-only inputs use saved genuine counters. Public CLI
          // execution independently verifies their compiler/runtime origin.
          data.s = structuredClone(reference.s)
          data.f = structuredClone(reference.f)
          data.b = structuredClone(reference.b)
          expect(JSON.parse(JSON.stringify({ ...data, path: name }))).toEqual(
            reference
          )
          files.push({ file, sha256: source.sha256, data })
        }
        const config = parseProjectStandardCoverage({
          provider: 'v8',
          enabled: true,
          include: ['subject.mjs', 'unimported.mjs'],
          reporter: ['json', 'json-summary', 'lcovonly'],
          reportsDirectory: 'glob-reports',
          thresholds,
        })!.options
        const result = await publishStandardCoverage({
          projectDir: f.root,
          facts: [{ ...f.facts[0], files }],
          expected: f.expected,
          excludedFiles: [],
          config,
          status: 'passed',
          includeUnimported: false,
        })
        expect(result.published).toBe(true)
        expect(result.thresholdErrors).toEqual(thresholdErrors)
        const report = JSON.parse(
          await readFile(
            join(f.root, 'glob-reports/coverage-final.json'),
            'utf8'
          )
        )
        expect(
          Object.fromEntries(
            Object.entries(report).map(([file, data]) => [
              file.slice(f.root.length + 1),
              { ...(data as object), path: file.slice(f.root.length + 1) },
            ])
          )
        ).toEqual(pristine.coverage)
      } finally {
        await rm(f.root, { recursive: true, force: true })
      }
    }
  )

  it('keeps independent ordered patterns through explicit global CLI overrides', async () => {
    const {
      parseProjectStandardCoverage,
      parseStandardCoverageOptions,
      resolveProjectStandardCoverage,
    } = await import('next/dist/experimental/testing/coverage/options')
    const configured = parseProjectStandardCoverage({
      enabled: true,
      thresholds: {
        lines: 100,
        perFile: true,
        'subject.mjs': { lines: 50 },
        '*.mjs': { functions: -1, perFile: false },
      },
    })!
    const before = structuredClone(configured)
    const flags = {
      'coverage.thresholds.lines': '0',
      'coverage.thresholds.perFile': false,
    }
    const resolved = resolveProjectStandardCoverage(
      [{ standardCoverage: configured }],
      flags,
      parseStandardCoverageOptions(flags)
    )
    expect(resolved.options!.thresholds).toEqual({ lines: 0, perFile: false })
    expect(resolved.options!.thresholdGroups).toEqual([
      { pattern: 'subject.mjs', thresholds: { lines: 50 } },
      { pattern: '*.mjs', thresholds: { functions: -1, perFile: false } },
    ])
    expect(configured).toEqual(before)
    expect(() =>
      resolveProjectStandardCoverage(
        [
          { standardCoverage: configured },
          {
            standardCoverage: {
              ...configured,
              options: {
                ...configured.options,
                thresholdGroups: configured.options
                  .thresholdGroups!.slice()
                  .reverse(),
              },
            },
          },
        ],
        {},
        undefined
      )
    ).toThrow('must share the same V8 coverage configuration')
  })

  it.each([
    { '*.mjs': 1 },
    { '*.mjs': [] },
    { '*.mjs': { lines: 101 } },
    { '*.mjs': { functions: Infinity } },
    { '*.mjs': { perFile: 'sometimes' } },
    { '*.mjs': { nested: { lines: 100 } } },
    { '*.mjs': { autoUpdate: true } },
    { '*.mjs': { '100': 'sometimes' } },
  ])(
    'rejects invalid or unimplemented nested threshold settings: %p',
    async (thresholds) => {
      const { parseProjectStandardCoverage } = await import(
        'next/dist/experimental/testing/coverage/options'
      )
      expect(() =>
        parseProjectStandardCoverage({ enabled: true, thresholds })
      ).toThrow()
    }
  )
})

it('maps native development JSX generated import owners to complete genuine models and case rows', async () => {
  const { execFileSync } = require('node:child_process')
  const { resolve } = await import('path')
  const root = await mkdtemp(join(tmpdir(), 'next-development-jsx-models-'))
  try {
    for (const kind of ['tsx', 'jsx']) {
      const output = join(root, kind)
      execFileSync(
        process.execPath,
        [
          join(__dirname, 'development-browser-source-models.mjs'),
          resolve(__dirname, '../../..'),
          output,
          kind,
        ],
        { encoding: 'utf8', timeout: 200000 }
      )
      const result = JSON.parse(
        await readFile(join(output, 'RESULTS.json'), 'utf8')
      )
      expect(result.status).toBe(
        'private whole declaration/runtime/published data equal'
      )
      expect(result.declarations).toBe(2)
      expect(result.cases).toBe(kind === 'tsx' ? 2 : 1)
      expect(result.nativeVersion).toBe(1)
      expect(result.controls).toEqual(
        kind === 'tsx'
          ? [
              'arity',
              'namespace',
              'fragment',
              'duplicate-owner',
              'source-owner',
              'mode',
              'filename',
            ]
          : ['arity', 'namespace', 'source-owner', 'mode', 'filename']
      )
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 420000)

it('routes configured development Browser JSX coverage through the actual CLI', async () => {
  const { execFileSync } = require('node:child_process')
  const { resolve } = await import('path')
  const project = resolve(__dirname, '../../..')
  const root = await mkdtemp(join(tmpdir(), 'next-development-jsx-cli-'))
  try {
    for (const kind of ['tsx', 'jsx']) {
      execFileSync(
        process.execPath,
        [
          join(__dirname, 'browser-development-jsx-cli-reports.mjs'),
          project,
          project,
          join(root, kind),
          kind,
          'development',
          '--source',
        ],
        { encoding: 'utf8', timeout: 240000 }
      )
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 600000)

describe('configured coverage threshold autoUpdate', () => {
  const pristine = require('./fixtures/threshold-autoupdate/pristine.json')
  const rows = [...pristine.rows, ...pristine.sharedCliRows] as any[]
  const global = rows.find((row) => row.name === 'global')
  const metrics = ['lines', 'functions', 'statements', 'branches']
  const candidates = rows.filter((row) =>
    [
      'global',
      'unchanged',
      'per-file-minimum',
      'negative',
      'negative-zero',
      'overlapping-globs',
      'empty-per-file',
      'threshold-failure',
      'cli-enable',
      'cli-disable',
      'cli-add-metric',
      'cli-100',
      'cli-100-then-update',
      'cli-update-then-100',
      'name-filter',
      'file-filter',
      'compact-insert',
      'trailing-comma-insert',
      'empty-object-insert',
      'cli-auto-yes',
      'cli-auto-no',
      'cli-auto-maybe',
      'cli-auto-0',
      'cli-auto-empty',
    ].includes(row.name)
  )

  it('matches complete genuine one-shot development CLI config edits and coverage reports', async () => {
    const { execFileSync } = await import('node:child_process')
    const output = await mkdtemp(
      join(tmpdir(), 'next-coverage-autoupdate-cli-')
    )
    try {
      execFileSync(
        process.execPath,
        [
          join(__dirname, 'threshold-autoupdate-reports.mjs'),
          join(__dirname, '../../..'),
          output,
          'development',
          '--source',
          '--writer',
        ],
        { encoding: 'utf8', timeout: 600000 }
      )
      const result = JSON.parse(
        await readFile(join(output, 'RESULTS.json'), 'utf8')
      )
      expect(result).toMatchObject({
        status: 'passed',
        mode: 'development',
        profiles: 34,
      })
      expect(result.unqualifiedPrerequisites).toEqual([
        pristine.originalNonSharedCliBoundary,
      ])
    } catch (error) {
      const evidence = process.env.NEXT_TESTING_AUTOUPDATE_EVIDENCE
      if (evidence) {
        try {
          const { cp } = await import('fs/promises')
          await cp(output, join(evidence, 'maintained-cli-failure'), {
            recursive: true,
          })
        } catch {}
      }
      throw error
    } finally {
      await rm(output, { recursive: true, force: true })
    }
  }, 610000)

  it.each(candidates)(
    'derives improvements from the complete genuine file model: $name',
    async (row) => {
      const {
        parseProjectStandardCoverage,
        parseStandardCoverageOptions,
        resolveProjectStandardCoverage,
      } = await import('next/dist/experimental/testing/coverage/options')
      const { createUncoveredJavaScript } = await import(
        'next/dist/experimental/testing/coverage/istanbul'
      )
      const { publishStandardCoverage } = await import(
        'next/dist/experimental/testing/coverage/report-standard'
      )
      const f = await standardReportFixture()
      try {
        const files = []
        for (const [name, reference] of Object.entries(row.coverage) as [
          string,
          any,
        ][]) {
          const source = pristine.sourceFiles[name]
          const file = join(f.root, name)
          expect(coverageHash(source.source)).toBe(source.sha256)
          await writeFile(file, source.source)
          const data = await createUncoveredJavaScript(file, source.source)
          // Complete saved provider counters are publisher-only inputs. The
          // real CLI qualification separately proves their execution origin.
          for (const field of ['s', 'f', 'b'] as const)
            data[field] = structuredClone(reference[field])
          expect(JSON.parse(JSON.stringify({ ...data, path: name }))).toEqual(
            reference
          )
          files.push({ file, sha256: source.sha256, data })
        }
        const configured = parseProjectStandardCoverage({
          enabled: true,
          provider: 'v8',
          reporter: ['json', 'json-summary', 'lcovonly'],
          include: Object.keys(row.coverage),
          thresholds: row.profile.thresholds,
        })!
        const flags = Object.fromEntries(
          (row.profile.flags ?? [])
            .filter((flag: string) => flag.startsWith('--coverage.'))
            .map((flag: string) => {
              const [key, value] = flag.slice(2).split('=')
              return [key, value]
            })
        )
        const config = resolveProjectStandardCoverage(
          [{ standardCoverage: configured }],
          flags,
          parseStandardCoverageOptions(flags)
        ).options!
        const result = await publishStandardCoverage({
          projectDir: f.root,
          facts: [{ ...f.facts[0], files }],
          expected: f.expected,
          excludedFiles: [],
          config,
          status: 'passed',
          includeUnimported: false,
        })
        expect(result.published).toBe(true)
        expect(result.thresholdUpdates ?? []).toEqual(row.measuredUpdates)
        const actual = JSON.parse(
          await readFile(join(f.root, 'coverage/coverage-final.json'), 'utf8')
        )
        expect(
          Object.fromEntries(
            Object.entries(actual).map(([file, data]: [string, any]) => [
              basename(file),
              { ...data, path: basename(file) },
            ])
          )
        ).toEqual(row.coverage)
      } finally {
        await rm(f.root, { recursive: true, force: true })
      }
    }
  )

  it.each(
    rows.filter(
      (row) => row.configChanged && row.name !== 'body-failure-report-enabled'
    )
  )('matches the entire genuine configuration edit: $name', async (row) => {
    const { updateCoverageThresholds } = await import(
      'next/dist/experimental/testing/coverage/threshold-update'
    )
    const directory = await mkdtemp(
      join(tmpdir(), 'next-coverage-threshold-update-')
    )
    const file = join(directory, 'vitest.config.mjs')
    try {
      await writeFile(file, row.before)
      expect(
        await updateCoverageThresholds({
          configFile: file,
          updates: row.measuredUpdates,
        })
      ).toBe(true)
      expect(await readFile(file, 'utf8')).toBe(row.after)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('reads actual edits made after config evaluation and retains their comments', async () => {
    const { updateCoverageThresholds } = await import(
      'next/dist/experimental/testing/coverage/threshold-update'
    )
    const row = pristine.currentEditRows.find(
      (row: any) => row.name === 'disk-edit-numeric'
    )
    const directory = await mkdtemp(
      join(tmpdir(), 'next-coverage-current-threshold-')
    )
    const file = join(directory, 'vitest.config.mjs')
    try {
      const current =
        row.before.replace('"lines": 0', '"lines": 90') +
        '\n// actual on-disk user edit retained\n'
      await writeFile(file, current)
      expect(
        await updateCoverageThresholds({
          configFile: file,
          updates: global.measuredUpdates,
        })
      ).toBe(true)
      expect(await readFile(file, 'utf8')).toBe(row.after)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each(['complex-config', 'missing-threshold-object', 'missing-config'])(
    'keeps the genuine config writer failure separate from published reports: %s',
    async (name) => {
      const { updateCoverageThresholds } = await import(
        'next/dist/experimental/testing/coverage/threshold-update'
      )
      const row = rows.find((row) => row.name === name)
      const directory = await mkdtemp(
        join(tmpdir(), 'next-coverage-config-shape-')
      )
      const file = join(directory, 'vitest.config.mjs')
      try {
        if (row.before !== null) await writeFile(file, row.before)
        const message = row.diagnostics.match(/Error: ([^\n]+)/)?.[1]
        expect(message).toBeDefined()
        await expect(
          updateCoverageThresholds({
            configFile: row.before === null ? undefined : file,
            updates: global.measuredUpdates,
          })
        ).rejects.toThrow(message)
        if (row.before !== null)
          expect(await readFile(file, 'utf8')).toBe(row.before)
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
  )

  it('preserves JSON config syntax and skips a cancelled writer without touching its current source', async () => {
    const { updateCoverageThresholds } = await import(
      'next/dist/experimental/testing/coverage/threshold-update'
    )
    const directory = await mkdtemp(
      join(tmpdir(), 'next-coverage-json-threshold-')
    )
    const file = join(directory, 'next.test.config.json')
    try {
      const before =
        JSON.stringify(
          {
            test: { coverage: { thresholds: { autoUpdate: true, lines: 0 } } },
          },
          null,
          2
        ) + '\n'
      await writeFile(file, before)
      const controller = new AbortController()
      controller.abort(new Error('actual writer cancellation'))
      await expect(
        updateCoverageThresholds({
          configFile: file,
          updates: global.measuredUpdates,
          signal: controller.signal,
        })
      ).rejects.toBe(controller.signal.reason)
      expect(await readFile(file, 'utf8')).toBe(before)
      expect(
        await updateCoverageThresholds({
          configFile: file,
          updates: global.measuredUpdates,
        })
      ).toBe(true)
      const updated = JSON.parse(await readFile(file, 'utf8')).test.coverage
        .thresholds
      expect(updated.autoUpdate).toBe(true)
      for (const update of global.measuredUpdates)
        expect(updated[update.metric]).toBe(update.value)
      expect(Object.keys(updated).sort()).toEqual(
        ['autoUpdate', ...metrics].sort()
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe('explicit V8 provider and formatter CLI routes', () => {
  it('keeps legacy standard flags intact while explicit provider selects existing configured formatters', async () => {
    const { parseStandardCoverageOptions } = await import(
      'next/dist/experimental/testing/coverage/options'
    )
    expect(parseStandardCoverageOptions({ coverage: true })).toBeUndefined()
    expect(
      parseStandardCoverageOptions({ 'coverage.reporter': ['json'] })
    ).not.toHaveProperty('formatterReports')
    expect(
      parseStandardCoverageOptions({ 'coverage.provider': 'v8' })
    ).toMatchObject({
      formatterReports: true,
      clean: true,
      reporter: expect.arrayContaining(['text', 'html', 'clover', 'json']),
    })
    const flags = { 'coverage.reporter': ['text', 'json', 'text'] }
    const before = structuredClone(flags)
    expect(parseStandardCoverageOptions(flags)).toMatchObject({
      formatterReports: true,
      reporter: expect.arrayContaining(['text', 'json']),
    })
    expect(flags).toEqual(before)
    expect(
      parseStandardCoverageOptions({ 'coverage.provider': 'istanbul' })
    ).toMatchObject({ provider: 'istanbul', formatterReports: true })
  })

  it('matches actual pristine V8 provider/text/default/HTML/Clover CLI reports and disabled omission', async () => {
    const { execFileSync } = await import('node:child_process')
    const output = await mkdtemp(join(tmpdir(), 'next-provider-text-cli-'))
    try {
      execFileSync(
        process.execPath,
        [
          join(__dirname, 'provider-text-cli-reports.mjs'),
          join(__dirname, '../../..'),
          output,
          '--source',
        ],
        { encoding: 'utf8', timeout: 240000 }
      )
      expect(
        JSON.parse(await readFile(join(output, 'RESULTS.json'), 'utf8'))
      ).toMatchObject({ status: 'passed', profiles: 8 })
    } catch (error) {
      if (process.env.NEXT_TESTING_PROVIDER_EVIDENCE) {
        try {
          const { cp } = await import('fs/promises')
          await cp(
            output,
            join(
              process.env.NEXT_TESTING_PROVIDER_EVIDENCE,
              'maintained-failure'
            ),
            { recursive: true }
          )
        } catch {}
      }
      throw error
    } finally {
      await rm(output, { recursive: true, force: true })
    }
  }, 250000)
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

describe('retained coverage threshold formatter closures', () => {
  it('retains the actual closure and normalizes only its IPC flag without mutating the authored value', async () => {
    const { retainCoverageThresholdFormatter, formatCoverageThresholdUpdates } =
      await import('next/dist/experimental/testing/coverage/threshold-format')
    let calls = 0
    const receivers: unknown[] = []
    const formatter = function (
      this: unknown,
      value: number,
      previous: number
    ) {
      receivers.push(this)
      calls++
      return Math.floor(value) - previous - calls / 10
    }
    const config = {
      test: { coverage: { thresholds: { autoUpdate: formatter, lines: 0 } } },
    }
    const retained = retainCoverageThresholdFormatter(config)
    expect(config.test.coverage.thresholds.autoUpdate).toBe(formatter)
    expect(retained.value).toEqual({
      test: { coverage: { thresholds: { autoUpdate: true, lines: 0 } } },
    })
    expect(structuredClone(retained.value)).toEqual(retained.value)
    const updates = [
      { metric: 'lines' as const, value: 28.57, previous: 0 },
      {
        pattern: 'subject.mjs',
        metric: 'functions' as const,
        value: -3,
        previous: -20,
      },
    ]
    expect(formatCoverageThresholdUpdates(retained.formatter, updates)).toEqual(
      [
        { ...updates[0], value: 27.9 },
        { ...updates[1], value: 16.8 },
      ]
    )
    expect(updates[0].value).toBe(28.57)
    expect(receivers).toEqual([undefined, undefined])
    const ordinary = {
      test: { coverage: { thresholds: { autoUpdate: true } } },
    }
    expect(retainCoverageThresholdFormatter(ordinary)).toEqual({
      value: ordinary,
    })
    expect(retainCoverageThresholdFormatter(ordinary).value).toBe(ordinary)
  })

  it('selects one effective inline owner and keeps multiple/external formatter ownership explicit', async () => {
    const { retainCoverageThresholdFormatter, formatCoverageThresholdUpdates } =
      await import('next/dist/experimental/testing/coverage/threshold-format')
    const first = () => 1
    const second = () => 2
    const coverage = (autoUpdate: boolean | (() => number)) => ({
      thresholds: { autoUpdate },
    })
    expect(
      retainCoverageThresholdFormatter({
        projects: [{ coverage: coverage(first) }],
      }).formatter
    ).toBe(first)
    expect(
      retainCoverageThresholdFormatter({
        test: {
          coverage: coverage(first),
          projects: [{ test: { coverage: coverage(second) } }],
        },
      }).formatter
    ).toBe(second)
    expect(
      retainCoverageThresholdFormatter({
        test: {
          coverage: coverage(first),
          projects: [{ coverage: coverage(false) }],
        },
      }).formatter
    ).toBeUndefined()
    expect(() =>
      retainCoverageThresholdFormatter({
        test: {
          projects: [
            { coverage: coverage(first) },
            { coverage: coverage(second) },
          ],
        },
      })
    ).toThrow('one inline project')
    expect(() =>
      retainCoverageThresholdFormatter({
        test: { coverage: coverage(first), projects: ['./vitest.project.mjs'] },
      })
    ).toThrow('one inline project')
    expect(() =>
      retainCoverageThresholdFormatter(
        { test: { coverage: coverage(first) } },
        true
      )
    ).toThrow('one inline project')
    expect(() => formatCoverageThresholdUpdates(undefined, [])).toThrow(
      'No coverage threshold formatter belongs'
    )
  })

  it('uses the real child closure across requests and closes it after formatter errors and global teardown', async () => {
    const { openTestConfigModule } = await import(
      'next/dist/experimental/testing/config-modules'
    )
    const root = await mkdtemp(
      join(tmpdir(), 'next-threshold-formatter-realm-')
    )
    const trace = join(root, 'trace.jsonl')
    const config = join(root, 'vitest.config.mjs')
    const source = `import { appendFileSync } from 'node:fs'\nlet calls = 0\nexport default { test: { coverage: { thresholds: { autoUpdate: function(value, previous) { calls++; appendFileSync(${JSON.stringify(trace)}, JSON.stringify({ kind: 'format', calls, value, previous, receiver: this === undefined }) + '\\n'); if (calls === 2) throw new Error('actual retained formatter error'); return value - 0.25 } } } } }\n`
    await writeFile(config, source)
    const setup = join(root, 'setup.mjs')
    await writeFile(
      setup,
      `import { appendFileSync } from 'node:fs'\nconst emit = kind => appendFileSync(${JSON.stringify(trace)}, JSON.stringify({kind})+'\\n')\nexport default function() { emit('setup'); return () => emit('teardown') }\n`
    )
    let realm: Awaited<ReturnType<typeof openTestConfigModule>> | undefined
    try {
      realm = await openTestConfigModule(config, root)
      expect(realm.value).toEqual({
        test: { coverage: { thresholds: { autoUpdate: true } } },
      })
      await realm.setup([
        { name: 'control', globalSetup: [setup], provide: {} },
      ])
      expect(
        await realm.formatCoverageThresholdUpdates!([
          { metric: 'lines', previous: 0, value: 28.57 },
        ])
      ).toEqual([{ metric: 'lines', previous: 0, value: 28.32 }])
      await expect(
        realm.formatCoverageThresholdUpdates!([
          { metric: 'functions', previous: -20, value: -3 },
        ])
      ).rejects.toThrow('actual retained formatter error')
      await realm.dispose()
      await expect(realm.formatCoverageThresholdUpdates!([])).rejects.toThrow(
        'session is unavailable'
      )
      expect(
        (await readFile(trace, 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      ).toEqual([
        { kind: 'setup' },
        { kind: 'format', calls: 1, value: 28.57, previous: 0, receiver: true },
        { kind: 'format', calls: 2, value: -3, previous: -20, receiver: true },
        { kind: 'teardown' },
      ])
      expect(await readFile(config, 'utf8')).toBe(source)
    } finally {
      await realm?.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('preserves actual formatter and nested teardown errors and causes across the existing config IPC', async () => {
    const { openTestConfigModule } = await import(
      'next/dist/experimental/testing/config-modules'
    )
    const root = await mkdtemp(join(tmpdir(), 'next-threshold-error-tree-'))
    const trace = join(root, 'trace.json')
    const config = join(root, 'vitest.config.mjs')
    await writeFile(
      config,
      `export const cause = new Error('actual formatter cause')\nexport const leaf = new TypeError('actual formatter leaf', {cause})\nexport const noStack = new Error('actual error without stack')\ndelete noStack.stack\nexport const originalStack = leaf.stack\nexport const originalKeys = Object.getOwnPropertyNames(leaf)\nexport default {test:{coverage:{thresholds:{autoUpdate:()=>{throw leaf}}}}}\n`
    )
    const setup = join(root, 'setup.mjs')
    await writeFile(
      setup,
      `import {writeFileSync} from 'node:fs'\nimport {leaf,noStack,cause,originalStack,originalKeys} from './vitest.config.mjs'\nexport default function() { return () => {writeFileSync(${JSON.stringify(trace)}, JSON.stringify({sameCause:leaf.cause===cause,stackUnchanged:leaf.stack===originalStack,keysUnchanged:JSON.stringify(Object.getOwnPropertyNames(leaf))===JSON.stringify(originalKeys)}));throw new AggregateError([leaf,noStack],'actual nested teardown',{cause:new Error('actual group cause')})} }\n`
    )
    let realm: Awaited<ReturnType<typeof openTestConfigModule>> | undefined
    try {
      realm = await openTestConfigModule(config, root)
      await realm.setup([
        { name: 'control', globalSetup: [setup], provide: {} },
      ])
      const formatterError = await realm.formatCoverageThresholdUpdates!([
        { metric: 'lines', previous: 0, value: 20 },
      ]).catch((error: Error) => error)
      expect(formatterError).toMatchObject({
        name: 'TypeError',
        message: 'actual formatter leaf',
        cause: { message: 'actual formatter cause' },
      })
      const teardownError = await realm.dispose().catch((error: Error) => error)
      expect(teardownError).toBeInstanceOf(AggregateError)
      expect(teardownError).toMatchObject({
        message: 'Global setup teardown failed.',
        errors: [
          {
            name: 'AggregateError',
            message: 'actual nested teardown',
            cause: { message: 'actual group cause' },
            errors: [formatterError, { message: 'actual error without stack' }],
          },
        ],
      })
      if (
        !(formatterError instanceof Error) ||
        !(teardownError instanceof AggregateError)
      )
        throw new Error(
          'The actual formatter and aggregate errors were not retained.'
        )
      expect(teardownError.errors[0].errors[0].stack).toBe(formatterError.stack)
      expect(teardownError.errors[0].errors[1].stack).toBeUndefined()
      expect(JSON.parse(await readFile(trace, 'utf8'))).toEqual({
        sameCause: true,
        stackUnchanged: true,
        keysUnchanged: true,
      })
    } finally {
      await realm?.dispose().catch(() => {})
      await rm(root, { recursive: true, force: true })
    }
  })

  it('matches pristine complete reports, current configuration bytes and callback/setup/teardown order', async () => {
    const { execFileSync } = await import('node:child_process')
    const output = await mkdtemp(
      join(tmpdir(), 'next-threshold-formatter-cli-')
    )
    try {
      execFileSync(
        process.execPath,
        [
          join(__dirname, 'threshold-formatter-reports.mjs'),
          join(__dirname, '../../..'),
          output,
          '--source',
        ],
        { encoding: 'utf8', timeout: 240000 }
      )
      expect(
        JSON.parse(await readFile(join(output, 'RESULTS.json'), 'utf8'))
      ).toMatchObject({ status: 'passed', profiles: 8 })
    } catch (error) {
      if (process.env.NEXT_TESTING_FORMATTER_EVIDENCE) {
        try {
          const { cp } = await import('fs/promises')
          await cp(
            output,
            join(
              process.env.NEXT_TESTING_FORMATTER_EVIDENCE,
              'maintained-failure'
            ),
            { recursive: true }
          )
        } catch {}
      }
      throw error
    } finally {
      await rm(output, { recursive: true, force: true })
    }
  }, 250000)
})

describe('disabled formatter configuration cleanup before ordinary result cache publication', () => {
  it('retains the passing case and original teardown failure without publishing cached facts', async () => {
    const { execFileSync } = await import('node:child_process')
    const output = await mkdtemp(
      join(tmpdir(), 'next-disabled-formatter-cache-')
    )
    try {
      execFileSync(
        process.execPath,
        [
          join(__dirname, 'threshold-formatter-cache-reports.mjs'),
          join(__dirname, '../../..'),
          output,
          '--source',
        ],
        { encoding: 'utf8', timeout: 150000 }
      )
      expect(
        JSON.parse(await readFile(join(output, 'CHECKS.json'), 'utf8'))
      ).toEqual({
        status: 'passed',
        casePassed: true,
        teardownFailed: true,
        formatterNotCalled: true,
        cacheNotPublished: true,
        noCoveragePublished: true,
        teardownOnce: true,
      })
    } catch (error) {
      if (process.env.NEXT_TESTING_FORMATTER_CACHE_EVIDENCE) {
        try {
          const { cp } = await import('fs/promises')
          await cp(
            output,
            join(
              process.env.NEXT_TESTING_FORMATTER_CACHE_EVIDENCE,
              'maintained-failure'
            ),
            { recursive: true }
          )
        } catch {}
      }
      throw error
    } finally {
      await rm(output, { recursive: true, force: true })
    }
  }, 160000)
})

describe('explicit CLI V8 configured provider overrides', () => {
  it('applies the parent-selected provider before provider-specific parsing without changing authored objects', async () => {
    const { applyCoverageProviderOverride } = await import(
      'next/dist/experimental/testing/coverage/provider-override'
    )
    const formatter = (value: number) => Math.floor(value)
    const coverage = {
      provider: 'custom',
      customProviderModule: './missing-provider.mjs',
      enabled: false,
      clean: false,
      reportsDirectory: 'selected',
      reportOnFailure: true,
      thresholds: { autoUpdate: formatter, lines: 0 },
    }
    const input = {
      test: {
        include: ['*.test.mjs'],
        coverage,
        projects: [{ test: { coverage: { ...coverage, enabled: true } } }],
      },
    }
    expect(applyCoverageProviderOverride(input, undefined)).toBe(input)
    const normalized = applyCoverageProviderOverride(
      input,
      'v8'
    ) as typeof input
    expect(normalized.test.coverage).toEqual({
      provider: 'v8',
      enabled: false,
      clean: false,
      reportsDirectory: 'selected',
      reportOnFailure: true,
      thresholds: { autoUpdate: formatter, lines: 0 },
    })
    expect(normalized.test.projects[0].test.coverage).toEqual({
      ...normalized.test.coverage,
      enabled: true,
    })
    expect(input.test.coverage).toBe(coverage)
    expect(input.test.coverage.customProviderModule).toBe(
      './missing-provider.mjs'
    )
    expect(normalized.test.coverage.thresholds.autoUpdate).toBe(formatter)
    expect(
      applyCoverageProviderOverride({ projects: [{ coverage }] }, 'v8')
    ).toEqual({ projects: [{ coverage: normalized.test.coverage }] })
    expect(
      applyCoverageProviderOverride({ test: { include: ['*.mjs'] } }, 'v8')
    ).toEqual({ test: { include: ['*.mjs'] } })
  })

  it('preserves explicit provider enable/disable precedence and leaves legacy flag absence unchanged', async () => {
    const {
      parseProjectStandardCoverage,
      parseStandardCoverageOptions,
      resolveProjectStandardCoverage,
    } = await import('next/dist/experimental/testing/coverage/options')
    const flags = { 'coverage.provider': 'v8' },
      cli = parseStandardCoverageOptions(flags)
    const configured = parseProjectStandardCoverage({
      provider: 'v8',
      enabled: false,
    })!
    expect(
      resolveProjectStandardCoverage(
        [{ standardCoverage: configured }],
        flags,
        cli
      )
    ).toEqual({ enabled: false, configured: true })
    expect(resolveProjectStandardCoverage([{}], flags, cli)).toEqual({
      enabled: false,
      configured: false,
    })
    expect(
      resolveProjectStandardCoverage(
        [{ standardCoverage: configured }],
        { ...flags, coverage: true },
        cli
      )
    ).toMatchObject({
      enabled: true,
      configured: true,
      options: { reporter: expect.arrayContaining(['json']) },
    })
    configured.enabled = true
    expect(
      resolveProjectStandardCoverage(
        [{ standardCoverage: configured }],
        { ...flags, coverage: false },
        cli
      )
    ).toEqual({ enabled: false, configured: true })
    const legacy = { 'coverage.reporter': ['json'] },
      old = parseStandardCoverageOptions(legacy)
    expect(resolveProjectStandardCoverage([{}], legacy, old)).toEqual({
      enabled: false,
      configured: false,
    })
  })

  it.each(['mjs', 'json'])(
    'normalizes actual %s configuration after evaluation while preserving its raw provider bytes',
    async (extension) => {
      const { openTestConfiguration } = await import(
        'next/dist/experimental/testing/config'
      )
      const root = await mkdtemp(
        join(tmpdir(), 'next-provider-override-config-')
      )
      const filename = join(
        root,
        extension === 'json' ? 'next.test.config.json' : 'vitest.config.mjs'
      )
      const value = {
        test: {
          include: ['*.test.mjs'],
          coverage: {
            enabled: false,
            provider: 'custom',
            customProviderModule: './deliberately-missing.mjs',
            clean: false,
            reportsDirectory: 'configured-reports',
            reportOnFailure: true,
          },
        },
      }
      const source =
        (extension === 'json' ? '' : 'export default ') +
        JSON.stringify(value) +
        '\n'
      await writeFile(filename, source)
      let config: Awaited<ReturnType<typeof openTestConfiguration>> | undefined
      try {
        config = await openTestConfiguration(root, undefined, 'v8')
        expect(config.config.projects[0].standardCoverage).toMatchObject({
          enabled: false,
          options: {
            clean: false,
            reportsDirectory: 'configured-reports',
            reportOnFailure: true,
          },
        })
        expect(config.config.projects[0].customCoverage).toBeUndefined()
        expect(await readFile(filename, 'utf8')).toBe(source)
      } finally {
        await config?.dispose()
        await rm(root, { recursive: true, force: true })
      }
    }
  )

  it('matches thirteen actual pristine configured/custom/missing-module and no-config CLI provider profiles', async () => {
    const { execFileSync } = await import('node:child_process')
    const output = await mkdtemp(join(tmpdir(), 'next-provider-override-cli-'))
    try {
      execFileSync(
        process.execPath,
        [
          join(__dirname, 'provider-override-cli-reports.mjs'),
          join(__dirname, '../../..'),
          output,
          '--source',
        ],
        { encoding: 'utf8', timeout: 360000 }
      )
      expect(
        JSON.parse(await readFile(join(output, 'RESULTS.json'), 'utf8'))
      ).toMatchObject({ status: 'passed', profiles: 13 })
    } catch (error) {
      if (process.env.NEXT_TESTING_PROVIDER_OVERRIDE_EVIDENCE) {
        try {
          const { cp } = await import('fs/promises')
          await cp(
            output,
            join(
              process.env.NEXT_TESTING_PROVIDER_OVERRIDE_EVIDENCE,
              'maintained-failure'
            ),
            { recursive: true }
          )
        } catch {}
      }
      throw error
    } finally {
      await rm(output, { recursive: true, force: true })
    }
  }, 375000)
})

describe('production retained coverage threshold formatter closures', () => {
  it('matches all eight genuine complete production reports, configuration bytes and lifecycle rows', async () => {
    const { execFileSync } = await import('node:child_process')
    const output = await mkdtemp(
      join(tmpdir(), 'next-production-threshold-formatter-cli-')
    )
    try {
      execFileSync(
        process.execPath,
        [
          join(__dirname, 'threshold-formatter-reports.mjs'),
          join(__dirname, '../../..'),
          output,
          '--mode=production',
          '--source',
        ],
        { encoding: 'utf8', timeout: 240000 }
      )
      expect(
        JSON.parse(await readFile(join(output, 'RESULTS.json'), 'utf8'))
      ).toMatchObject({ status: 'passed', mode: 'production', profiles: 8 })
    } catch (error) {
      if (process.env.NEXT_TESTING_PRODUCTION_FORMATTER_EVIDENCE) {
        try {
          const { cp } = await import('fs/promises')
          await cp(
            output,
            join(
              process.env.NEXT_TESTING_PRODUCTION_FORMATTER_EVIDENCE,
              'maintained-failure'
            ),
            { recursive: true }
          )
        } catch {}
      }
      throw error
    } finally {
      await rm(output, { recursive: true, force: true })
    }
  }, 250000)
})

describe('dotted standard coverage flags configure collection without activating it', () => {
  it.each([
    { 'coverage.reporter': ['json'] },
    { 'coverage.include': ['subject.mjs'] },
    { 'coverage.thresholds.lines': '99' },
    { 'coverage.provider': 'v8' },
  ])(
    'resolves actual collection intent independently of standard options: %j',
    async (flags) => {
      const {
        parseStandardCoverageOptions,
        parseProjectStandardCoverage,
        resolveProjectStandardCoverage,
      } = await import('next/dist/experimental/testing/coverage/options')
      const cli = parseStandardCoverageOptions(flags),
        disabled = parseProjectStandardCoverage({ enabled: false })!,
        enabled = parseProjectStandardCoverage({ enabled: true })!
      expect(resolveProjectStandardCoverage([{}], flags, cli)).toEqual({
        enabled: false,
        configured: false,
      })
      expect(
        resolveProjectStandardCoverage(
          [{ standardCoverage: disabled }],
          flags,
          cli
        )
      ).toEqual({ enabled: false, configured: true })
      expect(
        resolveProjectStandardCoverage(
          [{ standardCoverage: enabled }],
          flags,
          cli
        )
      ).toMatchObject({ enabled: true, configured: true })
      expect(
        resolveProjectStandardCoverage([{}], { ...flags, coverage: true }, cli)
      ).toMatchObject({ enabled: true, options: cli, configured: false })
      expect(
        resolveProjectStandardCoverage(
          [{ standardCoverage: enabled }],
          { ...flags, coverage: false },
          cli
        )
      ).toEqual({ enabled: false, configured: true })
    }
  )
  it('matches eleven actual genuine activation/report/include/threshold and explicit enable/disable profiles', async () => {
    const { execFileSync } = await import('node:child_process')
    const output = await mkdtemp(join(tmpdir(), 'next-coverage-enable-cli-'))
    try {
      execFileSync(
        process.execPath,
        [
          join(__dirname, 'coverage-enable-cli-reports.mjs'),
          join(__dirname, '../../..'),
          output,
          '--source',
        ],
        { encoding: 'utf8', timeout: 300000 }
      )
      expect(
        JSON.parse(await readFile(join(output, 'RESULTS.json'), 'utf8'))
      ).toMatchObject({ status: 'passed', profiles: 11 })
    } catch (error) {
      if (process.env.NEXT_TESTING_ENABLE_EVIDENCE) {
        try {
          const { cp } = await import('fs/promises')
          await cp(
            output,
            join(
              process.env.NEXT_TESTING_ENABLE_EVIDENCE,
              'maintained-failure'
            ),
            { recursive: true }
          )
        } catch {}
      }
      throw error
    } finally {
      await rm(output, { recursive: true, force: true })
    }
  }, 315000)
})

describe('formatter current AST preparation before caller-owned commit', () => {
  const rows = require('./fixtures/formatter-ast/pristine.json').rows as {
    name: string
    before: string
    profile: { edit?: string; glob?: boolean }
    calls: number[][]
    diagnostics: string
  }[]
  it.each(rows)(
    'retains genuine calls and error ordering for $name in the actual configuration realm',
    async (row) => {
      const { openTestConfigModule } = await import(
        'next/dist/experimental/testing/config-modules'
      )
      const root = await mkdtemp(join(tmpdir(), 'next-formatter-ast-realm-')),
        trace = join(root, 'trace.jsonl'),
        file = join(root, 'vitest.config.mjs')
      const before = row.before.replaceAll(
        '<TRACE_DIR>/' + row.name + '/trace.jsonl',
        trace
      )
      await writeFile(file, before)
      const realm = await openTestConfigModule(file, root)
      try {
        const alternate = join(root, 'next.test.config.mjs')
        const alternateSource =
          'export default {test:{coverage:{thresholds:{lines:123}}}}\n'
        await writeFile(alternate, alternateSource)
        if (row.profile.edit) await writeFile(file, row.profile.edit)
        const current = await readFile(file, 'utf8')
        const updates: import('next/dist/experimental/testing/coverage/types').StandardCoverageThresholdUpdate[] =
          row.profile.glob
            ? [
                { metric: 'lines', previous: 0, value: 28.57 },
                ...(
                  ['lines', 'functions', 'statements', 'branches'] as const
                ).map((metric) => ({
                  pattern: 'fully.mjs',
                  metric,
                  previous: 0,
                  value: 100,
                })),
              ]
            : [
                { metric: 'lines', previous: 0, value: 28.57 },
                { metric: 'functions', previous: 0, value: 40 },
                { metric: 'statements', previous: 0, value: 33.33 },
                { metric: 'branches', previous: 0, value: 25 },
              ]
        const error = await realm.prepareCoverageThresholdUpdate!(
          updates
        ).catch((error) => error)
        expect(error).toBeInstanceOf(Error)
        const expected =
          row.name === 'current-glob-missing'
            ? "Cannot set properties of undefined (setting 'lines')"
            : row.name === 'current-thresholds-null'
              ? 'Unable to parse thresholds from configuration file: Expected config.test.coverage.thresholds to be an object'
              : 'Failed to update coverage thresholds. Configuration file is too complex.'
        expect(error.message).toBe(expected)
        expect(error.name).toBe(
          row.name === 'current-glob-missing' ? 'TypeError' : 'Error'
        )
        const { existsSync, readFileSync } = await import('fs')
        expect(
          existsSync(trace)
            ? readFileSync(trace, 'utf8')
                .trim()
                .split('\n')
                .map((line) => JSON.parse(line))
            : []
        ).toEqual(row.calls)
        expect(await readFile(file, 'utf8')).toBe(current)
        expect(await readFile(alternate, 'utf8')).toBe(alternateSource)
      } finally {
        await realm.dispose()
        await rm(root, { recursive: true, force: true })
      }
    }
  )

  it('keeps callback preparation synchronous and defers every write to the cancellable caller', async () => {
    const { openTestConfigModule } = await import(
      'next/dist/experimental/testing/config-modules'
    )
    const { commitCoverageThresholdUpdate } = await import(
      'next/dist/experimental/testing/coverage/threshold-update'
    )
    const root = await mkdtemp(
        join(tmpdir(), 'next-formatter-sync-preparation-')
      ),
      file = join(root, 'vitest.config.mjs'),
      trace = join(root, 'trace.jsonl')
    const original = `import {appendFileSync}from'node:fs'\nlet value=0\nexport default {test:{coverage:{thresholds:{autoUpdate:function(next,previous){appendFileSync(${JSON.stringify(trace)},JSON.stringify([next,previous,value,this===undefined])+'\\n');queueMicrotask(()=>value++);return next+value},lines:0,functions:0}}}}\n`
    await writeFile(file, original)
    const realm = await openTestConfigModule(file, root)
    try {
      const source = await realm.prepareCoverageThresholdUpdate!([
        { metric: 'lines', previous: 0, value: 10 },
        { metric: 'functions', previous: 0, value: 20 },
      ])
      expect(source).toContain('lines:10')
      expect(source).toContain('functions:20')
      expect(
        (await readFile(trace, 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      ).toEqual([
        [10, 0, 0, true],
        [20, 0, 0, true],
      ])
      expect(await readFile(file, 'utf8')).toBe(original)
      const controller = new AbortController()
      controller.abort(new Error('actual abort before prepared commit'))
      expect(() =>
        commitCoverageThresholdUpdate({
          configFile: file,
          source,
          signal: controller.signal,
        })
      ).toThrow('actual abort before prepared commit')
      expect(await readFile(file, 'utf8')).toBe(original)
      expect(commitCoverageThresholdUpdate({ configFile: file, source })).toBe(
        true
      )
      expect(await readFile(file, 'utf8')).toBe(source)
      await expect(
        realm.formatCoverageThresholdUpdates!([
          { metric: 'lines', previous: 0, value: 1 },
        ])
      ).resolves.toEqual([{ metric: 'lines', previous: 0, value: 3 }])
    } finally {
      await realm.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('retains the complete preparation and original selected bytes when the caller cannot write', async () => {
    const { openTestConfigModule } = await import(
      'next/dist/experimental/testing/config-modules'
    )
    const { commitCoverageThresholdUpdate } = await import(
      'next/dist/experimental/testing/coverage/threshold-update'
    )
    const { chmod } = await import('fs/promises')
    const root = await mkdtemp(join(tmpdir(), 'next-formatter-write-error-')),
      file = join(root, 'vitest.config.mjs'),
      trace = join(root, 'trace.jsonl')
    const original = `import {appendFileSync,chmodSync}from'node:fs'\nexport default {test:{coverage:{thresholds:{autoUpdate:function(next,previous){appendFileSync(${JSON.stringify(trace)},JSON.stringify([next,previous])+'\\n');chmodSync(${JSON.stringify(file)},0o444);return next},lines:0,functions:0}}}}\n`
    await writeFile(file, original)
    const realm = await openTestConfigModule(file, root)
    try {
      const source = await realm.prepareCoverageThresholdUpdate!([
        { metric: 'lines', previous: 0, value: 10 },
        { metric: 'functions', previous: 0, value: 20 },
      ])
      expect(source).toContain('lines:10')
      expect(source).toContain('functions:20')
      expect(
        (await readFile(trace, 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      ).toEqual([
        [10, 0],
        [20, 0],
      ])
      expect(() =>
        commitCoverageThresholdUpdate({ configFile: file, source })
      ).toThrow(/EACCES/)
      expect(await readFile(file, 'utf8')).toBe(original)
    } finally {
      await realm.dispose()
      await chmod(file, 0o644)
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('remaining built-in standard coverage reporters', () => {
  it.each(['cobertura', 'html-spa', 'teamcity', 'text-lcov', 'none'])(
    'routes %s through the actual formatter without enabling collection',
    async (reporter) => {
      const {
        parseStandardCoverageOptions,
        parseProjectStandardCoverage,
        resolveProjectStandardCoverage,
      } = await import('next/dist/experimental/testing/coverage/options')
      const flags = { 'coverage.reporter': [reporter] }
      const options = parseStandardCoverageOptions(flags)!
      expect(options).toMatchObject({
        reporter: [reporter],
        formatterReports: true,
      })
      expect(resolveProjectStandardCoverage([{}], flags, options)).toEqual({
        enabled: false,
        configured: false,
      })
      expect(
        parseProjectStandardCoverage({
          enabled: true,
          reporter: [reporter],
        })
      ).toMatchObject({
        enabled: true,
        options: { reporter: [reporter], formatterReports: true },
      })
    }
  )

  it('matches all thirty-four genuine report, stdout, cleanup, disable, failure and no-file update profiles', async () => {
    const { execFileSync } = await import('node:child_process')
    const output = await mkdtemp(join(tmpdir(), 'next-standard-reporters-'))
    try {
      execFileSync(
        process.execPath,
        [
          join(__dirname, 'standard-reporter-reports.mjs'),
          join(__dirname, '../../..'),
          output,
          '--source',
        ],
        { encoding: 'utf8', timeout: 600000 }
      )
      expect(
        JSON.parse(await readFile(join(output, 'RESULTS.json'), 'utf8'))
      ).toMatchObject({ status: 'passed', profiles: 34 })
    } catch (error) {
      if (process.env.NEXT_TESTING_STANDARD_REPORTERS_EVIDENCE) {
        try {
          const { cp } = await import('fs/promises')
          await cp(
            output,
            join(
              process.env.NEXT_TESTING_STANDARD_REPORTERS_EVIDENCE,
              'maintained-failure'
            ),
            { recursive: true }
          )
        } catch {}
      }
      throw error
    } finally {
      await rm(output, { recursive: true, force: true })
    }
  }, 615000)
})

describe('private Istanbul JavaScript producer', () => {
  it('instruments selected raw modules without evaluating unimported code and rejects a different loader phase', async () => {
    const {
      createIstanbulSourcePlan,
      openIstanbulInstrumentation,
      assertIstanbulSourcePlan,
    } = await import(
      'next/dist/experimental/testing/coverage/istanbul-instrumentation'
    )
    const { assertIstanbulMetadata } = await import(
      'next/dist/experimental/testing/coverage/istanbul-capture'
    )
    const { requestCompilerTransform } = await import(
      'next/dist/experimental/testing/compiler/transform-broker'
    )
    const root = await realpath(
      await mkdtemp(join(tmpdir(), 'next-istanbul-loader-'))
    )
    const file = join(root, 'subject.mjs')
    const unused = join(root, 'unimported.mjs')
    const source =
      'export function choose(flag) { if(flag) return 1; return 0 }\n'
    await writeFile(file, source)
    await writeFile(
      unused,
      "throw new Error('unimported source must not run')\n"
    )
    await writeFile(
      join(root, 'excluded.test.mjs'),
      "throw new Error('test source')\n"
    )
    const signal = new AbortController().signal
    const config = {
      reporter: ['json' as const],
      include: ['*.mjs'],
      exclude: [],
      reportsDirectory: 'coverage',
      reportOnFailure: false,
      thresholds: {},
    }
    let service:
      | Awaited<ReturnType<typeof openIstanbulInstrumentation>>
      | undefined
    try {
      const plan = await createIstanbulSourcePlan({
        projectDir: root,
        profile,
        config,
        excludedFiles: [],
        signal,
      })
      expect(plan.sources.map((source) => basename(source.file))).toEqual([
        'subject.mjs',
        'unimported.mjs',
      ])
      service = await openIstanbulInstrumentation({
        projectDir: root,
        plan,
        signal,
      })
      await assertIstanbulMetadata(
        JSON.parse(JSON.stringify(service.descriptor.metadata)),
        root,
        signal
      )
      for (const kind of ['numeric', 'unknown'] as const) {
        const changed = structuredClone(service.descriptor.metadata)
        const declaration = changed.sources.find(
          (source) => source.file === file
        )!
        const position = Object.values(declaration.initial.branchMap)[0]
          .locations[0].start
        if (kind === 'numeric') {
          expect(typeof position.line).toBe('number')
          position.line!++
        } else {
          Object.defineProperty(position, 'foreignCoordinate', {
            enumerable: true,
            value: undefined,
          })
        }
        await expect(
          assertIstanbulMetadata(changed, root, signal)
        ).rejects.toThrow('actual instrumenter map changed')
      }
      expect(
        service.descriptor.metadata.sources.every(
          ({ initial }) =>
            Object.values(initial.s).every((count) => count === 0) &&
            Object.values(initial.f).every((count) => count === 0) &&
            Object.values(initial.b)
              .flat()
              .every((count) => count === 0)
        )
      ).toBe(true)
      const input = { file, query: '', code: source, moduleType: 'js' }
      const actual = await requestCompilerTransform(
        service.descriptor.transport,
        input
      )
      expect(actual.code).toContain('__VITEST_COVERAGE__')
      expect(actual.map?.sourcesContent).toEqual([source])
      for (const change of [
        { query: '?different-phase=1' },
        {
          map: {
            version: 3 as const,
            sources: [file],
            names: [],
            mappings: 'AAAA',
            sourcesContent: [source],
          },
        },
        { code: source + '\n' },
      ]) {
        await expect(
          requestCompilerTransform(service.descriptor.transport, {
            ...input,
            ...change,
          })
        ).rejects.toThrow('unmapped JavaScript phase differs')
      }
      const forged = structuredClone(service.descriptor.metadata)
      forged.sources[0].initial.s[Object.keys(forged.sources[0].initial.s)[0]] =
        1
      await expect(
        assertIstanbulMetadata(forged, root, signal)
      ).rejects.toThrow('actual instrumenter map changed')
      await writeFile(file, source + '// actual current edit\n')
      await expect(assertIstanbulSourcePlan(plan, signal)).rejects.toThrow(
        'selected source changed'
      )
      await expect(
        requestCompilerTransform(service.descriptor.transport, input)
      ).rejects.toThrow('unmapped JavaScript phase differs')
    } finally {
      await service?.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps ordinary configuration exact and refuses foreign profiles before instrumentation', async () => {
    const { withIstanbulInstrumentation } = await import(
      'next/dist/experimental/testing/compiler/istanbul-config'
    )
    const { createIstanbulSourcePlan } = await import(
      'next/dist/experimental/testing/coverage/istanbul-instrumentation'
    )
    const ordinary = {} as any
    expect(withIstanbulInstrumentation(ordinary, '/unused', profile)).toBe(
      ordinary
    )
    await expect(
      createIstanbulSourcePlan({
        projectDir: '/unused',
        profile: { ...profile, mode: 'production' },
        config: {} as any,
        excludedFiles: [],
        signal: new AbortController().signal,
      })
    ).rejects.toThrow('isolated development Node JavaScript')
  })

  it('matches genuine complete models through the actual compiler and worker across selected, absent and selected requests', async () => {
    const { execFileSync } = await import('node:child_process')
    const output = await mkdtemp(join(tmpdir(), 'next-istanbul-private-model-'))
    try {
      execFileSync(
        process.execPath,
        [
          join(__dirname, 'istanbul-provider-private.cjs'),
          join(__dirname, '../../..'),
          output,
          '--source',
        ],
        {
          encoding: 'utf8',
          timeout: 120000,
          env: {
            ...process.env,
            TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
          },
        }
      )
      expect(
        JSON.parse(await readFile(join(output, 'CHECKS.json'), 'utf8'))
      ).toMatchObject({
        actualPrivateCompilerWorkerCases: 2,
        wholeThreeFileJSONSummaryLCOVEqual: true,
        publicAdmission: false,
      })
      expect(
        JSON.parse(await readFile(join(output, 'CLOSED.json'), 'utf8'))
      ).toEqual({
        fixtureRetired: true,
        sessionDisposed: true,
        serviceDisposed: true,
      })
    } finally {
      if (process.env.NEXT_TESTING_ISTANBUL_EVIDENCE) {
        const { cp } = await import('fs/promises')
        await cp(output, process.env.NEXT_TESTING_ISTANBUL_EVIDENCE, {
          recursive: true,
        })
      }
      await rm(output, { recursive: true, force: true })
    }
  }, 125000)
})

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

describe('private settled afterAll compiled producer', () => {
  it.each([
    'sync',
    'async',
    'timeout',
    'parallel-timeout',
    'scope-finalization',
    'disposal',
    'abort',
  ])(
    'retains actual completion and resource vetoes for %s',
    async (scenario) => {
      const { execFileSync } = await import('node:child_process')
      const output = await mkdtemp(join(tmpdir(), 'next-istanbul-afterall-'))
      try {
        execFileSync(
          process.execPath,
          [
            join(__dirname, 'istanbul-afterall-completion.cjs'),
            'supervise',
            join(__dirname, '../../..'),
            output,
            scenario,
          ],
          {
            encoding: 'utf8',
            timeout: 125000,
            env: { ...process.env, TURBO_TASKS_AVAILABLE_PARALLELISM: '4' },
          }
        )
        const checks = JSON.parse(
          await readFile(join(output, 'CHECKS.json'), 'utf8')
        )
        expect(checks).toMatchObject({
          actualCrossModuleCompiledFailure: true,
          captureCount: [
            'sync',
            'async',
            'scope-finalization',
            'disposal',
          ].includes(scenario)
            ? 3
            : 2,
          publicAdmission: false,
        })
        if (['sync', 'async'].includes(scenario))
          expect(checks.errorOwnFieldsEqual).toBe(true)
        expect(
          JSON.parse(await readFile(join(output, 'CLOSED.json'), 'utf8'))
        ).toEqual({
          fixtureRetired: true,
          sessionDisposed: true,
          serviceDisposed: true,
        })
      } finally {
        if (process.env.NEXT_TESTING_ISTANBUL_AFTERALL_EVIDENCE) {
          const { cp } = await import('fs/promises')
          await cp(
            output,
            join(process.env.NEXT_TESTING_ISTANBUL_AFTERALL_EVIDENCE, scenario),
            { recursive: true }
          )
        }
        await rm(output, { recursive: true, force: true })
      }
    },
    130000
  )
})

describe('Istanbul mapped fact wire and publication contract', () => {
  let root: string
  let plan: import('next/dist/experimental/testing/coverage/istanbul-types').IstanbulSourcePlan
  let fact: import('next/dist/experimental/testing/coverage/istanbul-types').IstanbulStandardFileCoverage
  const signal = new AbortController().signal
  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'next-istanbul-facts-')))
    const file = join(root, 'subject.mjs')
    const source = require('./fixtures/istanbul-provider/pristine.json')
      .sourceFiles['subject.mjs'].source
    await writeFile(file, source)
    const { coverageHash } = await import(
      'next/dist/experimental/testing/coverage/artifact'
    )
    const { instrumentJavaScript, remapIstanbulCoverage } = await import(
      'next/dist/compiled/next-test-instrumentation'
    )
    const sha256 = coverageHash(source)
    plan = {
      version: 1,
      profile: {
        id: 'facts',
        environment: 'node',
        runtime: 'nodejs',
        mode: 'development',
        bundler: 'turbopack',
      },
      sources: [{ file, sha256 }],
    }
    const data = (
      await remapIstanbulCoverage({
        [file]: instrumentJavaScript(source, file).initial,
      })
    )[file]
    fact = {
      version: 1,
      provider: 'istanbul',
      entryId: 'entry',
      revision: 'revision',
      complete: true,
      errors: [],
      files: [{ file, sha256, data }],
    }
  })
  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })
  async function validate(facts: unknown) {
    const { assertIstanbulCoverageFacts } = await import(
      'next/dist/experimental/testing/coverage/report-istanbul'
    )
    return assertIstanbulCoverageFacts({
      projectDir: root,
      facts,
      plan,
      expected: new Set(['entry']),
      revisions: new Map([['entry', 'revision']]),
      signal,
    })
  }
  it('retains actual plain mapped data through advanced IPC without numeric normalization', async () => {
    const { serialize, deserialize } = await import('node:v8')
    expect(Object.getPrototypeOf(fact.files[0].data)).toBe(Object.prototype)
    const wire = deserialize(serialize([fact]))
    expect(wire).toEqual([fact])
    expect(await validate(wire)).toEqual([fact])
    expect(
      Object.values(fact.files[0].data.fnMap).some(
        (fn) => fn.loc.end.column === Infinity
      )
    ).toBe(true)
    await expect(validate(JSON.parse(JSON.stringify([fact])))).rejects.toThrow(
      'mapped declarations'
    )
  })
  it('retains the actual remapper omission of an empty selected module', async () => {
    const file = join(root, 'empty.mjs')
    const source = 'export {}\n'
    await writeFile(file, source)
    const { instrumentJavaScript, remapIstanbulCoverage } = await import(
      'next/dist/compiled/next-test-instrumentation'
    )
    const data = await remapIstanbulCoverage({
      [file]: instrumentJavaScript(source, file).initial,
    })
    expect(data).toEqual({})
    const { assertIstanbulCoverageFacts } = await import(
      'next/dist/experimental/testing/coverage/report-istanbul'
    )
    const empty = { ...fact, files: [] }
    const options = {
      projectDir: root,
      plan: { ...plan, sources: [{ file, sha256: coverageHash(source) }] },
      expected: new Set(['entry']),
      signal,
    }
    expect(
      await assertIstanbulCoverageFacts({ ...options, facts: [empty] })
    ).toEqual([empty])
    await expect(
      assertIstanbulCoverageFacts({
        ...options,
        facts: [
          {
            ...empty,
            files: [
              {
                file,
                sha256: coverageHash(source),
                data: {
                  path: file,
                  statementMap: {},
                  fnMap: {},
                  branchMap: {},
                  s: {},
                  f: {},
                  b: {},
                },
              },
            ],
          },
        ],
      })
    ).rejects.toThrow('coverage fact')
  })
  it('awaits the actual Istanbul merged map before report policy and keeps observer mutations private', async () => {
    const { publishIstanbulCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-istanbul'
    )
    const output = join(root, 'observer-success')
    let observed = false
    const result = await publishIstanbulCoverage({
      projectDir: root,
      facts: [fact],
      plan,
      expected: new Set(['entry']),
      config: {
        provider: 'istanbul',
        formatterReports: true,
        exclude: [],
        reporter: ['json'],
        reportsDirectory: 'observer-success',
        reportOnFailure: false,
        thresholds: {},
      },
      status: 'passed',
      signal,
      onCoverageMap: async (map) => {
        await expect(
          readFile(join(output, 'coverage-final.json'))
        ).rejects.toMatchObject({ code: 'ENOENT' })
        expect(map).toEqual({ [fact.files[0].file]: fact.files[0].data })
        expect(
          Object.values(map[fact.files[0].file].fnMap).some(
            (fn) => fn.loc.end.column === Infinity
          )
        ).toBe(true)
        map[fact.files[0].file].s['0'] = 987
        await Promise.resolve()
        observed = true
      },
    })
    expect(observed).toBe(true)
    expect(result.published).toBe(true)
    expect(
      JSON.parse(await readFile(join(output, 'coverage-final.json'), 'utf8'))
    ).toEqual(
      JSON.parse(JSON.stringify({ [fact.files[0].file]: fact.files[0].data }))
    )
  })
  it('observes Istanbul maps on a failed run without publishing reports or evaluating thresholds', async () => {
    const { publishIstanbulCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-istanbul'
    )
    const seen: unknown[] = []
    const result = await publishIstanbulCoverage({
      projectDir: root,
      facts: [fact],
      plan,
      expected: new Set(['entry']),
      signal,
      config: {
        provider: 'istanbul',
        formatterReports: true,
        exclude: [],
        reporter: ['json'],
        reportsDirectory: 'observer-failed',
        reportOnFailure: false,
        thresholds: { statements: 100 },
      },
      status: 'failed',
      onCoverageMap: (map) => {
        seen.push(map)
      },
    })
    expect(seen).toEqual([{ [fact.files[0].file]: fact.files[0].data }])
    expect(result).toEqual({ published: false, thresholdErrors: [] })
    await expect(
      readFile(join(root, 'observer-failed', 'coverage-final.json'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('observes the real empty Istanbul map with no file reporters', async () => {
    const { publishIstanbulCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-istanbul'
    )
    const seen: unknown[] = []
    const result = await publishIstanbulCoverage({
      projectDir: root,
      facts: [{ ...fact, files: [] }],
      plan: { ...plan, sources: [] },
      expected: new Set(['entry']),
      signal,
      config: {
        provider: 'istanbul',
        formatterReports: true,
        exclude: [],
        reporter: ['none'],
        reportsDirectory: 'observer-empty',
        reportOnFailure: false,
        thresholds: {},
      },
      status: 'passed',
      onCoverageMap: (map) => {
        seen.push(map)
      },
    })
    expect(seen).toEqual([{}])
    expect(result.published).toBe(true)
    expect(result.files).toEqual([])
  })
  it('does not invoke the Istanbul observer for missing captures or cancellation', async () => {
    const { publishIstanbulCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-istanbul'
    )
    const onCoverageMap = jest.fn()
    const options = {
      projectDir: root,
      facts: [],
      plan,
      expected: new Set(['entry']),
      signal,
      onCoverageMap,
      config: {
        provider: 'istanbul' as const,
        formatterReports: true as const,
        exclude: [],
        reporter: ['json'] as 'json'[],
        reportsDirectory: 'observer-incomplete',
        reportOnFailure: true,
        thresholds: {},
      },
    }
    await expect(
      publishIstanbulCoverage({ ...options, status: 'passed' })
    ).rejects.toThrow('omitted an expected completed entry')
    await expect(
      publishIstanbulCoverage({ ...options, status: 'cancelled' })
    ).rejects.toThrow('Interrupted runs')
    expect(onCoverageMap).not.toHaveBeenCalled()
  })
  it.each(['passed', 'failed'] as const)(
    'prepares the actual Istanbul map without publishing files or thresholds for %s',
    async (status) => {
      const { publishIstanbulCoverage } = await import(
        'next/dist/experimental/testing/coverage/report-istanbul'
      )
      const { mkdir, readdir } = await import('fs/promises')
      const outputName = 'prepare-' + status
      const output = join(root, outputName)
      await mkdir(output)
      await writeFile(
        join(output, 'coverage-final.json'),
        'prior Istanbul bytes'
      )
      const seen: unknown[] = []
      const result = await publishIstanbulCoverage({
        projectDir: root,
        facts: [fact],
        plan,
        expected: new Set(['entry']),
        signal,
        status,
        config: {
          provider: 'istanbul',
          formatterReports: true,
          reporter: ['json', 'html'],
          exclude: [],
          reportsDirectory: outputName,
          reportOnFailure: true,
          thresholds: { lines: 100, functions: 0, autoUpdate: true },
        },
        prepareOnly: true,
        onCoverageMap: async (map) => {
          seen.push(map)
          await Promise.resolve()
        },
      })
      expect(seen).toEqual([{ [fact.files[0].file]: fact.files[0].data }])
      expect(result).toEqual({ published: false, thresholdErrors: [] })
      expect(await readdir(output)).toEqual(['coverage-final.json'])
      expect(await readFile(join(output, 'coverage-final.json'), 'utf8')).toBe(
        'prior Istanbul bytes'
      )
    }
  )
  it('keeps real multi-entry Istanbul captures immutable across generation and report publication', async () => {
    const { runInNewContext } = await import('node:vm')
    const {
      instrumentJavaScript,
      remapIstanbulCoverage,
      mergeIstanbulCoverage,
    } = await import('next/dist/compiled/next-test-instrumentation')
    const { publishIstanbulCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-istanbul'
    )
    const file = join(root, 'prepare-merged.mjs')
    const source =
      'function choose(value) {\n  if (value) return 1\n  return 0\n}\nchoose(true)\n'
    await writeFile(file, source)
    const selected = {
      ...plan,
      sources: [{ file, sha256: coverageHash(source) }],
    }
    const code = instrumentJavaScript(source, file).code
    const rows: (typeof fact)[] = []
    for (const entryId of ['one', 'two']) {
      const context: any = {}
      runInNewContext(code, context)
      const data = (
        await remapIstanbulCoverage(
          structuredClone(context.__VITEST_COVERAGE__)
        )
      )[file]
      expect(Object.values(data.f)).toEqual([1])
      rows.push({
        ...fact,
        entryId,
        files: [{ file, sha256: coverageHash(source), data }],
      })
    }
    const before = structuredClone(rows)
    const expected = mergeIstanbulCoverage(
      structuredClone(
        rows.map((row) =>
          Object.fromEntries(row.files.map((file) => [file.file, file.data]))
        )
      )
    )
    expect(Object.values(expected[file].f)).toEqual([2])
    const options = {
      projectDir: root,
      facts: rows,
      plan: selected,
      expected: new Set(['one', 'two']),
      signal,
      status: 'passed' as const,
      config: {
        provider: 'istanbul' as const,
        formatterReports: true as const,
        reporter: ['json'] as 'json'[],
        exclude: [],
        reportsDirectory: 'prepare-merged',
        reportOnFailure: true,
        thresholds: {},
      },
    }
    const seen: unknown[] = []
    expect(
      await publishIstanbulCoverage({
        ...options,
        prepareOnly: true,
        onCoverageMap: (map) => {
          seen.push(map)
        },
      })
    ).toEqual({ published: false, thresholdErrors: [] })
    expect(seen).toEqual([expected])
    expect(rows).toEqual(before)
    expect((await publishIstanbulCoverage(options)).published).toBe(true)
    expect(
      JSON.parse(
        await readFile(
          join(root, 'prepare-merged', 'coverage-final.json'),
          'utf8'
        )
      )
    ).toEqual(JSON.parse(JSON.stringify(expected)))
    expect(rows).toEqual(before)
  })
  it('requires the explicit Istanbul prepare option and observer without bypassing real facts', async () => {
    const { publishIstanbulCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-istanbul'
    )
    const options = {
      projectDir: root,
      facts: [fact],
      plan,
      expected: new Set(['entry']),
      signal,
      status: 'passed' as const,
      config: {
        provider: 'istanbul' as const,
        formatterReports: true as const,
        reporter: ['json'] as 'json'[],
        exclude: [],
        reportsDirectory: 'prepare-invalid',
        reportOnFailure: true,
        thresholds: {},
      },
    }
    await expect(
      publishIstanbulCoverage({ ...options, prepareOnly: true })
    ).rejects.toThrow('actual map observer')
    const onCoverageMap = jest.fn()
    await expect(
      publishIstanbulCoverage({
        ...options,
        prepareOnly: false as any,
        onCoverageMap,
      })
    ).rejects.toThrow('explicit true option')
    await expect(
      publishIstanbulCoverage({
        ...options,
        facts: [],
        prepareOnly: true,
        onCoverageMap,
      })
    ).rejects.toThrow('omitted an expected completed entry')
    expect(onCoverageMap).not.toHaveBeenCalled()
  })
  it('retains exact Istanbul callback failures and cancellation during preparation', async () => {
    const { publishIstanbulCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-istanbul'
    )
    const failure = new Error('Istanbul preparation callback failed')
    const options = {
      projectDir: root,
      facts: [fact],
      plan,
      expected: new Set(['entry']),
      signal,
      prepareOnly: true as const,
      config: {
        provider: 'istanbul' as const,
        formatterReports: true as const,
        reporter: ['json'] as 'json'[],
        exclude: [],
        reportsDirectory: 'prepare-callback',
        reportOnFailure: true,
        thresholds: {},
      },
    }
    await expect(
      publishIstanbulCoverage({
        ...options,
        status: 'passed',
        onCoverageMap: async () => {
          await Promise.resolve()
          throw failure
        },
      })
    ).rejects.toBe(failure)
    const onCoverageMap = jest.fn()
    await expect(
      publishIstanbulCoverage({
        ...options,
        status: 'cancelled',
        onCoverageMap,
      })
    ).rejects.toThrow('Interrupted runs')
    expect(onCoverageMap).not.toHaveBeenCalled()
    await expect(
      readFile(join(root, 'prepare-callback', 'coverage-final.json'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('retains actual source-hash validation before Istanbul preparation', async () => {
    const { publishIstanbulCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-istanbul'
    )
    const file = fact.files[0].file
    const original = await readFile(file)
    const onCoverageMap = jest.fn()
    try {
      await writeFile(file, Buffer.concat([original, Buffer.from('\n')]))
      await expect(
        publishIstanbulCoverage({
          projectDir: root,
          facts: [fact],
          plan,
          expected: new Set(['entry']),
          signal,
          status: 'passed',
          prepareOnly: true,
          onCoverageMap,
          config: {
            provider: 'istanbul',
            formatterReports: true as const,
            reporter: ['json'],
            exclude: [],
            reportsDirectory: 'prepare-stale',
            reportOnFailure: true,
            thresholds: {},
          },
        })
      ).rejects.toThrow('changed or is invalid')
      expect(onCoverageMap).not.toHaveBeenCalled()
    } finally {
      await writeFile(file, original)
    }
  })
  it('observes a genuine empty Istanbul map while preparing without creating output', async () => {
    const { publishIstanbulCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-istanbul'
    )
    const seen: unknown[] = []
    const result = await publishIstanbulCoverage({
      projectDir: root,
      facts: [{ ...fact, files: [] }],
      plan: { ...plan, sources: [] },
      expected: new Set(['entry']),
      signal,
      status: 'passed',
      prepareOnly: true,
      onCoverageMap: (map) => {
        seen.push(map)
      },
      config: {
        provider: 'istanbul',
        formatterReports: true as const,
        reporter: ['none'],
        exclude: [],
        reportsDirectory: 'prepare-empty',
        reportOnFailure: true,
        thresholds: {},
      },
    })
    expect(seen).toEqual([{}])
    expect(result).toEqual({ published: false, thresholdErrors: [] })
    await expect(
      readFile(join(root, 'prepare-empty', 'coverage-final.json'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('preserves the Istanbul no-observer failure short circuit without reading invalid facts', async () => {
    const { publishIstanbulCoverage } = await import(
      'next/dist/experimental/testing/coverage/report-istanbul'
    )
    expect(
      await publishIstanbulCoverage({
        projectDir: '/missing-istanbul-project',
        facts: [],
        plan,
        expected: new Set(['entry']),
        signal,
        config: {
          provider: 'istanbul',
          formatterReports: true,
          exclude: [],
          reporter: ['json'],
          reportsDirectory: 'coverage',
          reportOnFailure: false,
          thresholds: {},
        },
        status: 'failed',
      })
    ).toEqual({ published: false, thresholdErrors: [] })
  })
  it.each([
    'numeric-position',
    'unknown-coordinate',
    'negative-count',
    'counter-key',
    'branch-length',
    'source-hash',
    'revision',
    'missing-file',
    'duplicate-entry',
  ])('rejects changed actual mapped facts: %s', async (mutation) => {
    const rows = structuredClone([fact]) as any[]
    const file = rows[0].files[0],
      data = file.data
    if (mutation === 'numeric-position') data.statementMap['0'].start.column++
    if (mutation === 'unknown-coordinate')
      data.branchMap['0'].locations[1].start.unknown = 1
    if (mutation === 'negative-count') data.s['0'] = -1
    if (mutation === 'counter-key') data.f.extra = 0
    if (mutation === 'branch-length') data.b['0'].push(0)
    if (mutation === 'source-hash') file.sha256 = '0'.repeat(64)
    if (mutation === 'revision') rows[0].revision = 'foreign'
    if (mutation === 'missing-file') rows[0].files = []
    if (mutation === 'duplicate-entry') rows.push(structuredClone(rows[0]))
    await expect(validate(rows)).rejects.toThrow()
  })
})

describe('public Istanbul CommonJS sources', () => {
  it.each([
    "require('./dependency.cjs')",
    "module.require('./dependency.cjs')",
    "module['require']('./dependency.cjs')",
  ])(
    'retains the measured unimplemented CommonJS edge bound for %s',
    async (expression) => {
      const { assertIstanbulCjsSource } = await import(
        'next/dist/experimental/testing/coverage/istanbul-cjs'
      )
      expect(() =>
        assertIstanbulCjsSource(
          'exports.value = ' + expression,
          '/project/subject.cjs'
        )
      ).toThrow('CommonJS require dependency coverage is not implemented')
    }
  )
  it('distinguishes real CommonJS calls from exported names and string contents', async () => {
    const { assertIstanbulCjsSource } = await import(
      'next/dist/experimental/testing/coverage/istanbul-cjs'
    )
    expect(() =>
      assertIstanbulCjsSource(
        `exports.require = "require('./unused.cjs')"`,
        '/project/subject.cjs'
      )
    ).not.toThrow()
    expect(() =>
      assertIstanbulCjsSource(
        `export const value = require('./unused.cjs')`,
        '/project/subject.mjs'
      )
    ).not.toThrow()
  })
  const pristine = require('./fixtures/istanbul-provider/cjs-pristine.json')
  it.each(
    pristine.rows.filter(
      (row) => !Object.hasOwn(pristine.unqualifiedProfiles, row.name)
    )
  )(
    'matches actual complete CommonJS reports for $name',
    async (row) => {
      const { execFileSync } = await import('node:child_process')
      const output = await mkdtemp(join(tmpdir(), 'next-istanbul-cjs-'))
      try {
        execFileSync(
          process.execPath,
          [
            join(__dirname, 'istanbul-cjs-reports.mjs'),
            join(__dirname, '../../..'),
            output,
            row.name,
            '--source',
          ],
          {
            encoding: 'utf8',
            timeout: 125000,
            env: { ...process.env, TURBO_TASKS_AVAILABLE_PARALLELISM: '4' },
          }
        )
        expect(
          JSON.parse(await readFile(join(output, 'CHECKS.json'), 'utf8'))
        ).toMatchObject({
          actualPublicCLI: true,
          wholeCaseProjection: true,
          completeMapsSummaryLCOV: true,
          allOwnersJoined: true,
        })
        expect(
          JSON.parse(await readFile(join(output, 'CLOSED.json'), 'utf8'))
        ).toEqual({ fixtureRetired: true })
      } finally {
        if (process.env.NEXT_TESTING_ISTANBUL_CJS_EVIDENCE) {
          const { cp } = await import('fs/promises')
          await cp(
            output,
            join(process.env.NEXT_TESTING_ISTANBUL_CJS_EVIDENCE, row.name),
            { recursive: true }
          )
        }
        await rm(output, { recursive: true, force: true })
      }
    },
    130000
  )
})

describe('public Istanbul JavaScript coverage', () => {
  const pristine = require('./fixtures/istanbul-provider/public-pristine.json')
  it.each(
    pristine.rows
      .filter((row) => !Object.hasOwn(pristine.unqualifiedProfiles, row.name))
      .map((row) => row.name)
  )(
    'matches the complete genuine reports and cases for %s',
    async (profile) => {
      const { execFileSync } = await import('node:child_process')
      const output = await mkdtemp(join(tmpdir(), 'next-public-istanbul-'))
      try {
        execFileSync(
          process.execPath,
          [
            join(__dirname, 'istanbul-public-reports.mjs'),
            join(__dirname, '../../..'),
            output,
            profile,
            '--source',
          ],
          {
            encoding: 'utf8',
            timeout: 125000,
            env: { ...process.env, TURBO_TASKS_AVAILABLE_PARALLELISM: '4' },
          }
        )
        expect(
          JSON.parse(await readFile(join(output, 'CHECKS.json'), 'utf8'))
        ).toMatchObject({
          profile,
          actualPublicCLI: true,
          completeCaseProjection: true,
          wholeMapsSummaryLCOVAndReportAssets: true,
          actualThresholdsAndConfigBytes: true,
          ownedProcessTreeClosed: true,
        })
      } finally {
        await rm(output, { recursive: true, force: true })
      }
    },
    130000
  )
})

describe('public Istanbul file workers', () => {
  it.each(['default', 'two-workers'])(
    'matches actual whole reports and worker ownership for %s',
    async (profile) => {
      const { execFileSync } = await import('node:child_process')
      const output = await mkdtemp(join(tmpdir(), 'next-istanbul-workers-'))
      try {
        execFileSync(
          process.execPath,
          [
            join(__dirname, 'istanbul-worker-reports.mjs'),
            join(__dirname, '../../..'),
            output,
            profile,
            '--source',
          ],
          {
            encoding: 'utf8',
            timeout: 125000,
            env: { ...process.env, TURBO_TASKS_AVAILABLE_PARALLELISM: '4' },
          }
        )
        expect(
          JSON.parse(await readFile(join(output, 'CHECKS.json'), 'utf8'))
        ).toEqual({
          profile,
          completeCasesAndReports: true,
          actualParallelBarrier: profile === 'two-workers',
          defaultConfigurationReportEquality: true,
          allOwnersClosed: true,
        })
      } finally {
        await rm(output, { recursive: true, force: true })
      }
    },
    130000
  )
})

describe('Istanbul loaded-source metadata', () => {
  const profile = {
    id: 'loaded',
    mode: 'development',
    environment: 'node',
    runtime: 'nodejs',
    bundler: 'turbopack',
  } as const
  it('plans candidates without parsing untouched malformed JavaScript and preserves explicit empty selection', async () => {
    const root = await realpath(
      await mkdtemp(join(tmpdir(), 'next-istanbul-candidates-'))
    )
    try {
      await writeFile(join(root, 'untouched.mjs'), 'export const broken =\n')
      await writeFile(join(root, 'subject.mjs'), 'export const value = 1\n')
      const { createIstanbulSourcePlan } = await import(
        'next/dist/experimental/testing/coverage/istanbul-instrumentation'
      )
      const config = {
        provider: 'istanbul' as const,
        reporter: ['json'] as const,
        exclude: [],
        reportsDirectory: 'coverage',
        reportOnFailure: false,
        thresholds: {},
      }
      const plan = await createIstanbulSourcePlan({
        projectDir: root,
        profile,
        config: { ...config, reporter: ['json'] },
        excludedFiles: [],
        signal: new AbortController().signal,
      })
      expect(plan.importedOnly).toBe(true)
      expect(plan.sources.map((source) => basename(source.file))).toEqual([
        'subject.mjs',
        'untouched.mjs',
      ])
      const empty = await createIstanbulSourcePlan({
        projectDir: root,
        profile,
        config: { ...config, reporter: ['json'], include: [] },
        excludedFiles: [],
        signal: new AbortController().signal,
      })
      expect(empty).not.toHaveProperty('importedOnly')
      expect(empty.sources).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
  it('seals each emitted source closure independently of later loader requests', async () => {
    const root = await realpath(
      await mkdtemp(join(tmpdir(), 'next-istanbul-loaded-maps-'))
    )
    let service:
      | Awaited<
          ReturnType<
            typeof import('next/dist/experimental/testing/coverage/istanbul-instrumentation').openIstanbulInstrumentation
          >
        >
      | undefined
    try {
      const first = join(root, 'first.mjs'),
        second = join(root, 'second.mjs'),
        broken = join(root, 'untouched.mjs')
      const source = (name: string) => `export function ${name}(){ return 1 }\n`
      await writeFile(first, source('first'))
      await writeFile(second, source('second'))
      await writeFile(broken, 'export const invalid =\n')
      const { createIstanbulSourcePlan, openIstanbulInstrumentation } =
        await import(
          'next/dist/experimental/testing/coverage/istanbul-instrumentation'
        )
      const { requestCompilerTransform } = await import(
        'next/dist/experimental/testing/compiler/transform-broker'
      )
      const signal = new AbortController().signal
      const plan = await createIstanbulSourcePlan({
        projectDir: root,
        profile,
        config: {
          provider: 'istanbul',
          reporter: ['json'],
          exclude: [],
          reportsDirectory: 'coverage',
          reportOnFailure: false,
          thresholds: {},
        },
        excludedFiles: [],
        signal,
      })
      service = await openIstanbulInstrumentation({
        projectDir: root,
        plan,
        signal,
        selectSource: (file) => file.startsWith(root + '/'),
      })
      expect(service.descriptor.metadata).toEqual({
        version: 1,
        importedOnly: true,
        sources: [],
      })
      expect(() => service!.readMetadata!([first])).toThrow(
        'loader observation'
      )
      await requestCompilerTransform(service.descriptor.transport, {
        file: first,
        query: '',
        moduleType: 'js',
        code: source('first'),
      })
      const snapshot = service.readMetadata!([first])
      expect(snapshot.sources.map((entry) => entry.file)).toEqual([first])
      const before = structuredClone(snapshot)
      await requestCompilerTransform(service.descriptor.transport, {
        file: second,
        query: '',
        moduleType: 'js',
        code: source('second'),
      })
      expect(snapshot).toEqual(before)
      expect(
        service.readMetadata!([second]).sources.map((entry) => entry.file)
      ).toEqual([second])
      expect(service.readMetadata!([first])).toEqual(before)
      snapshot.sources[0].initial.s['0'] = 999
      expect(service.readMetadata!([first])).toEqual(before)
      expect(service.descriptor.metadata.sources).toEqual([])
      expect(() =>
        service!.readMetadata!([join(root, 'unsupported.ts')])
      ).toThrow('not implemented')
    } finally {
      await service?.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
  it('validates only actual loaded maps while retaining the untouched malformed candidate hash', async () => {
    const root = await realpath(
      await mkdtemp(join(tmpdir(), 'next-istanbul-loaded-facts-'))
    )
    try {
      const file = join(root, 'subject.mjs'),
        broken = join(root, 'untouched.mjs'),
        source = 'export const value = 1\n',
        invalid = 'export const invalid =\n'
      await writeFile(file, source)
      await writeFile(broken, invalid)
      const { instrumentJavaScript, remapIstanbulCoverage } = await import(
        'next/dist/compiled/next-test-instrumentation'
      )
      const data = (
        await remapIstanbulCoverage({
          [file]: instrumentJavaScript(source, file).initial,
        })
      )[file]
      const plan = {
        version: 1 as const,
        importedOnly: true as const,
        profile,
        sources: [
          { file, sha256: coverageHash(source) },
          { file: broken, sha256: coverageHash(invalid) },
        ],
      }
      const fact = {
        version: 1 as const,
        provider: 'istanbul' as const,
        entryId: 'entry',
        revision: 'revision',
        complete: true,
        errors: [],
        files: [{ file, sha256: coverageHash(source), data }],
      }
      const { assertIstanbulCoverageFacts } = await import(
        'next/dist/experimental/testing/coverage/report-istanbul'
      )
      const options = {
        projectDir: root,
        plan,
        expected: new Set(['entry']),
        signal: new AbortController().signal,
      }
      expect(
        await assertIstanbulCoverageFacts({ ...options, facts: [fact] })
      ).toEqual([fact])
      await writeFile(broken, 'export const changed =\n')
      await expect(
        assertIstanbulCoverageFacts({ ...options, facts: [fact] })
      ).rejects.toThrow('changed')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
  it('requires its exact private local metadata reader and rejects an unsolicited reader', async () => {
    const { createTestCompilerSession } = await import(
      'next/dist/experimental/testing/compiler'
    )
    const descriptor = {
      version: 1,
      profile,
      transport: {},
      metadata: { version: 1, importedOnly: true, sources: [] },
    } as any
    await expect(
      createTestCompilerSession(join(__dirname, '../../..'), profile, {
        istanbulInstrumentation: descriptor,
      })
    ).rejects.toThrow('explicit local metadata reader')
    await expect(
      createTestCompilerSession(join(__dirname, '../../..'), profile, {
        readIstanbulInstrumentation: () => ({ version: 1, sources: [] }),
      })
    ).rejects.toThrow('explicit local metadata reader')
  })
})

describe('public Istanbul loaded sources', () => {
  const pristine = require('./fixtures/istanbul-provider/loaded-pristine.json')
  it.each(
    pristine.rows
      .filter((row) => !Object.hasOwn(pristine.unqualifiedProfiles, row.name))
      .map((row) => row.name)
  )(
    'matches actual loaded-source reports for %s',
    async (profile) => {
      const { execFileSync } = await import('node:child_process')
      const output = await mkdtemp(join(tmpdir(), 'next-istanbul-loaded-'))
      try {
        execFileSync(
          process.execPath,
          [
            join(__dirname, 'istanbul-loaded-reports.mjs'),
            join(__dirname, '../../..'),
            output,
            profile,
            '--source',
          ],
          {
            encoding: 'utf8',
            timeout: 125000,
            env: { ...process.env, TURBO_TASKS_AVAILABLE_PARALLELISM: '4' },
          }
        )
        expect(
          JSON.parse(await readFile(join(output, 'CHECKS.json'), 'utf8'))
        ).toEqual({
          profile,
          completeCasesAndReports: true,
          actualLoadedSourcesOnly: true,
          actualParallelBarrier: profile === 'two-worker-loaded-only',
          defaultConfigurationReportEquality: true,
          allOwnersClosed: true,
        })
      } finally {
        await rm(output, { recursive: true, force: true })
      }
    },
    130000
  )
})

describe('owned configuration readiness before prepared coverage', () => {
  it('retains a real ready realm until disposal and rejects the closed owner', async () => {
    const { openTestConfigModule } = await import(
      'next/dist/experimental/testing/config-modules'
    )
    const root = await mkdtemp(join(tmpdir(), 'next-coverage-ready-realm-'))
    let realm: Awaited<ReturnType<typeof openTestConfigModule>> | undefined
    try {
      realm = await openTestConfigModule(undefined, root)
      expect(() => realm!.assertReadyForCoverage()).not.toThrow()
      await realm.dispose()
      expect(() => realm!.assertReadyForCoverage()).toThrow(
        'unavailable for coverage'
      )
    } finally {
      await realm?.dispose()
      await rm(root, { recursive: true, force: true })
    }
  }, 30000)

  it('preserves a real early config-child failure before map preparation', async () => {
    const { openTestConfigModule } = await import(
      'next/dist/experimental/testing/config-modules'
    )
    const { retry } = await import('next-test-utils')
    const root = await mkdtemp(join(tmpdir(), 'next-coverage-dead-realm-'))
    const config = join(root, 'vitest.config.mjs')
    let realm: Awaited<ReturnType<typeof openTestConfigModule>> | undefined
    try {
      await writeFile(config, 'export default {pid:process.pid}\n')
      realm = await openTestConfigModule(config, root)
      const pid = (realm.value as { pid: number }).pid
      expect(Number.isSafeInteger(pid)).toBe(true)
      process.kill(pid, 'SIGTERM')
      await retry(async () => {
        expect(() => realm!.assertReadyForCoverage()).toThrow(
          'Test configuration session ended unexpectedly'
        )
      })
      let failure: unknown
      try {
        realm.assertReadyForCoverage()
      } catch (error) {
        failure = error
      }
      await expect(realm.dispose()).rejects.toBe(failure)
      expect(() => process.kill(pid, 0)).toThrow()
    } finally {
      await realm?.dispose().catch(() => {})
      await rm(root, { recursive: true, force: true })
    }
  }, 30000)

  it('keeps an actual transform-host exit and closed broker as coverage failures', async () => {
    const { openTestConfigModule } = await import(
      'next/dist/experimental/testing/config-modules'
    )
    const { requestCompilerTransform } = await import(
      'next/dist/experimental/testing/compiler/transform-broker'
    )
    const { retry } = await import('next-test-utils')
    const root = await mkdtemp(join(tmpdir(), 'next-coverage-dead-transform-'))
    const config = join(root, 'vitest.config.mjs')
    let realm: Awaited<ReturnType<typeof openTestConfigModule>> | undefined
    try {
      await writeFile(
        config,
        "export default {test:{},plugins:[{name:'owned-transform-exit',transform(){process.exit(2)}}]}\n"
      )
      const setup = join(root, 'setup.mjs')
      await writeFile(
        setup,
        "export default function(project){project.provide('ownerPid',process.pid)}\n"
      )
      realm = await openTestConfigModule(config, root)
      const provided = await realm.setup([
        { name: 'control', globalSetup: [setup], provide: {} },
      ])
      const pid = provided.control.ownerPid as number
      expect(Number.isSafeInteger(pid)).toBe(true)
      expect(realm.compilerTransform).toBeDefined()
      await expect(
        requestCompilerTransform(realm.compilerTransform!, {
          file: join(root, 'subject.mjs'),
          code: 'export const value = 1',
          query: '',
          moduleType: 'js',
        })
      ).rejects.toThrow()
      await retry(async () => {
        expect(() => realm!.assertReadyForCoverage()).toThrow()
      })
      await expect(realm.dispose()).rejects.toThrow()
      expect(() => process.kill(pid, 0)).toThrow()
      await expect(
        requestCompilerTransform(realm.compilerTransform!, {
          file: join(root, 'subject.mjs'),
          code: 'export const value = 1',
          query: '',
          moduleType: 'js',
        })
      ).rejects.toThrow()
    } finally {
      await realm?.dispose().catch(() => {})
      await rm(root, { recursive: true, force: true })
    }
  }, 30000)
})

describe('prepared JSON coverage maps', () => {
  const pristine = require('./fixtures/istanbul-provider/json-map-pristine.json')
  it.each(pristine.rows.map((row: { name: string }) => row.name))(
    'includes the actual complete prepared coverage map for %s',
    async (profile: string) => {
      const { execFileSync } = await import('node:child_process')
      const output = await mkdtemp(join(tmpdir(), 'next-json-coverage-map-'))
      try {
        execFileSync(
          process.execPath,
          [
            join(__dirname, 'json-coverage-map-reports.mjs'),
            join(__dirname, '../../..'),
            output,
            profile,
            '--source',
          ],
          {
            encoding: 'utf8',
            timeout: 125000,
            env: { ...process.env, TURBO_TASKS_AVAILABLE_PARALLELISM: '4' },
          }
        )
        expect(
          JSON.parse(
            await readFile(join(output, 'JSON-MAP-CHECKS.json'), 'utf8')
          )
        ).toMatchObject({
          profile,
          actualPublicCLI: true,
          completePreparedMapMatchesGenuine: true,
          preservedCaseAndCoverageAssetChecks: true,
          originalOwnedProcessChecksPassed: true,
        })
      } finally {
        if (process.env.NEXT_TESTING_JSON_MAP_EVIDENCE) {
          const { cp } = await import('node:fs/promises')
          await cp(
            output,
            join(process.env.NEXT_TESTING_JSON_MAP_EVIDENCE, profile),
            { recursive: true }
          )
        }
        await rm(output, { recursive: true, force: true })
      }
    },
    130000
  )
})

describe('coverage publication before authored global teardown', () => {
  const pristine = require('./fixtures/istanbul-provider/global-teardown-pristine.json')
  it.each(pristine.rows.map((row: { profile: string }) => row.profile))(
    'matches complete genuine coverage and teardown outcomes for %s',
    async (profile: string) => {
      const { execFileSync } = await import('node:child_process')
      const output = await mkdtemp(
        join(tmpdir(), 'next-global-coverage-order-')
      )
      try {
        execFileSync(
          process.execPath,
          [
            join(__dirname, 'global-teardown-coverage-reports.mjs'),
            join(__dirname, '../../..'),
            output,
            profile,
            '--source',
          ],
          { encoding: 'utf8', timeout: 125000 }
        )
        expect(
          JSON.parse(await readFile(join(output, 'CHECKS.json'), 'utf8'))
        ).toMatchObject({
          profile,
          genuineObservationsAndPublicationOrder: true,
          wholeJSONWithCompleteMap: true,
          authoredBytesHeld: true,
          ownedProcessTreeClosed: true,
        })
      } finally {
        if (process.env.NEXT_TESTING_GLOBAL_COVERAGE_EVIDENCE) {
          const { cp } = await import('node:fs/promises')
          await cp(
            output,
            join(process.env.NEXT_TESTING_GLOBAL_COVERAGE_EVIDENCE, profile),
            { recursive: true }
          )
        }
        await rm(output, { recursive: true, force: true })
      }
    },
    130000
  )
})

describe('real configuration failure vetoes coverage publication', () => {
  it.each(['configuration'] as const)(
    'retains previous JSON and coverage after actual %s owner loss',
    async (profile) => {
      const { execFileSync } = await import('node:child_process')
      const output = await mkdtemp(join(tmpdir(), 'next-coverage-owner-loss-'))
      try {
        execFileSync(
          process.execPath,
          [
            join(__dirname, 'configuration-loss-coverage.mjs'),
            join(__dirname, '../../..'),
            output,
            profile,
            '--source',
          ],
          { encoding: 'utf8', timeout: 125000 }
        )
        expect(
          JSON.parse(await readFile(join(output, 'CHECKS.json'), 'utf8'))
        ).toMatchObject({
          profile,
          actualPassingBodyCompleted: true,
          actualConfigurationFailureRetained: true,
          priorJSONAndCoverageBytesHeld: true,
          authoredBytesHeld: true,
          ownedProcessTreeClosed: true,
        })
      } finally {
        if (process.env.NEXT_TESTING_CONFIGURATION_LOSS_EVIDENCE) {
          const { cp } = await import('node:fs/promises')
          await cp(
            output,
            join(process.env.NEXT_TESTING_CONFIGURATION_LOSS_EVIDENCE, profile),
            { recursive: true }
          )
        }
        await rm(output, { recursive: true, force: true })
      }
    },
    130000
  )
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

describe('settled Istanbul assertion and file-fixture continuation', () => {
  it.each([
    'fixture-only',
    'scope-before-run',
    'scope-fulfilled',
    'scope-pending',
    'scope-foreign',
    'scope-foreign-return',
    'scope-mixed-same-error',
  ])(
    'verifies actual compiled %s without changing native error behavior',
    async (scenario) => {
      const { execFileSync } = await import('node:child_process')
      const output = await mkdtemp(join(tmpdir(), 'next-istanbul-settled-'))
      try {
        execFileSync(
          process.execPath,
          [
            join(__dirname, 'istanbul-afterall-finalization.cjs'),
            'supervise',
            join(__dirname, '../../..'),
            output,
            scenario,
          ],
          {
            env: { ...process.env, TURBO_TASKS_AVAILABLE_PARALLELISM: '4' },
            stdio: 'pipe',
            timeout: 125000,
          }
        )
        const observed = JSON.parse(
          await readFile(join(output, 'OBSERVED.json'), 'utf8')
        )
        expect(observed.results[2].status).toBe('failed')
        expect(observed.captures).toHaveLength(
          scenario === 'scope-foreign' || scenario === 'scope-mixed-same-error'
            ? 2
            : 3
        )
      } finally {
        await rm(output, { recursive: true, force: true })
      }
    },
    125000
  )
  it.each(['scope-finalization', 'disposal', 'fixture-only'])(
    'publishes exact reports while the public %s file and run stay failed',
    async (scenario) => {
      const { execFileSync } = await import('node:child_process')
      const output = await mkdtemp(
        join(tmpdir(), 'next-istanbul-settled-public-')
      )
      try {
        execFileSync(
          process.execPath,
          [
            join(__dirname, 'istanbul-afterall-finalization.cjs'),
            'supervise',
            join(__dirname, '../../..'),
            output,
            scenario,
            'source-public',
          ],
          {
            env: { ...process.env, TURBO_TASKS_AVAILABLE_PARALLELISM: '4' },
            stdio: 'pipe',
            timeout: 125000,
          }
        )
        const report = JSON.parse(
          await readFile(join(output, 'cases.json'), 'utf8')
        )
        expect(report.numPassedTests).toBe(3)
        expect(report.numFailedTestSuites).toBe(1)
        expect(report.success).toBe(false)
      } finally {
        await rm(output, { recursive: true, force: true })
      }
    },
    125000
  )
})

describe('actual Istanbul native setup and serializer source roles', () => {
  let owned: string[] = []
  afterEach(async () => {
    await Promise.all(
      owned.splice(0).map((root) => rm(root, { recursive: true, force: true }))
    )
  })
  async function fixture() {
    const { mkdir } = await import('fs/promises')
    const root = await realpath(
      await mkdtemp(join(tmpdir(), 'next-istanbul-harness-'))
    )
    owned.push(root)
    const actual = require('./fixtures/istanbul-provider/native-harness-s28.json')
    const native = structuredClone(actual.actualSidecar)
    const before = pathToFileURL(actual.actualProject + '/').href
    const after = pathToFileURL(root + '/').href
    for (const source of native.sources) {
      source.source = source.source.replace(before, after)
      if (source.setup) source.setup = source.setup.replace(before, after)
    }
    const entryPath = native.entryPath
    const nativePath = entryPath.replace(/\.js$/, '.harness-coverage.json')
    await mkdir(join(root, 'server/next-test'), { recursive: true })
    await writeFile(join(root, 'setup.mjs'), 'export const setup = true\n')
    await writeFile(
      join(root, 'suite.test.mjs'),
      '// actual fixture ownership only\n'
    )
    await writeFile(join(root, nativePath), JSON.stringify(native))
    await writeFile(join(root, entryPath), 'void 0;\n')
    const { fileURLToPath } = await import('url')
    await writeFile(
      join(root, entryPath + '.map'),
      JSON.stringify(
        makeMap(fileURLToPath(native.sources[0].source), native.sources[0].code)
      )
    )
    const files = [entryPath, entryPath + '.map', nativePath]
    const options = {
      entryPath,
      files,
      projectDir: root,
      setupFiles: [join(root, 'setup.mjs')],
      snapshotSerializers: ['./serializer.mjs'],
      signal: new AbortController().signal,
      readArtifact: (file: string) => readFile(join(root, file)),
    }
    const { readIstanbulHarnessCoverage } = await import(
      'next/dist/experimental/testing/coverage/istanbul-harness'
    )
    const harness = await readIstanbulHarnessCoverage(options)
    const metadataOptions = {
      rootDir: root,
      files,
      projectDir: root,
      sourceRootDir: root,
      entryFile: join(root, 'suite.test.mjs'),
      setupFiles: options.setupFiles,
    }
    return {
      root,
      native,
      nativePath,
      options,
      harness,
      metadataOptions,
      readIstanbulHarnessCoverage,
    }
  }
  it('binds the actual entry, configured requests and original factory code without mock roles', async () => {
    const f = await fixture()
    expect(f.harness?.sources.map((source) => source.source)).toEqual(
      f.native.sources.map((source) => source.source)
    )
    expect(f.harness?.sources.map((source) => source.sha256)).toEqual(
      f.native.sources.map((source) => coverageHash(source.code))
    )
    const metadata = await buildCoverageMetadata({
      ...f.metadataOptions,
      istanbulHarness: f.harness,
    })
    expect(metadata.sources[f.native.sources[0].source]).toBeNull()
    expect(metadata.istanbulHarness).toEqual(f.harness)
    expect('syntheticSources' in metadata).toBe(false)
    await expect(buildCoverageMetadata(f.metadataOptions)).rejects.toThrow(
      /ENOENT/
    )
  })
  it('keeps zero-wrapper absence exact and does not read unrequested metadata', async () => {
    const f = await fixture(),
      readArtifact = jest.fn(f.options.readArtifact)
    await expect(
      f.readIstanbulHarnessCoverage({
        ...f.options,
        files: [],
        setupFiles: [],
        snapshotSerializers: [],
        readArtifact,
      })
    ).resolves.toBeUndefined()
    expect(readArtifact).not.toHaveBeenCalled()
    await expect(
      f.readIstanbulHarnessCoverage({
        ...f.options,
        setupFiles: [],
        snapshotSerializers: [],
      })
    ).rejects.toThrow('native Istanbul harness')
    await expect(
      f.readIstanbulHarnessCoverage({ ...f.options, files: [] })
    ).rejects.toThrow('native Istanbul harness')
  })
  it.each([
    'version',
    'kind',
    'entry',
    'missing setup',
    'duplicate source',
    'foreign setup',
    'foreign serializer',
    'extra serializer',
    'unknown role',
    'code',
    'outside project',
    'unknown field',
  ])(
    'rejects a changed actual native %s record before returning an exclusion',
    async (kind) => {
      const f = await fixture(),
        native = structuredClone(f.native),
        setup = native.sources.find((source) => source.kind === 'setup'),
        serializer = native.sources.find(
          (source) => source.kind === 'snapshot-serializers'
        )
      if (kind === 'version') native.version = 2
      if (kind === 'kind') native.kind = 'mock-coverage'
      if (kind === 'entry') native.entryPath = 'server/next-test/other.js'
      if (kind === 'missing setup')
        native.sources = native.sources.filter((source) => source !== setup)
      if (kind === 'duplicate source')
        native.sources.push({ ...native.sources[0] })
      if (kind === 'foreign setup')
        setup.setup = pathToFileURL(join(f.root, 'other-setup.mjs')).href
      if (kind === 'foreign serializer')
        serializer.serializers = ['./other-serializer.mjs']
      if (kind === 'extra serializer')
        serializer.serializers.push('./other-serializer.mjs')
      if (kind === 'unknown role') setup.kind = 'unknown'
      if (kind === 'code') delete setup.code
      if (kind === 'outside project')
        setup.source = pathToFileURL(join(f.root, '../outside.mjs')).href
      if (kind === 'unknown field') native.extra = true
      await writeFile(join(f.root, f.nativePath), JSON.stringify(native))
      await expect(f.readIstanbulHarnessCoverage(f.options)).rejects.toThrow(
        'native Istanbul harness'
      )
    }
  )
  it('binds original serializer request order using an actual two-request factory', async () => {
    const f = await fixture()
    const actual = require('./fixtures/istanbul-provider/native-harness-pair-s28.json')
    const native = structuredClone(actual.actualSidecar)
    const before = pathToFileURL(actual.actualProject + '/').href
    const after = pathToFileURL(f.root + '/').href
    native.sources[0].source = native.sources[0].source.replace(before, after)
    const nativePath = native.entryPath.replace(
      /\.js$/,
      '.harness-coverage.json'
    )
    await writeFile(join(f.root, nativePath), JSON.stringify(native))
    const options = {
      ...f.options,
      entryPath: native.entryPath,
      files: [nativePath],
      setupFiles: [],
      snapshotSerializers: [...native.sources[0].serializers],
    }
    const proof = await f.readIstanbulHarnessCoverage(options)
    expect(proof?.sources).toEqual([
      {
        source: native.sources[0].source,
        sha256: coverageHash(native.sources[0].code),
      },
    ])
    await expect(
      f.readIstanbulHarnessCoverage({
        ...options,
        snapshotSerializers: [...options.snapshotSerializers].reverse(),
      })
    ).rejects.toThrow('native Istanbul harness')
    native.sources[0].serializers.reverse()
    await writeFile(join(f.root, nativePath), JSON.stringify(native))
    await expect(f.readIstanbulHarnessCoverage(options)).rejects.toThrow(
      'native Istanbul harness'
    )
  })
  it('keeps unknown map identities, changed map content and cross-role collisions strict', async () => {
    const f = await fixture(),
      source = f.native.sources[0],
      { fileURLToPath } = await import('url')
    await writeFile(
      join(f.root, f.options.entryPath + '.map'),
      JSON.stringify(makeMap(fileURLToPath(source.source), source.code + '\n'))
    )
    await expect(
      buildCoverageMetadata({
        ...f.metadataOptions,
        istanbulHarness: f.harness,
      })
    ).rejects.toThrow('harness source mismatch')
    await writeFile(
      join(f.root, f.options.entryPath + '.map'),
      JSON.stringify(
        makeMap(join(f.root, 'unknown-generated.mjs'), source.code)
      )
    )
    await expect(
      buildCoverageMetadata({
        ...f.metadataOptions,
        istanbulHarness: f.harness,
      })
    ).rejects.toThrow(/ENOENT/)
    await expect(
      buildCoverageMetadata({
        ...f.metadataOptions,
        istanbulHarness: f.harness,
        syntheticSources: { version: 1, sources: f.harness!.sources },
      })
    ).rejects.toThrow('Conflicting generated coverage source roles')
  })
  it('re-reads the sidecar and requests before remapping and preserves actual counters on failure', async () => {
    const f = await fixture(),
      metadata = await buildCoverageMetadata({
        ...f.metadataOptions,
        istanbulHarness: f.harness,
      })
    const artifact = {
      version: 2,
      kind: 'node',
      entryId: 'harness-entry',
      revision: 'harness-revision',
      profile,
      rootDir: f.root,
      entryPath: f.options.entryPath,
      files: f.options.files,
      sourceHash: coverageHash('entry'),
      setupFiles: f.options.setupFiles,
      snapshotSerializers: f.options.snapshotSerializers,
      diagnostics: [],
      coverage: { ...metadata, istanbul: { version: 1, sources: [] } },
    } as CompiledTestArtifact
    const { remapIstanbulCapture } = await import(
      'next/dist/experimental/testing/coverage/istanbul-capture'
    )
    const capture = {
        version: 1 as const,
        kind: 'node-istanbul' as const,
        files: {},
      },
      before = JSON.stringify(capture)
    await expect(
      remapIstanbulCapture(artifact, capture, f.root, f.options.signal)
    ).resolves.toMatchObject({ files: [] })
    await expect(
      remapIstanbulCapture(
        { ...artifact, snapshotSerializers: ['./other.mjs'] },
        capture,
        f.root,
        f.options.signal
      )
    ).rejects.toThrow('native Istanbul harness')
    f.native.sources[0].code += '\n'
    await writeFile(join(f.root, f.nativePath), JSON.stringify(f.native))
    await expect(
      remapIstanbulCapture(artifact, capture, f.root, f.options.signal)
    ).rejects.toThrow('harness metadata or requests changed')
    expect(JSON.stringify(capture)).toBe(before)
  })
  it('observes cancellation before any role read and after the actual read joins', async () => {
    const f = await fixture(),
      first = new AbortController(),
      error = new Error('owned harness cancellation'),
      readArtifact = jest.fn(f.options.readArtifact)
    first.abort(error)
    await expect(
      f.readIstanbulHarnessCoverage({
        ...f.options,
        signal: first.signal,
        readArtifact,
      })
    ).rejects.toBe(error)
    expect(readArtifact).not.toHaveBeenCalled()
    const later = new AbortController()
    await expect(
      f.readIstanbulHarnessCoverage({
        ...f.options,
        signal: later.signal,
        readArtifact: async (path) => {
          const value = await f.options.readArtifact(path)
          later.abort(error)
          return value
        },
      })
    ).rejects.toBe(error)
  })
})

describe('public Istanbul setup and snapshot serializers', () => {
  it.each([
    'combined',
    'combined-case-failure',
    'serializer-explicit',
    'serializer-imported',
    'setup-explicit',
    'setup-imported',
  ])(
    'matches unchanged genuine complete reports, cases and snapshots for %s',
    async (profile) => {
      const { execFileSync } = await import('node:child_process')
      const output = await mkdtemp(
        join(tmpdir(), 'next-istanbul-setup-public-')
      )
      try {
        execFileSync(
          process.execPath,
          [
            join(__dirname, 'istanbul-setup-reports.mjs'),
            join(__dirname, '../../..'),
            output,
            profile,
            '--source',
          ],
          {
            env: { ...process.env, TURBO_TASKS_AVAILABLE_PARALLELISM: '4' },
            stdio: 'pipe',
            timeout: 125000,
          }
        )
      } finally {
        await rm(output, { recursive: true, force: true })
      }
    },
    130000
  )
})

// Suite callback failures retain their real skipped descendants and exact carrier.
describe('settled Istanbul beforeAll callback completion', () => {
  it('marks only the authored beforeAll carrier when disposal reuses the same Error', async () => {
    const { createCollector } = await import(
      'next/dist/experimental/testing/runner/collector'
    )
    const { runCollected, isSettledCoverageFailure } = await import(
      'next/dist/experimental/testing/runner/lifecycle'
    )
    const collector = createCollector('beforeall-stage-identity')
    const error = new Error('same authored and disposal error')
    const before = Object.getOwnPropertyDescriptors(error)
    collector.api.test('unstarted descendant', () => {
      throw new Error('body must remain unstarted')
    })
    collector.api.beforeAll(() => {
      throw error
    })
    await collector.settle()
    const starts: unknown[] = []
    const result = await runCollected(
      collector.close(),
      {
        runId: 'beforeall-stage-run',
        signal: new AbortController().signal,
        captureCoverageCompletion: true,
        onCaseStart: (context) => {
          starts.push(context)
        },
      },
      () => {},
      {
        beginFileFixtures: () => ({ async finalize() {}, async dispose() {} }),
        beginHook: (context) => ({
          async finalize() {},
          async dispose() {
            if (context.hook === 'beforeAll') throw error
          },
        }),
        setActiveHook() {},
      }
    )
    expect(starts).toEqual([])
    expect(
      result.cases.map((row) => ({ status: row.status, errors: row.errors }))
    ).toEqual([{ status: 'skipped', errors: [] }])
    expect(result.errors.map((row) => row.error)).toEqual([error, error])
    expect(result.errors.map(isSettledCoverageFailure)).toEqual([true, false])
    expect(Object.getOwnPropertyDescriptors(error)).toEqual(before)
  })

  it('keeps an actual beforeAll deadline unmarked with no descendant body starts', async () => {
    const { createCollector } = await import(
      'next/dist/experimental/testing/runner/collector'
    )
    const { runCollected, isSettledCoverageFailure } = await import(
      'next/dist/experimental/testing/runner/lifecycle'
    )
    const collector = createCollector('beforeall-deadline')
    collector.api.test('unstarted descendant', () => {
      throw new Error('body must remain unstarted')
    })
    collector.api.beforeAll(() => new Promise(() => {}), 10)
    await collector.settle()
    const starts: unknown[] = []
    const result = await runCollected(
      collector.close(),
      {
        runId: 'beforeall-timeout-run',
        signal: new AbortController().signal,
        captureCoverageCompletion: true,
        onCaseStart: (context) => {
          starts.push(context)
        },
      },
      () => {}
    )
    expect(starts).toEqual([])
    expect(result.interrupted).toBe(true)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.map(isSettledCoverageFailure)).not.toContain(true)
  })

  it.each([
    'beforeall-sync',
    'beforeall-async',
    'beforeall-sync-report-false',
    'beforeall-async-report-false',
  ])(
    'retains actual suite slots, unstarted descendants and genuine maps for %s',
    async (profile) => {
      const { execFileSync } = await import('node:child_process')
      const output = await mkdtemp(
        join(tmpdir(), 'next-istanbul-beforeall-private-')
      )
      try {
        execFileSync(
          process.execPath,
          [
            join(__dirname, 'istanbul-beforeall-private.mjs'),
            join(__dirname, '../../..'),
            output,
            profile,
          ],
          {
            env: { ...process.env, TURBO_TASKS_AVAILABLE_PARALLELISM: '4' },
            stdio: 'pipe',
            timeout: 125000,
          }
        )
        expect(
          JSON.parse(await readFile(join(output, 'VERIFIED.json'), 'utf8'))
        ).toMatchObject({
          actualBeforeAllSuiteSlot: true,
          noInventedCaseStarts: true,
          actualMapIndependentOfReportFilePolicy: true,
        })
      } finally {
        await rm(output, { recursive: true, force: true })
      }
    },
    130000
  )

  it.each([
    'beforeall-sync',
    'beforeall-async',
    'beforeall-sync-report-false',
    'beforeall-async-report-false',
  ])(
    'matches unchanged genuine cases, file message and report policy for %s',
    async (profile) => {
      const { execFileSync } = await import('node:child_process')
      const output = await mkdtemp(
        join(tmpdir(), 'next-istanbul-beforeall-public-')
      )
      try {
        execFileSync(
          process.execPath,
          [
            join(__dirname, 'istanbul-beforeall-reports.mjs'),
            join(__dirname, '../../..'),
            output,
            profile,
            '--source',
          ],
          {
            env: { ...process.env, TURBO_TASKS_AVAILABLE_PARALLELISM: '4' },
            stdio: 'pipe',
            timeout: 125000,
          }
        )
        expect(
          JSON.parse(await readFile(join(output, 'CHECKS.json'), 'utf8'))
        ).toMatchObject({
          actualSettledBeforeAllFailure: true,
          wholeCaseProjection: true,
          completeMapsSummaryLCOV: true,
        })
      } finally {
        await rm(output, { recursive: true, force: true })
      }
    },
    130000
  )
})

it('vetoes Istanbul beforeAll capture when independent actual mock disposal reuses the authored Error', async () => {
  const { execFileSync } = await import('node:child_process')
  const output = await mkdtemp(join(tmpdir(), 'next-istanbul-beforeall-stage-'))
  try {
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'istanbul-beforeall-private.mjs'),
        join(__dirname, '../../..'),
        output,
        'beforeall-mixed-stage',
      ],
      {
        env: { ...process.env, TURBO_TASKS_AVAILABLE_PARALLELISM: '4' },
        stdio: 'pipe',
        timeout: 125000,
      }
    )
    expect(
      JSON.parse(await readFile(join(output, 'VERIFIED.json'), 'utf8'))
    ).toMatchObject({
      independentActualDisposalVeto: true,
      sharedOriginalErrorAuthoredAndRestore: true,
      noInventedCaseStarts: true,
    })
  } finally {
    await rm(output, { recursive: true, force: true })
  }
}, 130000)

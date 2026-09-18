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

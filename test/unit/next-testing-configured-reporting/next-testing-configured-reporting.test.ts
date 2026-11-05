import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  normalizeTestConfig,
  parseTestConfig,
} from 'next/dist/experimental/testing/config'
import type { TestUserConfig } from 'next/dist/experimental/testing/config-api'
import { openTestProjectModules } from 'next/dist/experimental/testing/config-modules'
import {
  encodeSnapshotFormat,
  decodeSnapshotFormat,
  type SnapshotFormat,
} from 'next/dist/experimental/testing/snapshot-format'

it('retains global reporting settings independently of project inheritance', () => {
  const test: TestUserConfig = {
    reporters: ['json', 'junit'],
    outputFile: { json: 'reports/cases.json', junit: 'reports/cases.xml' },
    projects: [
      { test: { name: 'inherited' } },
      { extends: false, test: { name: 'independent' } },
    ],
  }
  const config = normalizeTestConfig({ test })
  expect(config.reporters).toEqual(test.reporters)
  expect(config.outputFile).toEqual(test.outputFile)
  expect(config.projects.map((project) => project.displayName)).toEqual([
    'inherited',
    'independent',
  ])
  for (const project of config.projects) {
    expect(project).not.toHaveProperty('reporters')
    expect(project).not.toHaveProperty('outputFile')
  }
})

it('preserves omitted reporting defaults and native Next root config settings', () => {
  const omitted = normalizeTestConfig({ test: {} })
  expect(omitted).not.toHaveProperty('reporters')
  expect(omitted).not.toHaveProperty('outputFile')
  const direct = parseTestConfig({
    reporters: 'json',
    outputFile: 'reports/result.json',
  })
  expect(direct.reporters).toEqual(['json'])
  expect(direct.outputFile).toBe('reports/result.json')
})

it('publishes configured reports and independently applies explicit CLI reporting flags in both modes', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'next-configured-reporting-'))
  let complete = false
  try {
    const evidence = join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [join(__dirname, 'verify.mjs'), join(__dirname, '../../..'), evidence],
      { timeout: 1500000, maxBuffer: 1024 * 1024 }
    )
    const verified = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(verified.profiles).toBe(12)
    expect(verified.actualCases).toBe(36)
    expect(
      verified.allConfiguredArtifactsAndIndependentCliOverridesMatched
    ).toBe(true)
    expect(verified.relativeCustomReporterRootAndCloseMatched).toBe(true)
    expect(verified.allOwnersJoined).toBe(true)
    expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(`Configured reporting evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (complete) await rm(temporary, { recursive: true, force: true })
  }
}, 1530000)

it('keeps snapshot formatting root-owned across project inheritance', () => {
  const snapshotFormat: NonNullable<TestUserConfig['snapshotFormat']> = {
    indent: 4,
    compareKeys: null,
    maxDepth: Infinity,
    printBasicPrototype: undefined,
  }
  const config = normalizeTestConfig({
    test: {
      snapshotFormat,
      projects: [
        { test: { name: 'inherited' } },
        { extends: false, test: { name: 'independent' } },
      ],
    },
  })
  expect(config.snapshotFormat).toEqual(snapshotFormat)
  expect(config.snapshotFormat).not.toBe(snapshotFormat)
  for (const project of config.projects)
    expect(project).not.toHaveProperty('snapshotFormat')
  expect(parseTestConfig({ snapshotFormat }).snapshotFormat).toEqual(
    snapshotFormat
  )
  expect(normalizeTestConfig({ test: {} })).not.toHaveProperty('snapshotFormat')
})

it('uses root snapshot formatting when a JavaScript child supplies an ignored value', () => {
  const config = normalizeTestConfig({
    test: {
      snapshotFormat: { indent: 4 },
      projects: [
        { test: { name: 'child', snapshotFormat: { min: true, indent: 0 } } },
      ],
    },
  })
  expect(config.snapshotFormat).toEqual({ indent: 4 })
  expect(config.projects[0]).not.toHaveProperty('snapshotFormat')
})

it('matches configured external, inline and raw snapshots in public development and production runs', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'next-snapshot-format-'))
  let complete = false
  try {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'snapshot-format.mjs'),
        'source',
        join(__dirname, '../../..'),
        join(temporary, 'evidence'),
      ],
      { timeout: 1500000, maxBuffer: 1024 * 1024 }
    )
    expect(stdout).toContain('snapshot-format: all profiles passed')
    complete = true
  } finally {
    if (complete) await rm(temporary, { recursive: true, force: true })
  }
}, 1500000)

it.each([
  ['unknown object', '{ unsupportedChildOption: true }'],
  ['null', 'null'],
  ['false', 'false'],
  ['zero', '0'],
  ['empty string', "''"],
  ['NaN', 'NaN'],
  [
    'plugins object',
    '{ plugins: [], compareKeys: null, unsupportedChildOption: true }',
  ],
])(
  'keeps the root snapshot format when a file project supplies %s',
  async (_name, expression) => {
    const directory = await mkdtemp(
      join(tmpdir(), 'next-external-snapshot-format-')
    )
    let owner: Awaited<ReturnType<typeof openTestProjectModules>> = undefined
    try {
      const snapshotFormat = {
        indent: 4,
        escapeString: false,
        printBasicPrototype: true,
      }
      await writeFile(
        join(directory, 'vitest.external.config.mjs'),
        `export default { root: ${JSON.stringify(directory)}, test: { name: 'external', snapshotFormat: (${expression}) } }\n`
      )
      owner = await openTestProjectModules(
        {
          test: { snapshotFormat, projects: ['./vitest.external.config.mjs'] },
        },
        directory,
        normalizeTestConfig
      )
      expect(owner).toBeDefined()
      expect(owner!.config.snapshotFormat).toEqual(snapshotFormat)
      expect(owner!.config.projects).toHaveLength(1)
      expect(owner!.config.projects[0].displayName).toBe('external')
      expect(owner!.config.projects[0]).not.toHaveProperty('snapshotFormat')
    } finally {
      await owner?.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  }
)

it.each([
  ['string', "'ignored-malformed-child'"],
  ['true', 'true'],
  ['one', '1'],
])(
  'retains native snapshot-format admission failures for a file project %s',
  async (_name, expression) => {
    const directory = await mkdtemp(
      join(tmpdir(), 'next-external-snapshot-refusal-')
    )
    let owner: Awaited<ReturnType<typeof openTestProjectModules>> = undefined
    try {
      await writeFile(
        join(directory, 'vitest.external.config.mjs'),
        `export default { root: ${JSON.stringify(directory)}, test: { name: 'external', snapshotFormat: (${expression}) } }\n`
      )
      await expect(
        openTestProjectModules(
          {
            test: {
              snapshotFormat: { indent: 4 },
              projects: ['./vitest.external.config.mjs'],
            },
          },
          directory,
          normalizeTestConfig
        ).then((value) => {
          owner = value
          return value
        })
      ).rejects.toThrow(/Cannot use 'in' operator to search for 'plugins'/)
    } finally {
      await owner?.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  }
)

it('preserves authored undefined and nonfinite snapshot formatting through Browser JSON', () => {
  const format: SnapshotFormat = {
    indent: -0,
    maxDepth: Infinity,
    maxWidth: -Infinity,
    maxOutputLength: NaN,
    compareKeys: undefined,
    printBasicPrototype: undefined,
    escapeString: false,
    quoteKeys: false,
    singleQuote: true,
    spacingInner: '',
    spacingOuter: ' ',
  }
  const wire = JSON.parse(JSON.stringify(encodeSnapshotFormat(format)))
  const decoded = decodeSnapshotFormat(wire)
  expect(decoded).toStrictEqual(format)
  expect(Object.keys(decoded!)).toEqual(Object.keys(format))
  expect(Object.is(decoded!.indent, -0)).toBe(true)
  expect(decodeSnapshotFormat(undefined)).toBeUndefined()
  expect(() =>
    decodeSnapshotFormat({
      maxDepth: { type: 'snapshot-format-number', value: 'unknown' },
    })
  ).toThrow(/invalid encoded number/)
})

it.each([
  ['unknown object', { unsupportedChildOption: true }],
  ['null', null],
  ['false', false],
  ['zero', 0],
  ['empty string', ''],
  ['NaN', NaN],
  [
    'plugins object',
    { plugins: [], compareKeys: null, unsupportedChildOption: true },
  ],
])(
  'keeps root snapshot formatting after inline child admission for %s',
  (_name, value) => {
    const snapshotFormat: SnapshotFormat = {
      indent: 4,
      compareKeys: undefined,
    }
    for (const extendsRoot of [true, false]) {
      const config = normalizeTestConfig({
        test: {
          snapshotFormat,
          projects: [
            {
              extends: extendsRoot,
              test: { name: 'inline', snapshotFormat: value },
            },
          ],
        },
      })
      expect(config.snapshotFormat).toStrictEqual(snapshotFormat)
      expect(Object.hasOwn(config.snapshotFormat!, 'compareKeys')).toBe(true)
      expect(config.projects[0]).not.toHaveProperty('snapshotFormat')
    }
    const direct = parseTestConfig({
      snapshotFormat,
      projects: [{ name: 'inline', snapshotFormat: value }],
    })
    expect(direct.snapshotFormat).toStrictEqual(snapshotFormat)
    expect(Object.hasOwn(direct.snapshotFormat!, 'compareKeys')).toBe(true)
    expect(direct.projects[0]).not.toHaveProperty('snapshotFormat')
  }
)

it.each([
  ['string', 'ignored-malformed-child'],
  ['true', true],
  ['one', 1],
])(
  'retains native snapshot-format admission failures for inline child %s',
  (_name, value) => {
    const snapshotFormat = { indent: 4 }
    for (const extendsRoot of [true, false])
      expect(() =>
        normalizeTestConfig({
          test: {
            snapshotFormat,
            projects: [
              {
                extends: extendsRoot,
                test: { name: 'inline', snapshotFormat: value },
              },
            ],
          },
        })
      ).toThrow(/Cannot use 'in' operator to search for 'plugins'/)
    expect(() =>
      parseTestConfig({
        snapshotFormat,
        projects: [{ name: 'inline', snapshotFormat: value }],
      })
    ).toThrow(/Cannot use 'in' operator to search for 'plugins'/)
  }
)

it('retains the child plugins and compareKeys admission failure without changing the authored value', () => {
  const plugins = [{}]
  const compareKeys = () => 0
  const childFormat = { plugins, compareKeys }
  const snapshotFormat = { indent: 4 }
  const message = '"snapshotFormat.compareKeys" function is not supported.'
  expect(() =>
    normalizeTestConfig({
      test: {
        snapshotFormat,
        projects: [
          {
            extends: false,
            test: { name: 'inline', snapshotFormat: childFormat },
          },
        ],
      },
    })
  ).toThrow(message)
  expect(() =>
    parseTestConfig({
      snapshotFormat,
      projects: [{ name: 'inline', snapshotFormat: childFormat }],
    })
  ).toThrow(message)
  expect(childFormat.plugins).toBe(plugins)
  expect(childFormat.compareKeys).toBe(compareKeys)
  expect(plugins).toHaveLength(1)
})

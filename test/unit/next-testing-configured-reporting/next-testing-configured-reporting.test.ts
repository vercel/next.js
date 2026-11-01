import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  normalizeTestConfig,
  parseTestConfig,
} from 'next/dist/experimental/testing/config'
import type { TestUserConfig } from 'next/dist/experimental/testing/config-api'

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

import { readFile, readdir } from 'fs/promises'
import path from 'path'
import type { RegisteredBrowserFixture, TestProfile } from './contracts'

export interface TestProjectConfig {
  profile: TestProfile
  include: string[]
  exclude: string[]
  setupFiles: string[]
  browserFixtures?: RegisteredBrowserFixture[]
  testTimeout: number
  hookTimeout: number
  fileTimeout: number
}

export interface TestConfig {
  compatibility: 'vitest'
  projects: TestProjectConfig[]
}

const configName = 'next.test.config.json'
const defaultPattern = '**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'

function invalid(message: string): never {
  throw new Error(`Invalid ${configName}: ${message}`)
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(`${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function keys(
  value: Record<string, unknown>,
  allowed: string[],
  label: string
) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      invalid(
        `Unsupported setting ${label}.${key}. Application compilation is configured through next.config; test compiler overrides and Vitest/Vite plugins are not supported.`
      )
    }
  }
}

function strings(value: unknown, fallback: string[], label: string): string[] {
  if (value === undefined) return fallback
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.trim() === '')
  ) {
    invalid(`${label} must be an array of nonempty strings.`)
  }
  return value as string[]
}

function timeout(value: unknown, fallback: number, label: string): number {
  if (value === undefined) return fallback
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > 2 ** 31 - 1
  ) {
    invalid(`${label} must be a positive integer no greater than 2147483647.`)
  }
  return value
}

export function parseTestConfig(value: unknown): TestConfig {
  const config = object(value, 'config')
  keys(config, ['compatibility', 'projects'], 'config')
  if (config.compatibility !== undefined && config.compatibility !== 'vitest') {
    invalid('compatibility must be "vitest".')
  }
  const projects =
    config.projects === undefined
      ? [{ name: 'default', environment: 'node' }]
      : config.projects
  if (!Array.isArray(projects) || projects.length === 0) {
    invalid('projects must be a nonempty array.')
  }
  const names = new Set<string>()
  return {
    compatibility: 'vitest',
    projects: projects.map((projectValue, index) => {
      const label = `projects[${index}]`
      const project = object(projectValue, label)
      keys(
        project,
        [
          'name',
          'environment',
          'mode',
          'include',
          'exclude',
          'route',
          'setupFiles',
          'testTimeout',
          'hookTimeout',
          'fileTimeout',
          'browserFixtures',
        ],
        label
      )
      const name = project.name
      if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        invalid(`${label}.name must contain only letters, digits, "_" or "-".`)
      }
      if (names.has(name)) invalid(`Duplicate project name "${name}".`)
      names.add(name)
      const environment =
        project.environment === undefined ? 'node' : project.environment
      if (!['node', 'rsc', 'browser'].includes(environment as string)) {
        invalid(`${label}.environment must be "node", "rsc" or "browser".`)
      }
      const mode = project.mode === undefined ? 'development' : project.mode
      if (mode !== 'development' && mode !== 'production') {
        invalid(`${label}.mode must be "development" or "production".`)
      }
      if (
        project.route !== undefined &&
        (typeof project.route !== 'string' || !project.route.startsWith('/'))
      ) {
        invalid(`${label}.route must be an absolute route pathname.`)
      }
      let browserFixtures: RegisteredBrowserFixture[] | undefined
      if (project.browserFixtures !== undefined) {
        if (environment !== 'browser' || mode !== 'development') {
          invalid(
            `${label}.browserFixtures requires a development browser project.`
          )
        }
        if (!Array.isArray(project.browserFixtures)) {
          invalid(`${label}.browserFixtures must be an array.`)
        }
        const ids = new Set<string>()
        browserFixtures = project.browserFixtures.map(
          (fixtureValue, fixtureIndex) => {
            const fixtureLabel = `${label}.browserFixtures[${fixtureIndex}]`
            const fixture = object(fixtureValue, fixtureLabel)
            keys(fixture, ['id', 'module', 'exportName'], fixtureLabel)
            if (
              typeof fixture.id !== 'string' ||
              !/^[a-zA-Z0-9_-]+$/.test(fixture.id)
            ) {
              invalid(
                `${fixtureLabel}.id must contain only letters, digits, "_" or "-".`
              )
            }
            if (ids.has(fixture.id))
              invalid(`Duplicate browser fixture ID "${fixture.id}".`)
            ids.add(fixture.id)
            if (
              typeof fixture.module !== 'string' ||
              fixture.module.trim() === ''
            ) {
              invalid(`${fixtureLabel}.module must be a nonempty path.`)
            }
            const exportName =
              fixture.exportName === undefined ? 'default' : fixture.exportName
            if (
              typeof exportName !== 'string' ||
              !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(exportName)
            ) {
              invalid(
                `${fixtureLabel}.exportName must be a JavaScript identifier.`
              )
            }
            return { id: fixture.id, module: fixture.module, exportName }
          }
        )
      }
      const testTimeout = timeout(
        project.testTimeout,
        5000,
        `${label}.testTimeout`
      )
      const hookTimeout = timeout(
        project.hookTimeout,
        10000,
        `${label}.hookTimeout`
      )
      const fileTimeout = timeout(
        project.fileTimeout,
        120000,
        `${label}.fileTimeout`
      )
      if (fileTimeout < Math.max(testTimeout, hookTimeout)) {
        invalid(
          `${label}.fileTimeout must be at least testTimeout and hookTimeout. Increase fileTimeout to accommodate the configured case and hook budgets.`
        )
      }
      return {
        profile: {
          id: name,
          environment: environment as TestProfile['environment'],
          mode,
          runtime: 'nodejs',
          bundler: 'turbopack',
          ...(project.route === undefined
            ? {}
            : { route: project.route as string }),
        },
        include: strings(project.include, [defaultPattern], `${label}.include`),
        exclude: strings(project.exclude, [], `${label}.exclude`),
        setupFiles: strings(project.setupFiles, [], `${label}.setupFiles`),
        ...(browserFixtures === undefined ? {} : { browserFixtures }),
        testTimeout,
        hookTimeout,
        fileTimeout,
      }
    }),
  }
}

export async function loadTestConfig(projectDir: string): Promise<TestConfig> {
  const files = await readdir(projectDir)
  const unsupported = files
    .filter((file) =>
      /^(?:next\.test|vitest|vite)\.config\.(?:[cm]?[jt]s|json)$/.test(file)
    )
    .filter((file) => file !== configName)
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported test configuration: ${unsupported.sort().join(', ')}. Use ${configName}; Next does not load Vitest/Vite configuration or TypeScript test configuration yet.`
    )
  }
  if (!files.includes(configName)) return parseTestConfig({})
  let value: unknown
  const source = await readFile(path.join(projectDir, configName), 'utf8')
  try {
    value = JSON.parse(source)
  } catch {
    // JSON parser messages can quote configuration values, including credentials.
    invalid('The file must contain valid JSON.')
  }
  return parseTestConfig(value)
}

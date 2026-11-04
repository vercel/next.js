import assert from 'node:assert/strict'
export const createTestIdProfiles = (normalizerCases) => [
  {
    id: 'state-development',
    model: 'development',
    kind: 'state',
    mode: 'development',
    cases: 4,
    rows: 4,
    selected: 'testid-state-selected-chromium',
  },
  {
    id: 'state-production',
    model: 'production',
    kind: 'state',
    mode: 'production',
    cases: 4,
    rows: 4,
    selected: 'testid-state-selected-chromium',
  },
  ...normalizerCases.map((entry) => ({
    ...entry,
    model: entry.id,
    kind: 'normalizer',
    mode: 'development',
    cases: 1,
    rows: 1,
    selected: entry.id + '-selected',
  })),
]

function locators(browser, kind) {
  if (kind !== 'omitted')
    browser.locators = {
      testIdAttribute: {
        qa: 'data-qa',
        child: 'data-child',
        instance: 'data-instance',
        undefined: undefined,
        null: null,
      }[kind],
    }
  return browser
}

// These are the measured genuine option objects; provider/cache/API are carriers.
export function genuineTestIdConfiguration(profile, cacheRoot, apiPort) {
  if (profile.kind === 'state') {
    const test = {
      include: ['fixtures.test.mjs'],
      browser: {
        enabled: true,
        headless: true,
        instances: [
          { browser: 'chromium', name: 'testid-state-root-chromium' },
        ],
        locators: { testIdAttribute: 'data-qa' },
        provider: undefined,
      },
      testTimeout: 5000,
      hookTimeout: 5000,
      includeTaskLocation: false,
      maxWorkers: 1,
      projects: [
        {
          extends: true,
          cacheDir: cacheRoot + '/project-vite-cache',
          test: {
            name: 'testid-state-project',
            api: { port: apiPort, host: '127.0.0.1', strictPort: true },
            browser: {
              instances: [{ browser: 'chromium', name: profile.selected }],
            },
          },
        },
      ],
    }
    return { cacheDir: cacheRoot + '/vite-cache', test }
  }
  const instance = locators(
    { browser: 'chromium', name: profile.selected },
    profile.instance
  )
  return {
    cacheDir: cacheRoot + '/vite-cache',
    test: {
      include: ['fixtures.test.mjs'],
      maxWorkers: 1,
      testTimeout: 5000,
      hookTimeout: 5000,
      includeTaskLocation: false,
      browser: locators(
        {
          enabled: true,
          headless: true,
          provider: undefined,
          instances: [{ browser: 'chromium', name: profile.id + '-root' }],
        },
        profile.root
      ),
      projects: [
        {
          extends: true,
          cacheDir: cacheRoot + '/project-vite-cache',
          test: {
            name: profile.id + '-project',
            api: { port: apiPort, host: '127.0.0.1', strictPort: true },
            browser: locators({ instances: [instance] }, profile.child),
          },
        },
      ],
    },
  }
}

export function testIdCarrierShape(configuration) {
  function settings(value) {
    const {
      environment: _environment,
      mode: _mode,
      api: _api,
      browser,
      projects,
      ...rest
    } = value
    if (browser) {
      const { provider: _provider, ...options } = browser
      rest.browser = options
    }
    if (projects)
      rest.projects = projects.map(({ cacheDir: _cache, ...project }) => ({
        ...project,
        test: settings(project.test),
      }))
    return rest
  }
  const { cacheDir: _cache, ...rest } = configuration
  return { ...rest, test: settings(configuration.test) }
}

function literal(value) {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (Array.isArray(value)) return '[' + value.map(literal).join(',') + ']'
  if (typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .map(([key, entry]) => JSON.stringify(key) + ':' + literal(entry))
        .join(',') +
      '}'
    )
  assert(['string', 'boolean', 'number'].includes(typeof value))
  return JSON.stringify(value)
}

export function buildNextTestIdConfiguration(profile) {
  const configuration = genuineTestIdConfiguration(
    profile,
    '<unused-vite-cache>',
    1
  )
  const original = structuredClone(testIdCarrierShape(configuration))
  delete configuration.cacheDir
  delete configuration.test.browser.provider
  for (const project of configuration.test.projects) {
    delete project.cacheDir
    delete project.test.api
    project.test.environment = 'browser'
    project.test.mode = profile.mode
  }
  assert.deepEqual(testIdCarrierShape(configuration), original)
  assert.equal(configuration.test.maxWorkers, 1)
  assert.equal(configuration.test.projects.length, 1)
  const child = configuration.test.projects[0].test
  assert.equal(Object.hasOwn(child, 'maxWorkers'), false)
  assert.equal(child.browser.instances.length, 1)
  assert.equal(child.browser.instances[0].name, profile.selected)
  return {
    configuration,
    source: 'export default ' + literal(configuration) + '\n',
  }
}

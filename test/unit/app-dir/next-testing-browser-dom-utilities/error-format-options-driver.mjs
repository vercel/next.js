import assert from 'node:assert/strict'

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

function carrierShape(configuration) {
  function test(settings) {
    const {
      environment: _environment,
      mode: _mode,
      browser,
      projects,
      ...rest
    } = settings
    if (browser) {
      const { provider: _provider, ...selected } = browser
      rest.browser = selected
    }
    if (projects)
      rest.projects = projects.map(({ cacheDir: _cacheDir, ...project }) => ({
        ...project,
        test: test(project.test),
      }))
    return rest
  }
  const { cacheDir: _cacheDir, ...rest } = configuration
  return { ...rest, test: test(configuration.test) }
}

export function buildNativeFormatConfiguration(
  buildSingleCaseConfiguration,
  id,
  mode,
  cacheRoot
) {
  assert(['development', 'production'].includes(mode))
  const configuration = buildSingleCaseConfiguration(id, {
      cacheRoot,
      provider: () => undefined,
    }),
    originalCarrier = structuredClone(carrierShape(configuration))
  delete configuration.cacheDir
  function adapt(settings) {
    settings.environment = 'browser'
    settings.mode = mode
    if (settings.browser) delete settings.browser.provider
    for (const project of settings.projects ?? []) {
      delete project.cacheDir
      adapt(project.test)
    }
  }
  adapt(configuration.test)
  assert.deepEqual(carrierShape(configuration), originalCarrier)
  assert.equal(configuration.test.maxWorkers, 1)
  assert.equal(configuration.test.projects.length, 1)
  const project = configuration.test.projects[0]
  assert.equal(Object.hasOwn(project.test, 'maxWorkers'), false)
  assert.equal(project.test.browser.instances.length, 1)
  assert.equal(project.test.testTimeout ?? configuration.test.testTimeout, 5000)
  assert.equal(project.test.hookTimeout ?? configuration.test.hookTimeout, 5000)
  return {
    configuration,
    source: 'export default ' + literal(configuration) + '\n',
  }
}

const {
  readExpectedCoverageFixture,
} = require('./expected-coverage-fixtures.cjs')

// Keep invariant expectations once while giving each profile its own objects.
function readCoverageFixture(file) {
  const fixture = readExpectedCoverageFixture(file)
  if (!fixture.defaults && !fixture.coverageMaps) return fixture
  const { defaults, coverageMaps, ...value } = fixture
  for (const key of ['rows', 'profiles']) {
    if (!Array.isArray(value[key])) continue
    value[key] = value[key].map(({ omit = [], ...row }) => {
      const expanded = { ...defaults, ...row }
      for (const field of ['coverage', 'coverageMap']) {
        if (!coverageMaps || typeof expanded[field] !== 'string') continue
        const name = expanded[field]
        if (!Object.hasOwn(coverageMaps, name))
          throw new Error('Unknown expected coverage map: ' + name)
        expanded[field] = coverageMaps[name]
      }
      for (const field of omit) delete expanded[field]
      return JSON.parse(JSON.stringify(expanded))
    })
  }
  return value
}

module.exports = { readCoverageFixture }

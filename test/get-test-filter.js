const path = require('path')
const minimatch = require('minimatch')

function getTestFilter() {
  const manifest = process.env.NEXT_EXTERNAL_TESTS_FILTERS
    ? require(path.resolve(process.env.NEXT_EXTERNAL_TESTS_FILTERS))
    : null
  if (!manifest) return null

  // For the legacy manifest without a version, we assume it's a complete list
  // of all the tests.
  if (!manifest.version || typeof manifest.version !== 'number') {
    return (tests) =>
      tests
        .filter((test) => {
          const info = manifest[test.file]
          // Include tests that are not in the manifest
          return !info || !info.runtimeError
        })
        .map((test) => {
          const info = manifest[test.file]
          // Exclude failing and flakey tests, newly added tests are automatically included
          if (info && (info.failed.length > 0 || info.flakey.length > 0)) {
            test.excludedCases = info.failed.concat(info.flakey)
          }
          return test
        })
  }

  // The new manifest version 2 only contains the list of tests that should
  // be run, with exclusions added based on rules. Any new tests that are added
  // will be automatically included if they match the include rules.
  if (manifest.version === 2) {
    return (tests) =>
      tests
        .filter((test) => {
          // Check to see if this was included as-is in the manifest.
          if (test.file in manifest.suites) return true

          // If this file doesn't match any of the include patterns, then it
          // should be excluded.
          if (
            manifest.rules.include.every(
              (pattern) => !minimatch(test.file, pattern)
            )
          ) {
            return false
          }

          // If the file matches any of the exclude patterns, then it should be
          // excluded.
          if (
            manifest.rules.exclude?.some((pattern) =>
              minimatch(test.file, pattern)
            )
          ) {
            return false
          }

          // Otherwise, it should be included.
          return true
        })
        .map((test) => {
          const info = manifest.suites[test.file]

          // If there's no info for this test, then it's a test that has no
          // failures or flakey tests, so we can just include it as-is.
          if (!info) {
            return test
          }

          // Exclude failing and flakey tests, newly added tests are
          // automatically included.
          const { failed = [], flakey = [] } = info
          if (failed.length > 0 || flakey.length > 0) {
            test.excludedCases = failed.concat(flakey)
          }

          return test
        })
  }

  throw new Error(`Unknown manifest version: ${manifest.version}`)
}

module.exports = { getTestFilter }

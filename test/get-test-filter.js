const path = require('path')
const minimatch = require('minimatch')

function getManifest() {
  const nextExternalTestFilters = process.env.NEXT_EXTERNAL_TESTS_FILTERS
  if (!nextExternalTestFilters) {
    return null
  }

  return nextExternalTestFilters
    .split(',')
    .reduce((mergedManifest, manifestPath) => {
      const manifest = require(path.resolve(manifestPath))
      if (!mergedManifest) {
        return manifest
      }

      if (manifest.version === 2) {
        for (const suite in manifest.suites) {
          if (mergedManifest.suites[suite]) {
            const mergedSuite = mergedManifest.suites[suite]
            const currentSuite = manifest.suites[suite]
            mergedSuite.failed = [
              ...(mergedSuite.failed || []),
              ...(currentSuite.failed || []),
            ]
            mergedSuite.flakey = [
              ...(mergedSuite.flakey || []),
              ...(currentSuite.flakey || []),
            ]
          } else {
            mergedManifest.suites[suite] = manifest.suites[suite]
          }
        }
        mergedManifest.rules.include.push(...(manifest.rules.include || []))
        mergedManifest.rules.exclude.push(...(manifest.rules.exclude || []))
        return mergedManifest
      }

      throw new Error(
        `Merging manifests is only supported for version 2: ${manifestPath}`
      )
    }, null)
}

function getTestFilter() {
  const manifest = getManifest()
  if (!manifest) return null

  console.log(
    'Filtering tests using manifest:',
    process.env.NEXT_EXTERNAL_TESTS_FILTERS
  )

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
          if (test.file in manifest.suites) {
            // When merging multiple manifests, a test file may be included in
            // the suites by one manifest, but excluded in the rules by another.
            // If it's excluded by filename (and not by pattern), the exclusion
            // takes precedence over the inclusion.
            return !manifest.rules.exclude?.includes(test.file)
          }

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

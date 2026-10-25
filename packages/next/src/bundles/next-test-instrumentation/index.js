import { createInstrumenter } from '@vitest/istanbul-lib-instrument'
import { createCoverageMap } from '@vitest/istanbul-lib-coverage'
import { createSourceMapStore } from '@vitest/istanbul-lib-source-maps'
import MagicString from 'magic-string'

/** Actual instrumentation at the ordinary loader's unmapped JavaScript phase. */
export function instrumentJavaScript(source, file) {
  const inputMap = JSON.parse(
    new MagicString(source)
      .generateMap({ includeContent: true, hires: 'boundary', source: file })
      .toString()
  )
  const instrumenter = createInstrumenter({
    produceSourceMap: true,
    autoWrap: false,
    esModules: true,
    compact: false,
    coverageVariable: '__VITEST_COVERAGE__',
    coverageGlobalScope: 'globalThis',
    coverageGlobalScopeFunc: false,
    ignoreLines: true,
  })
  const code = instrumenter.instrumentSync(source, file, inputMap)
  return {
    code,
    map: instrumenter.lastSourceMap(),
    initial: instrumenter.lastFileCoverage(),
  }
}

/** Remap actual counter data with the same pinned pure provider primitive. */
export async function remapIstanbulCoverage(data) {
  const map = await createSourceMapStore().transformCoverage(
    createCoverageMap(data)
  )
  return Object.fromEntries(
    map.files().map((file) => [file, map.fileCoverageFor(file).toJSON()])
  )
}

/** Merge complete provider maps with the provider's actual declaration semantics. */
export function mergeIstanbulCoverage(maps) {
  const map = createCoverageMap({})
  for (const data of maps) map.merge(data)
  return Object.fromEntries(
    map.files().map((file) => [file, map.fileCoverageFor(file).toJSON()])
  )
}

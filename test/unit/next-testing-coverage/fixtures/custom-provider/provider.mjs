import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'

const scenario = process.env.CUSTOM_COVERAGE_SCENARIO
const failure = process.env.CUSTOM_COVERAGE_FAILURE === '1'
const record = (name, data = {}) =>
  appendFileSync(
    'provider-trace.jsonl',
    JSON.stringify({ name, ...data }) + '\n'
  )
const mapSnapshot = () =>
  existsSync('cases.json')
    ? JSON.parse(readFileSync('cases.json', 'utf8')).coverageMap
    : null
const values = {
  undefined: undefined,
  null: null,
  false: false,
  zero: 0,
  emptyObject: {},
  emptyArray: [],
  nan: NaN,
  infinity: Infinity,
  string: 'opaque-custom-data',
}
const valueScenario = scenario.startsWith('value-')
const opaqueFunction = () => 42

class Provider {
  name = 'fixture-provider'
  payloads = []
  initialize(context) {
    record('initialize')
    this.options = {
      ...context.config.coverage,
      provider: 'custom',
      enabled: true,
    }
  }
  resolveOptions() {
    record('resolve')
    return this.options
  }
  clean() {
    record('clean')
  }
  onTestRunStart() {
    record('run-start')
  }
  onAfterSuiteRun(meta) {
    record('suite', { coverage: meta.coverage, testFiles: meta.testFiles })
    this.payloads.push(meta.coverage)
  }
  generateCoverage() {
    if (valueScenario) {
      this.generated = values[scenario.slice(6)]
      record('generate', {
        type: typeof this.generated,
        isNaN: Number.isNaN(this.generated),
      })
    } else {
      record(
        'generate',
        failure ? { jsonExists: existsSync('cases.json') } : {}
      )
      if (scenario === 'generator-reject')
        throw new Error('actual113 generator failure')
      this.generated = scenario.startsWith('nojson-function')
        ? opaqueFunction
        : scenario === 'json-bigint'
          ? 1n
          : failure
            ? { stage: 'generated', payloads: this.payloads }
            : { payloads: this.payloads }
      if (scenario === 'modern-identity')
        record('generate-observed', {
          type: typeof this.generated,
          customReportExists: existsSync('custom-coverage.json'),
        })
    }
    return this.generated
  }
  onTestFailure() {
    record('failure-enter', {
      jsonExists: existsSync('cases.json'),
      mapSnapshot: mapSnapshot(),
    })
    if (scenario === 'hook-reject') throw new Error('actual113 failure hook')
    const mutate = () => {
      if (this.generated && typeof this.generated === 'object')
        this.generated.stage = 'mutated'
    }
    const leave = () => {
      mutate()
      record('failure-leave', {
        mapSnapshot: mapSnapshot(),
        generatedStage: this.generated?.stage ?? null,
      })
    }
    if (scenario === 'async-true')
      return Promise.resolve().then(() => {
        record('failure-async-resume')
        leave()
      })
    if (scenario === 'thenable-true')
      return {
        get then() {
          record('failure-then-access')
          return (resolve) => {
            mutate()
            record('failure-then-complete', { mapSnapshot: mapSnapshot() })
            resolve()
          }
        },
      }
    leave()
  }
  reportCoverage(value) {
    let result
    if (valueScenario) {
      record('report', {
        sameGenerated: Object.is(value, this.generated),
        standardJSONExists: existsSync('cases.json'),
        type: typeof value,
        isNaN: Number.isNaN(value),
      })
      result = { type: typeof value, isNaN: Number.isNaN(value), value }
    } else if (scenario.startsWith('nojson-function')) {
      result = {
        same: value === opaqueFunction,
        type: typeof value,
        result: value(),
      }
      record('report', result)
    } else if (failure) {
      result = {
        same: value === this.generated,
        coverage: value,
        mapSnapshot: mapSnapshot(),
      }
      record('report', result)
    } else {
      if (scenario === 'modern-identity')
        record('report-observed', {
          sameGenerated: value === this.generated,
          standardJSONExists: existsSync('cases.json'),
        })
      record('report')
      result = value
    }
    writeFileSync('custom-coverage.json', JSON.stringify(result))
  }
}
export default {
  getProvider() {
    record('get-provider')
    return new Provider()
  },
  startCoverage() {
    record('start')
  },
  takeCoverage() {
    record('take')
    return { releasePayload: 42 }
  },
  stopCoverage() {
    record('stop')
  },
}

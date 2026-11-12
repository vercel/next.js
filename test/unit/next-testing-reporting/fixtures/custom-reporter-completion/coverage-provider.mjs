import { appendFileSync, writeFileSync } from 'node:fs'
const record = (name, data = {}) =>
  appendFileSync(
    'provider-trace.jsonl',
    JSON.stringify({ name, ...data }) + '\n'
  )
class ReleaseProvider {
  name = 'release-provider'
  payloads = []
  initialize(ctx) {
    record('initialize')
    this.options = { ...ctx.config.coverage, provider: 'custom', enabled: true }
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
    record('generate')
    return { payloads: this.payloads }
  }
  reportCoverage(coverage) {
    record('report')
    writeFileSync('custom-coverage.json', JSON.stringify(coverage))
  }
}
export default {
  getProvider() {
    record('get-provider')
    return new ReleaseProvider()
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

import { existsSync, readFileSync } from 'node:fs'
let generatedValue
const mapSnapshot = () =>
  existsSync('cases.json')
    ? JSON.parse(readFileSync('cases.json', 'utf8')).coverageMap
    : null
ReleaseProvider.prototype.generateCoverage = function () {
  record('generate', { jsonExists: existsSync('cases.json') })
  generatedValue = { stage: 'generated', payloads: this.payloads }
  return generatedValue
}
ReleaseProvider.prototype.onTestFailure = function () {
  record('failure-enter', {
    jsonExists: existsSync('cases.json'),
    mapSnapshot: mapSnapshot(),
  })
  if (generatedValue && typeof generatedValue === 'object')
    generatedValue.stage = 'mutated'
  record('failure-leave', {
    mapSnapshot: mapSnapshot(),
    generatedStage: generatedValue?.stage ?? null,
  })
}
ReleaseProvider.prototype.reportCoverage = function (value) {
  const detail = {
    same: value === generatedValue,
    coverage: value,
    mapSnapshot: mapSnapshot(),
  }
  record('report', detail)
  writeFileSync('custom-coverage.json', JSON.stringify(detail))
}

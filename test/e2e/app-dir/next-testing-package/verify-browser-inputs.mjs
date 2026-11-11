import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBrowserCases } from './browser-regression-utils.mjs'

const [consumerArg, outputArg, mode] = process.argv.slice(2)
assert(consumerArg && outputArg, 'Expected consumer, output directory and mode')
assert(['development', 'production'].includes(mode))
const consumer = resolve(consumerArg)
const output = resolve(outputArg)
const fixtureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../unit/next-testing-browser-resources/fixtures'
)
const files = (entries) =>
  entries.map(([source, target]) => ({
    source: join(fixtureRoot, source),
    target,
  }))
mkdirSync(output)

const physical = await runBrowserCases({
  consumer,
  output: join(output, 'physical'),
  mode,
  files: files([
    [
      'user-event-physical-keyboard/physical.test.mjs.txt',
      'cases/physical.test.mjs',
    ],
  ]),
  expectedCases: 11,
  fileTimeout: 30000,
  timeoutMs: 90000,
})
const positive = await runBrowserCases({
  consumer,
  output: join(output, 'inputs'),
  mode,
  files: files([
    ['user-event-held-keys/held.test.mjs.txt', 'cases/held.test.mjs'],
    ['user-event-keyboard/keyboard.test.mjs.txt', 'cases/keyboard.test.mjs'],
    ['user-event-named-keyboard/named.test.mjs.txt', 'cases/named.test.mjs'],
    ['user-event-clipboard/clipboard.test.mjs.txt', 'cases/clipboard.test.mjs'],
    ['user-event-drag/drag.test.mjs.txt', 'cases/drag.test.mjs'],
    ['user-event-drag/geometry.test.mjs.txt', 'cases/geometry.test.mjs'],
    ['user-event-drag/override.test.mjs.txt', 'cases/override.test.mjs'],
    ['user-event-drag/override.css.txt', 'cases/override.css'],
    [
      'user-event-select-options/select-options.test.mjs.txt',
      'cases/select-options.test.mjs',
    ],
    ['user-event-wheel/wheel.test.mjs.txt', 'cases/wheel.test.mjs'],
    ['user-event-upload/upload.test.mjs.txt', 'cases/upload.test.mjs'],
    ['user-event-upload/upload-source.txt.txt', 'upload-source.txt'],
    ['locator-hover/hover.test.mjs.txt', 'cases/locator-hover.test.mjs'],
    [
      'locator-hover/companion.test.mjs.txt',
      'cases/locator-hover-recovery.test.mjs',
    ],
    ['locator-select/select.test.mjs.txt', 'cases/locator-select.test.mjs'],
    [
      'locator-select/controls.test.mjs.txt',
      'cases/locator-select-recovery.test.mjs',
    ],
    [
      'locator-multiclick/multiclick.test.mjs.txt',
      'cases/locator-multiclick.test.mjs',
    ],
    [
      'locator-multiclick/controls.test.mjs.txt',
      'cases/locator-multiclick-recovery.test.mjs',
    ],
    [
      'locator-negative-nth/negative-nth.test.mjs.txt',
      'cases/locator-negative-nth.test.mjs',
    ],
    [
      'locator-admission/admission.test.mjs.txt',
      'cases/locator-admission.test.mjs',
    ],
    [
      'locator-admission/controls.test.mjs.txt',
      'cases/locator-admission-recovery.test.mjs',
    ],
  ]),
  expectedCases: 83,
})
const failedCleanup = await runBrowserCases({
  consumer,
  output: join(output, 'held-failure'),
  mode,
  files: files([
    ['user-event-held-keys/failed.test.mjs.txt', 'cases/failed.test.mjs'],
  ]),
  expectedCases: 2,
  failures: [
    {
      name: 'failed authored case retains a default held modifier until attempt cleanup',
      message: 'intentional held-key cleanup probe',
    },
  ],
})
const results = [physical, positive, failedCleanup]
const summary = {
  mode,
  profiles: results.length,
  cases: results.reduce((count, result) => count + result.cases, 0),
  passed: results.reduce((count, result) => count + result.passed, 0),
  failed: results.reduce((count, result) => count + result.failed, 0),
}
writeFileSync(
  join(output, 'VERIFIED.json'),
  JSON.stringify(summary, null, 2) + '\n'
)
console.log(JSON.stringify(summary))

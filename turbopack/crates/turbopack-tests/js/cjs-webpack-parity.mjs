import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const [fixtureArg, repoRootArg] = process.argv.slice(2)
if (!fixtureArg || !repoRootArg) {
  throw new Error('usage: node cjs-webpack-parity.mjs <fixture> <repo-root>')
}

const fixture = path.resolve(fixtureArg)
const repoRoot = path.resolve(repoRootArg)
const input = path.join(fixture, 'input')
const turbopackOutput = path.join(fixture, 'output')
const expectedPath = path.join(fixture, 'differential.json')
const update = process.env.UPDATE === '1'
const requireFromRoot = createRequire(path.join(repoRoot, 'package.json'))
const webpackPath = requireFromRoot.resolve('webpack')
const webpack = requireFromRoot(webpackPath)
const webpackVersion = requireFromRoot('webpack/package.json').version
assert.equal(webpackVersion, '5.98.0', 'unexpected root-pinned webpack version')

const cases = {
  direct: {
    modules: ['direct.js'],
    sentinels: ['USED_DIRECT_EXPORT', 'UNUSED_DIRECT_EXPORT'],
  },
  objectLiteral: {
    modules: ['object-literal.js'],
    sentinels: ['USED_OBJECT_LITERAL', 'UNUSED_OBJECT_LITERAL'],
  },
  defineProperty: {
    modules: ['define-property.js'],
    sentinels: ['USED_DEFINE_PROPERTY', 'UNUSED_DEFINE_PROPERTY'],
  },
  computed: {
    modules: ['computed.js'],
    sentinels: ['USED_COMPUTED_KEY', 'UNUSED_COMPUTED_KEY'],
  },
  dynamicComputed: {
    modules: ['dynamic-computed.js'],
    sentinels: [
      'USED_DYNAMIC_COMPUTED',
      'USED_DYNAMIC_FIXED',
      'UNUSED_DYNAMIC_CONSERVATIVE',
    ],
  },
  conditional: {
    modules: ['conditional.js'],
    sentinels: [
      'USED_CONDITIONAL_THEN',
      'USED_CONDITIONAL_ELSE',
      'UNUSED_CONDITIONAL_THEN',
      'UNUSED_CONDITIONAL_ELSE',
      'conditional:condition',
      'conditional:unused-rhs-then',
      'conditional:unused-rhs-else',
    ],
  },
  wholeReexport: {
    modules: ['whole-reexport.js', 'whole-reexport-leaf.js'],
    sentinels: ['USED_WHOLE_REEXPORT_LEAF', 'UNUSED_WHOLE_REEXPORT_LEAF'],
  },
  directProperty: {
    modules: [
      'direct-property-reexport.js',
      'direct-property-used-leaf.js',
      'direct-property-unused-leaf.js',
      'direct-property-side-effect-leaf.js',
    ],
    sentinels: [
      'USED_DIRECT_PROPERTY_REEXPORT_LEAF',
      'UNUSED_DIRECT_PROPERTY_REEXPORT_LEAF',
      'UNUSED_SIDE_EFFECT_EXPORT_VALUE',
      'direct-property:side-effect-leaf',
    ],
  },
  cycle: {
    modules: ['cycle-a.js', 'cycle-b.js'],
    sentinels: [
      'USED_CYCLE_A_BEFORE',
      'USED_CYCLE_A_AFTER',
      'USED_CYCLE_B_VALUE',
    ],
  },
}

function allJavaScript(directory) {
  return fs
    .readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) =>
      fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8')
    )
    .join('\n')
}

function execute(entry) {
  const result = spawnSync(process.execPath, [entry], {
    cwd: path.dirname(entry),
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(
      `bundle execution failed (${entry})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    )
  }
  const line = result.stdout
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith('CJS_PARITY_RESULT='))
  if (!line) {
    throw new Error(
      `bundle emitted no CJS_PARITY_RESULT line:\n${result.stdout}`
    )
  }
  return JSON.parse(line.slice('CJS_PARITY_RESULT='.length))
}

function manifest(bundle) {
  return Object.fromEntries(
    Object.entries(cases).map(([name, definition]) => [
      name,
      {
        modules: Object.fromEntries(
          definition.modules.map((module) => [
            module,
            bundle.includes(`/${module}`) || bundle.includes(`./${module}`),
          ])
        ),
        sentinels: Object.fromEntries(
          definition.sentinels.map((sentinel) => [
            sentinel,
            bundle.includes(sentinel),
          ])
        ),
      },
    ])
  )
}

function flatten(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const field = prefix ? `${prefix}.${key}` : key
    return child && typeof child === 'object'
      ? flatten(child, field)
      : [[field, child]]
  })
}

function differences(turbopack, webpackManifest) {
  const webpackFields = new Map(flatten(webpackManifest))
  return flatten(turbopack)
    .filter(([field, value]) => webpackFields.get(field) !== value)
    .map(([field, turbopackValue]) => ({
      field,
      turbopack: turbopackValue,
      webpack: webpackFields.get(field),
    }))
}

function webpackBuild(outputPath) {
  return new Promise((resolve, reject) => {
    webpack(
      {
        mode: 'production',
        target: 'node',
        context: input,
        entry: './index.js',
        devtool: false,
        output: {
          path: outputPath,
          filename: 'index.js',
        },
        module: {
          rules: [
            {
              // Match the Turbopack-only `use turbopack: no side effects` directive in the
              // shared leaf without changing the canonical input for either bundler.
              test: /direct-property-unused-leaf\.js$/,
              sideEffects: false,
            },
          ],
        },
        optimization: {
          usedExports: true,
          minimize: true,
          // Stable path-based IDs let the retention manifest observe module presence in the
          // emitted JavaScript without relying on webpack stats or hashed numeric IDs.
          moduleIds: 'named',
          // Keep each CommonJS producer visible as its own module; concatenation would erase
          // module boundaries and make a module-presence comparison meaningless.
          concatenateModules: false,
        },
      },
      (error, stats) => {
        if (error) return reject(error)
        if (stats.hasErrors()) {
          return reject(new Error(stats.toString({ all: false, errors: true })))
        }
        resolve()
      }
    )
  })
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cjs-webpack-parity-'))
try {
  await webpackBuild(temp)
  const runtime = {
    turbopack: execute(path.join(turbopackOutput, 'index.entry.js')),
    webpack: execute(path.join(temp, 'index.js')),
  }
  const retention = {
    turbopack: manifest(allJavaScript(turbopackOutput)),
    webpack: manifest(allJavaScript(temp)),
  }
  const actualDifferences = differences(retention.turbopack, retention.webpack)

  if (update || !fs.existsSync(expectedPath)) {
    const previous = fs.existsSync(expectedPath)
      ? JSON.parse(fs.readFileSync(expectedPath, 'utf8'))
      : { classifications: [] }
    const previousClassifications = new Map(
      previous.classifications.map((item) => [
        JSON.stringify([item.field, item.turbopack, item.webpack]),
        item,
      ])
    )
    const classifications = actualDifferences.map((difference) => {
      const previousItem = previousClassifications.get(
        JSON.stringify([
          difference.field,
          difference.turbopack,
          difference.webpack,
        ])
      )
      return {
        ...difference,
        classification: previousItem?.classification ?? 'REVIEW_REQUIRED',
        reason: previousItem?.reason ?? 'REVIEW_REQUIRED',
      }
    })
    fs.writeFileSync(
      expectedPath,
      `${JSON.stringify(
        {
          webpackVersion,
          runtime: runtime.turbopack,
          retention,
          classifications,
        },
        null,
        2
      )}\n`
    )
    if (!update) {
      throw new Error(`missing ${expectedPath}; generated a review draft`)
    }
    console.log(`updated ${expectedPath}`)
  } else {
    const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'))
    assert.deepEqual(runtime.turbopack, runtime.webpack, 'runtime differential')
    assert.deepEqual(runtime.turbopack, expected.runtime, 'runtime oracle')
    assert.deepEqual(retention, expected.retention, 'retention oracle')
    assert.deepEqual(
      actualDifferences,
      expected.classifications.map(
        ({ classification, reason, ...difference }) => difference
      ),
      'unclassified retention difference'
    )
    for (const item of expected.classifications) {
      assert.match(
        item.classification,
        /^(turbopack-gap|turbopack-improvement|intentional-divergence)$/,
        `invalid classification for ${item.field}`
      )
      assert.ok(item.reason && item.reason !== 'REVIEW_REQUIRED')
    }
    console.log(
      `CJS webpack parity passed (webpack ${webpackVersion}, ${actualDifferences.length} classified retention differences)`
    )
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}

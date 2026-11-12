const { resolveFixturePath } = require('../../lib/next-testing-fixtures.cjs')
const assert = require('node:assert/strict')
const { join } = require('node:path')

// These are authored input variants, shared by public CLI and component tests.
const profiles = {
  'sync-json': [
    'cli-sync-before',
    'cli-sync-after',
    'cli-async-before',
    'cli-async-after',
    'cli-promise-before',
    'cli-promise-after',
    'cli-sync-before-prior',
    'cli-sync-after-prior',
    'cli-async-before-prior',
  ],
  'completion-failure': [
    'zero-getter',
    'zero-invalid',
    'plain-getter',
    'plain-invalid',
    'absent-getter',
    'absent-invalid',
  ],
  dispatch: [
    'first-sync',
    'first-async',
    'json-first-sync',
    'json-between-second-sync',
    'json-after-second-sync',
  ],
  pending: ['resolve', 'reject', 'close-throw', 'reject-close-throw'],
}

function completionInputs(family, name) {
  assert(profiles[family]?.includes(name), 'Unknown reporter input profile')
  const files = {}
  const add = (target, variant, directory = family) => {
    files[target] = resolveFixturePath(
      join(__dirname, 'fixtures', 'custom-' + directory, variant)
    )
  }
  let reporters
  let priorJSONBytes = null
  if (family === 'sync-json') {
    const kind = name.split('-')[1]
    add('observer.mjs', 'observer-' + kind + '.mjs')
    reporters = name.includes('-before')
      ? ['./observer.mjs', 'json']
      : ['json', './observer.mjs']
    if (name.endsWith('-prior')) priorJSONBytes = '{"prior":115}\n'
  } else if (family === 'completion-failure') {
    const getter = name.endsWith('-getter')
    if (name.startsWith('zero-')) {
      add(
        'observer.mjs',
        getter ? 'observer-getter.mjs' : 'observer-invalid.mjs'
      )
      reporters = ['./observer.mjs', 'json']
    } else {
      add(
        'first.mjs',
        name.startsWith('plain-') ? 'first-enter.mjs' : 'first-absent.mjs'
      )
      add('second.mjs', getter ? 'second-getter.mjs' : 'second-invalid.mjs')
      add('third.mjs', 'third.mjs')
      reporters = ['./first.mjs', './second.mjs', './third.mjs', 'json']
    }
  } else if (family === 'dispatch') {
    const secondThrows = name.includes('second-sync')
    add(
      'first.mjs',
      secondThrows
        ? 'first-pass.mjs'
        : name === 'first-async'
          ? 'first-async.mjs'
          : 'first-sync.mjs'
    )
    add('second.mjs', secondThrows ? 'second-sync.mjs' : 'second-pass.mjs')
    reporters =
      name === 'json-first-sync'
        ? ['json', './first.mjs', './second.mjs']
        : name === 'json-between-second-sync'
          ? ['./first.mjs', 'json', './second.mjs']
          : ['./first.mjs', './second.mjs', 'json']
  } else {
    add('first.mjs', 'first-' + name + '.mjs')
    add('second.mjs', 'second.mjs')
    add('third.mjs', 'third.mjs', 'completion-failure')
    reporters = ['./first.mjs', './second.mjs', './third.mjs', 'json']
  }
  return { files, reporters, priorJSONBytes }
}

module.exports = { completionInputs, profiles }

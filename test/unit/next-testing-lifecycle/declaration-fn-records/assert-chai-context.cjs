const assert = require('node:assert/strict')
const assertProfile = require('./assert-profile.cjs')

const phases = ['foreign', 'afterAll']
const nativeNames = ['include', 'lengthOf', 'a']
const passed = (...names) =>
  names.map((name) => ({ name, status: 'passed', failureMessages: [] }))

function traceChecks(actual, kind, cases) {
  assertProfile(actual, cases)
  assert.equal(actual.rows.length, 1)
  const value = actual.rows[0].value
  assert.deepEqual(Object.keys(value).sort(), ['kind', 'trace'])
  assert.equal(value.kind, kind)
  let index = 0
  return {
    row(expected) {
      assert.deepEqual(value.trace[index++], expected, `${kind} row ${index}`)
    },
    done() {
      assert.equal(value.trace.length, index, `${kind} complete trace`)
    },
  }
}

function state(row, phase, fields = {}) {
  row({ phase, kind: 'state', sameTask: true, sameReceiver: true, ...fields })
}

function error(row, phase, fields, name, message) {
  row({ phase, ...fields, error: { name, message } })
}

function functionReceivers(actual, kind) {
  const { row, done } = traceChecks(
    actual,
    kind,
    passed(
      'creator real native function records',
      'foreign real native function records'
    )
  )
  for (const [phaseIndex, phase] of phases.entries()) {
    for (const name of nativeNames) {
      row({
        phase,
        name,
        kind: 'shape',
        type: 'function',
        prototypeSource: false,
        functionInstance: false,
      })
      state(row, phase, { receiverType: 'function', promise: '' })
      for (const kind of ['direct-method', 'borrowed-method']) {
        row({ phase, name, kind, resultType: 'object', sameTarget: false })
        state(row, phase, { receiverType: 'object', promise: '' })
      }
      row({ phase, name, kind: 'then', thenUndefined: true })
    }
    row({ phase, kind: 'counts', owner: 3, caller: 3 * (phaseIndex + 1) })
  }
  done()
}

function rawAliases(actual, kind) {
  const { row, done } = traceChecks(
    actual,
    kind,
    passed(
      'creator actual raw native function aliases',
      'foreign actual raw native function aliases'
    )
  )
  for (const name of nativeNames)
    row({ kind: 'native-flag', name, actualTask: true })
  for (const phase of phases) {
    for (const name of nativeNames) {
      row({
        phase,
        name,
        kind: 'getter',
        sameGetterThis: true,
        aliasIsPublic: false,
        aliasType: 'function',
        samePrototype: true,
      })
      state(row, phase, { receiverType: 'function' })
      state(row, phase, { receiverType: 'function' })
      row({ phase, name, kind: 'own-function', sameFunction: true })
      for (const label of ['public', 'alias'])
        row({ phase, name, kind: 'own-call', label, sameReceiver: true })
    }
    row({ phase, kind: 'counts', owner: 3, caller: 0 })
  }
  done()
}

function chainableFunctions(actual) {
  const { row, done } = traceChecks(
    actual,
    'chai-chainable-functions',
    passed(
      'creator native uncalled chainable functions',
      'foreign native uncalled chainable functions'
    )
  )
  for (const [phaseIndex, phase] of phases.entries()) {
    for (const name of [
      'include-keys',
      'length-above',
      'a-not-equal',
      'include-not-keys',
    ]) {
      row({ phase, name, returnedType: 'object' })
      state(row, phase)
      if (name === 'a-not-equal' || name === 'include-not-keys') {
        error(
          row,
          phase,
          { name },
          'Error',
          'chainable native receiver changed'
        )
      }
    }
    row({ phase, kind: 'counts', owner: 4 * (phaseIndex + 1), caller: 0 })
  }
  done()
}

function nestedChainables(actual) {
  const { row, done } = traceChecks(
    actual,
    'chai-nested-chainables',
    passed(
      'creator genuine nested native chainables',
      'foreign genuine nested native chainables'
    )
  )
  const names = ['include-lengthOf', 'a-include', 'include-include']
  for (const name of names)
    row({
      kind: 'created',
      name,
      type: 'function',
      sourceType: 'function',
      thenAbsent: true,
    })
  for (const phase of phases) {
    for (const name of names) {
      row({
        phase,
        name,
        kind: 'method',
        returnedType: 'object',
        sameReturned: false,
      })
      state(row, phase, { receiverType: 'function' })
      row({
        phase,
        name,
        kind: 'raw',
        exact: true,
        samePublic: false,
        type: 'function',
      })
      state(row, phase, { receiverType: 'function' })
    }
    row({ phase, kind: 'counts', owner: 3, caller: 0 })
  }
  done()
}

function hardFluent(actual) {
  const { row, done } = traceChecks(
    actual,
    'fluent-chai-hard',
    passed('creator fluent Chai owner', 'foreign fluent Chai caller')
  )
  let ownerCount = 0
  for (const phase of phases) {
    for (const name of [
      'equal',
      'deep-equal',
      'property',
      'lengthOf',
      'instanceOf',
      'include',
      'match',
      'ok',
      'true',
      'a',
    ]) {
      row({
        phase,
        name,
        returnedType: 'object',
        sameAssertion: false,
        ownerCount: ++ownerCount,
        callerCount: 0,
      })
      row({
        phase,
        kind: 'matcher-state',
        taskIsOwner: true,
        sameReceiver: true,
        promise: '',
      })
    }
  }
  done()
}

function fluentCallbacks(actual) {
  const { row, done } = traceChecks(
    actual,
    'fluent-chai-callbacks',
    passed('creator fluent callback owner', 'foreign fluent callback caller')
  )
  for (const [phaseIndex, phase] of phases.entries()) {
    error(
      row,
      phase,
      { name: 'deep-equal' },
      'AssertionError',
      "expected { nested: Token{ value: 'TOKEN' } } to deeply equal { nested: Token{ value: 'token' } }"
    )
    for (const name of [
      'property-getter',
      'class-instance',
      'regexp-exec',
      'object-include',
    ]) {
      if (name === 'class-instance')
        row({ phase, kind: 'has-instance', sameThis: true, sameSubject: true })
      else if (name === 'regexp-exec')
        row({
          phase,
          kind: 'regexp-exec',
          sameThis: true,
          value: 'real exec value',
        })
      else row({ phase, kind: 'property-getter', sameThis: true })
      row({ phase, name, type: 'object' })
      state(row, phase)
    }
    for (const [name, message] of [
      ['negative-equal', 'expected 1 to equal 2'],
      ['negative-ok', 'expected +0 to be truthy'],
      ['negative-length', 'expected [ 1 ] to have a length of 2 but got 1'],
      ['negative-type', 'expected 2 to be a string'],
    ])
      error(row, phase, { name }, 'AssertionError', message)
    row({ phase, kind: 'counts', owner: 9 * (phaseIndex + 1), caller: 0 })
  }
  done()
}

function hardBuiltins(actual) {
  const { row, done } = traceChecks(
    actual,
    'late-hard-builtins',
    ['creator hard builtin owner', 'foreign hard builtin caller'].map(
      (name) => ({
        name,
        status: 'passed',
        failureCount: 0,
        failureHeaders: [],
      })
    )
  )
  const names = [
    'toBeTypeOf',
    'toBeDefined',
    'toBeUndefined',
    'toBeNull',
    'toBeNaN',
    'toBeTruthy',
    'toBeFalsy',
    'toBeGreaterThan',
    'toBeGreaterThanOrEqual',
    'toBeLessThan',
    'toBeLessThanOrEqual',
    'toBeCloseTo',
    'toBeInstanceOf',
    'toContain',
    'toContainEqual',
    'toHaveLength',
    'toMatch',
  ]
  for (const [phaseIndex, phase] of phases.entries()) {
    for (const [index, name] of names.entries())
      row({
        phase,
        name,
        returnedType: 'object',
        sameReceiver: false,
        absentThen: true,
        ownerCount: phaseIndex * 18 + index + 1,
        callerCount: 0,
      })
    error(
      row,
      phase,
      { kind: 'negative' },
      'AssertionError',
      'expected +0 to not be falsy'
    )
    row({ phase, kind: 'reads', reads: 2 * (phaseIndex + 1) })
    if (phase === 'foreign')
      row({ kind: 'identities', sameOwner: true, differentCaller: true })
  }
  done()
}

function throwReceivers(actual) {
  const { row, done } = traceChecks(
    actual,
    'late-throw-builtin-receivers',
    passed('creator throw receivers', 'foreign throw receivers')
  )
  for (const [phaseIndex, phaseName] of phases.entries()) {
    for (const name of ['toThrow', 'toThrowError']) {
      const phase = `${phaseName}:${name}`
      if (phaseName === 'afterAll' && name === 'toThrow') {
        error(
          row,
          phase,
          { kind: 'original-call' },
          'AssertionError',
          'expected TypeError: receiver throw message to be a function'
        )
      } else {
        row({
          phase,
          kind: 'original-call',
          returnedType: 'object',
          sameReceiver: false,
        })
        row({
          phase,
          kind: 'matcher-state',
          taskA: true,
          taskB: false,
          sameAssertion: true,
        })
      }
      error(
        row,
        phase,
        { kind: 'bound-call' },
        'Error',
        `Invalid Chai property: ${name}.length. See docs for proper usage of "${name}".`
      )
      row({
        phase,
        kind: 'foreign-call',
        returnedType: 'object',
        sameReceiver: false,
      })
      row({
        phase,
        kind: 'matcher-state',
        taskA: false,
        taskB: true,
        sameAssertion: true,
      })
      error(
        row,
        phase,
        { kind: 'bare-call' },
        'TypeError',
        "Cannot read properties of undefined (reading '__flags')"
      )
      error(
        row,
        phase,
        { kind: 'plain-object-call' },
        'TypeError',
        name === 'toThrow'
          ? 'this.throws is not a function'
          : 'this.assert is not a function'
      )
      row({ phase, kind: 'plain-keys', keys: ['__flags'] })
    }
    row({
      phase: phaseName,
      kind: 'counts',
      owner: 2,
      caller: 2 * (phaseIndex + 1),
      reads: 0,
    })
  }
  done()
}

function throwCallbacks(actual) {
  const { row, done } = traceChecks(
    actual,
    'throw-callbacks',
    passed('creator throw callback identity', 'foreign throw callback identity')
  )
  for (const [phaseIndex, phase] of phases.entries()) {
    for (const name of ['toThrow', 'toThrowError']) {
      for (const kind of ['instance', 'asymmetric', 'equality']) {
        row({ phase, kind: 'subject', thisUndefined: true })
        if (kind === 'instance')
          row({
            phase,
            kind: 'has-instance',
            sameClass: true,
            sameThrown: true,
          })
        else if (kind === 'asymmetric')
          row({
            phase,
            kind,
            sameThis: true,
            sameThrown: true,
            testersArray: true,
            testerCount: 2,
          })
        else
          row({
            phase,
            kind: 'custom-tester',
            leftSame: true,
            rightSame: true,
            equalsType: 'function',
          })
        row({
          phase,
          kind: `returned:${kind}`,
          name,
          sameAssertion: false,
          returnedType: 'object',
        })
      }
    }
    row({
      phase,
      kind: 'counts',
      calls: 6 * (phaseIndex + 1),
      ownerCount: 6 * (phaseIndex + 1),
      callerCount: 0,
    })
  }
  done()
}

module.exports = function assertChaiContext(group, actual) {
  switch (group) {
    case 'task-context-chai-chainable-functions':
      chainableFunctions(actual)
      break
    case 'task-context-chai-nested-chainables':
      nestedChainables(actual)
      break
    case 'task-context-chai-chainable-function-receivers':
    case 'task-context-chai-nested-function-receivers':
      functionReceivers(actual, group.slice('task-context-'.length))
      break
    case 'task-context-chai-chainable-raw-alias':
    case 'task-context-chai-nested-raw-alias':
      rawAliases(actual, group.slice('task-context-'.length))
      break
    case 'task-context-chai-hard-fluent':
      hardFluent(actual)
      break
    case 'task-context-chai-fluent-callbacks':
      fluentCallbacks(actual)
      break
    case 'task-context-late-hard-builtins':
      hardBuiltins(actual)
      break
    case 'task-context-throw-builtin-receivers':
      throwReceivers(actual)
      break
    case 'task-context-throw-callbacks':
      throwCallbacks(actual)
      break
    default:
      return false
  }
  return true
}

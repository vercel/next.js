import path from 'node:path'
import type { TestWatchTriggerPattern } from 'next/dist/experimental/testing/config-api'
import {
  evaluateWatchTriggers,
  retainWatchTriggers,
} from 'next/dist/experimental/testing/config-watch-triggers'

it('retains actual root definitions and strips ignored project declarations without mutating authored settings', () => {
  const root = { pattern: /payload/, testsToRun: () => 'alpha.test.mjs' }
  const child = { pattern: /payload/, testsToRun: jest.fn() }
  const value = {
    test: {
      watchTriggerPatterns: [root],
      projects: [{ test: { name: 'child', watchTriggerPatterns: [child] } }],
    },
  }
  const prepared = retainWatchTriggers(value, false)
  expect(prepared.retained?.definitions).toBe(value.test.watchTriggerPatterns)
  expect(prepared.retained?.definitions[0]).toBe(root)
  expect(prepared.value).toEqual({
    test: { projects: [{ test: { name: 'child' } }] },
  })
  expect(value.test.watchTriggerPatterns).toEqual([root])
  expect(value.test.projects[0].test.watchTriggerPatterns).toEqual([child])
  expect(child.testsToRun).not.toHaveBeenCalled()
  expect(retainWatchTriggers(value, true).retained).toBeUndefined()
})

it('preserves the omitted setting and rejects malformed root definition containers', () => {
  const value = { test: { watch: true } }
  expect(retainWatchTriggers(value, false)).toEqual({ value })
  expect(retainWatchTriggers(value, false).value).toBe(value)
  expect(() =>
    retainWatchTriggers({ test: { watchTriggerPatterns: {} } }, false)
  ).toThrow(TypeError)
})

it('preserves actual definition receivers, native matches and counters across evaluations', () => {
  const observations: unknown[] = []
  let count = 0
  const rule: TestWatchTriggerPattern = {
    pattern: /trigger\/(?<name>[^/]+)\.txt$/,
    testsToRun(id, match) {
      observations.push({
        id,
        match: [...match],
        index: match.index,
        input: match.input,
        groups: match.groups,
        nullPrototype: Object.getPrototypeOf(match.groups) === null,
        receiver: this === rule,
        count: ++count,
      })
      return match.groups!.name === 'alpha'
        ? 'alpha.test.mjs'
        : ['alpha.test.mjs', 'beta.test.mjs', 'alpha.test.mjs']
    },
  }
  const retained = { definitions: [rule] }
  expect(
    evaluateWatchTriggers(retained, '/project', ['/project/trigger/alpha.txt'])
  ).toEqual([
    {
      source: '/project/trigger/alpha.txt',
      matched: true,
      tests: ['/project/alpha.test.mjs'],
    },
  ])
  expect(
    evaluateWatchTriggers(retained, '/project', ['/project/trigger/both.txt'])
  ).toEqual([
    {
      source: '/project/trigger/both.txt',
      matched: true,
      tests: ['/project/alpha.test.mjs', '/project/beta.test.mjs'],
    },
  ])
  expect(observations).toEqual([
    {
      id: '/project/trigger/alpha.txt',
      match: ['trigger/alpha.txt', 'alpha'],
      index: 9,
      input: '/project/trigger/alpha.txt',
      groups: { name: 'alpha' },
      nullPrototype: true,
      receiver: true,
      count: 1,
    },
    {
      id: '/project/trigger/both.txt',
      match: ['trigger/both.txt', 'both'],
      index: 9,
      input: '/project/trigger/both.txt',
      groups: { name: 'both' },
      nullPrototype: true,
      receiver: true,
      count: 2,
    },
  ])
})

it('keeps empty-string requests distinct from empty-array suppression', () => {
  const source = '/project/payload.txt'
  expect(
    evaluateWatchTriggers(
      { definitions: [{ pattern: /payload/, testsToRun: () => '' }] },
      '/project',
      [source]
    )
  ).toEqual([{ source, matched: true, tests: [path.resolve('/project')] }])
  expect(
    evaluateWatchTriggers(
      { definitions: [{ pattern: /payload/, testsToRun: () => [] }] },
      '/project',
      [source]
    )
  ).toEqual([{ source, matched: true, tests: [] }])
})

it('continues null rules in source order before deciding whether dependency fallback applies', () => {
  const calls: string[] = []
  const retained = {
    definitions: [
      {
        pattern: /payload/,
        testsToRun() {
          calls.push('first')
          return null
        },
      },
      {
        pattern: /payload/,
        testsToRun() {
          calls.push('later')
          return 'beta.test.mjs'
        },
      },
    ],
  }
  expect(
    evaluateWatchTriggers(retained, '/project', ['/project/payload.txt'])
  ).toEqual([
    {
      source: '/project/payload.txt',
      matched: true,
      tests: ['/project/beta.test.mjs'],
    },
  ])
  expect(calls).toEqual(['first', 'later'])
  expect(
    evaluateWatchTriggers(
      { definitions: [retained.definitions[0]] },
      '/project',
      ['/project/payload.txt']
    )
  ).toEqual([{ source: '/project/payload.txt', matched: false }])
})

it('preserves native global RegExp state rather than resetting or recreating it', () => {
  const pattern = /payload/g
  const mapper = jest.fn(() => 'alpha.test.mjs')
  const retained = { definitions: [{ pattern, testsToRun: mapper }] }
  const source = '/project/payload.txt'
  expect(evaluateWatchTriggers(retained, '/project', [source])[0].matched).toBe(
    true
  )
  expect(pattern.lastIndex).toBe(16)
  expect(evaluateWatchTriggers(retained, '/project', [source])[0].matched).toBe(
    false
  )
  expect(pattern.lastIndex).toBe(0)
  expect(evaluateWatchTriggers(retained, '/project', [source])[0].matched).toBe(
    true
  )
  expect(mapper).toHaveBeenCalledTimes(2)
})

it('propagates the actual mapper Error and stops later rules', () => {
  const error = Object.assign(
    new Error('actual mapper failure', {
      cause: new Error('actual nested reason'),
    }),
    { code: 'ACTUAL_MAPPER_THROW' }
  )
  const later = jest.fn(() => 'beta.test.mjs')
  try {
    evaluateWatchTriggers(
      {
        definitions: [
          {
            pattern: /payload/,
            testsToRun() {
              throw error
            },
          },
          { pattern: /payload/, testsToRun: later },
        ],
      },
      '/project',
      ['/project/payload.txt']
    )
    throw new Error('Expected the actual mapper to throw')
  } catch (actual) {
    expect(actual).toBe(error)
  }
  expect(later).not.toHaveBeenCalled()
  expect(error.code).toBe('ACTUAL_MAPPER_THROW')
  expect(error.cause).toBeInstanceOf(Error)
  expect((error.cause as Error).message).toBe('actual nested reason')
})

it('keeps Promise-returning mappers explicitly outside the qualified synchronous contract', () => {
  const rule = {
    pattern: /payload/,
    testsToRun: () => Promise.resolve('alpha.test.mjs'),
  } as unknown as TestWatchTriggerPattern
  expect(() =>
    evaluateWatchTriggers({ definitions: [rule] }, '/project', [
      '/project/payload.txt',
    ])
  ).toThrow('Promise returns are not implemented')
})

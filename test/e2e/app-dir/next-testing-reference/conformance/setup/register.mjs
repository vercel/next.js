import { afterAll, expect, it } from 'vitest'
import { state } from './state.mjs'

export function register(label) {
  const setupEvents = ['setup:first:start', 'setup:first:ready', 'setup:second']
  if (JSON.stringify(state.events) !== JSON.stringify(setupEvents)) {
    throw new Error('L_SPEC_EVALUATED_BEFORE_SETUP')
  }
  state.events.push(`spec:${label}`)

  it(`runs ordered setup and shared hooks in file ${label}`, () => {
    expect(state.sum).toBe(10)
    expect(state.cases++).toBe(0)
    expect(state.events).toEqual([
      ...setupEvents,
      `spec:${label}`,
      'hook:first',
      'hook:second',
    ])
  })

  afterAll(() => {
    expect(state.cases).toBe(1)
    expect(state.cleanups).toBe(2)
    expect(state.events.slice(6).sort()).toEqual([
      'cleanup:first',
      'cleanup:second',
    ])
  })
}

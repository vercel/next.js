import { expect, test } from 'vitest'
import { state, subject } from './state'

export function register(label) {
  if (state.order.join(',') !== 'first:start,first:end,second') {
    throw new Error('spec evaluated before ordered setup completed')
  }
  if (state.cases !== 0) throw new Error('test cases leaked across files')
  test(label + ' first', () => {
    expect(subject.read()).toBeSetupValue()
    expect(state.order).toContain('first:hook')
    expect(state.order).toContain('second:hook')
    expect(state.cases++).toBe(0)
  })
  test(label + ' second', () => {
    expect(subject.read()).toBeSetupValue()
    expect(state.order).toContain('first:cleanup')
    expect(state.order).toContain('second:cleanup')
    expect(state.cases++).toBe(1)
  })
}

import { test, expect, beforeEach, onTestFinished } from 'vitest'
const trace = []
beforeEach(async () => {
  trace.push('a:start')
  await Promise.resolve()
  trace.push('a:end')
})
beforeEach(async () => {
  trace.push('b:start')
  await Promise.resolve()
  trace.push('b:end')
})
test('the hook concurrency budget queues work before starting its timeout', () => {
  expect(trace).toEqual(['a:start', 'a:end', 'b:start', 'b:end'])
  onTestFinished(async () => {
    expect(trace.slice(4)).toEqual(['finished:b'])
    trace.push('finished:a:start')
    await Promise.resolve()
    trace.push('finished:a:end')
  })
  onTestFinished(() => {
    trace.push('finished:b')
  })
})

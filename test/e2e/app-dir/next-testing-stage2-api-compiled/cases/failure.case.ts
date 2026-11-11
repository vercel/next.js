import { test, expect, onTestFailed } from 'vitest'
test('snapshot failure', () => {
  onTestFailed(() => {
    console.log('C2_FAILURE_LISTENER_EXECUTED')
    throw new Error('failure listener retained')
  })
  expect('different').toMatchSnapshot()
})

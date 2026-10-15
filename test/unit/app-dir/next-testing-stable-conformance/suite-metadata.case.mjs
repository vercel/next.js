import { describe, test, afterAll } from 'vitest'

test('root passes', () => {})
describe('empty', () => {})
describe.skip('skip empty', () => {})
describe.todo('todo empty')
describe('skip case', () => {
  test.skip('skipped', () => {
    throw new Error('must remain skipped')
  })
})
describe('todo case', () => {
  test.todo('todo')
})
describe('hook failure', () => {
  test('nested passes', () => {})
  afterAll(() => {
    throw new Error('nested cleanup failure')
  })
})

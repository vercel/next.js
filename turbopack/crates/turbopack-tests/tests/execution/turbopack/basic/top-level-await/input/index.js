import { CreateUserAction, AlternativeCreateUserAction } from './Actions.js'

it('waits for a module using top-level await', async () => {
  await CreateUserAction('John')
  await AlternativeCreateUserAction('Jane')

  const log = globalThis.topLevelAwaitLog
  // `Actions.js` starts loading `UserAPI.js` when it is evaluated.
  expect(log[0]).toEqual(['connecting to db', 'my-sql://example.com'])
  expect(log).toContainEqual(['Creating user', 'John'])
  // `dbCall` can only be used once the top-level await has finished.
  expect(log.slice(-3)).toEqual([
    ['connected to db', 'my-sql://example.com'],
    ['dbCall', { command: 'CREATE USER John' }],
    ['dbCall', { command: 'CREATE USER Jane' }],
  ])
})

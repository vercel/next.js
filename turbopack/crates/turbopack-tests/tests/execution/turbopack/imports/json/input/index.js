import pkg from './package.json'
import huge from './huge.json'
import { moduleCode } from '../../../__helpers__/module-factories.js'

it('imports a JSON file', () => {
  expect(pkg).toEqual({ name: 'json-execution' })
})

it('imports a huge JSON file', () => {
  expect(huge).toHaveLength(21)
  for (const item of huge) {
    expect(item).toBe('foo'.repeat(170))
  }
})

it('parses a huge JSON file with `JSON.parse`', () => {
  // Parsing a string is faster than evaluating a large object literal.
  expect(moduleCode('huge.json.[json].cjs')).toContain('JSON.parse(')
})

it('throws when importing an invalid JSON file', async () => {
  await expect(import('./invalid.json')).rejects.toThrow(
    'Unable to make a module from invalid JSON: expected `,` or `}` at line 3 column 26'
  )
})

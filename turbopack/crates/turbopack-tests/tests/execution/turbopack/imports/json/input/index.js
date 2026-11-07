import pkg from './package.json'
import huge from './huge.json'

it('imports a JSON file', () => {
  expect(pkg).toEqual({ name: 'json-execution' })
})

it('imports a huge JSON file', () => {
  expect(huge).toHaveLength(21)
  for (const item of huge) {
    expect(item).toBe('foo'.repeat(170))
  }
})

it('throws when importing an invalid JSON file', async () => {
  await expect(import('./invalid.json')).rejects.toThrow(
    'Unable to make a module from invalid JSON: expected `,` or `}` at line 3 column 26'
  )
})

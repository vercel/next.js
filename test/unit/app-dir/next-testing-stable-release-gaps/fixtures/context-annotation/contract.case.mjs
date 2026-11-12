import { test, expect } from 'vitest'
test('annotations retain returned metadata', async ({ annotate }) => {
  const note = await annotate('release evidence', 'issue')
  expect(note).toMatchObject({ message: 'release evidence', type: 'issue' })
  expect(note.location).toBeDefined()
})

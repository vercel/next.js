import { test, expect } from 'vitest'
test(
  'tag metadata merges into task',
  { tags: ['release'], meta: { ticket: 42 } },
  ({ task }) => {
    expect(task.tags).toEqual(['release'])
    expect(task.meta).toMatchObject({ ticket: 42, fromTag: 1 })
  }
)

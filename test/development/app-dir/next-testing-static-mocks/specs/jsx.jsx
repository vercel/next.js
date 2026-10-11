import { test, expect, vi } from 'vitest'
import { observed } from '../subject'
vi.mock('../dependency', () => ({
  value: <span>mock child</span>,
  untouched: 'jsx original',
  fromLeaf: 'jsx leaf',
}))
test('factory JSX uses the actual Next transform', () => {
  expect(observed.value.type).toBe('span')
  expect(observed.value.props.children).toBe('mock child')
})

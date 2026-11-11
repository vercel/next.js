import { bar } from './index.module.css'
import { foo } from './other.module.css'

it('includes class names composed from another CSS module', () => {
  const classes = bar.split(' ')
  expect(classes).toHaveLength(2)
  expect(classes[0]).toMatch(/^[\w-]+_bar$/)
  expect(classes[1]).toBe(foo)
  expect(foo).toMatch(/^[\w-]+_foo$/)
})

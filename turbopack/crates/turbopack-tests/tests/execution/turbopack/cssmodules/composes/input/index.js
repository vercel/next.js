import { className, subClass } from './index.module.css'

it('includes composed class names', () => {
  expect(className).toMatch(/^[\w-]+_className$/)
  const classes = subClass.split(' ')
  expect(classes).toHaveLength(2)
  expect(classes[0]).toMatch(/^[\w-]+_subClass$/)
  expect(classes[1]).toBe(className)
})

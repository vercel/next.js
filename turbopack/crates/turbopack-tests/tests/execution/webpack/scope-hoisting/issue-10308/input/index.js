import { fn } from './root'
import(/* webpackMode: "eager" */ './external')

it('should use the correct names', () => {
  expect(fn()).toBe(42)
})

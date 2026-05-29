import {
  a as a3,
  b as b3,
  local as local3,
  outer as outer3,
} from 'package-reexport'
it('should optimize a used star reexport from module with side effects', () => {
  expect(a3).toBe('a')
  expect(b3).toBe('b')
  expect(local3).toBe('local')
  expect(outer3).toBe('outer')
})

import { outer as outer4 } from 'package-reexport-unused'
it('should optimize a unused star reexport from module with side effects', () => {
  expect(outer4).toBe('outer')
})

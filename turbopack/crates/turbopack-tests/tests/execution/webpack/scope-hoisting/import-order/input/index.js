import './commonjs'
import './module'
import { log } from './tracker'

it('should evaluate import in the correct order', function () {
  expect(log).toEqual(['commonjs', 'module'])
})

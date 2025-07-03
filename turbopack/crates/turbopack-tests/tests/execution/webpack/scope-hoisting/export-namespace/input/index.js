import { ns as ns1 } from './module1'
const ns2 = require('./module2').ns

it('should allow to export a namespace object (concated)', function () {
  expect(ns1).toEqual(
    nsObj({
      a: 'a',
      b: 'b',
    })
  )
})

it('should allow to export a namespace object (exposed)', function () {
  expect(ns2).toEqual(
    nsObj({
      a: 'a',
      b: 'b',
    })
  )
})

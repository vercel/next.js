import './call.js'
import './constructor.js'
import './array.js'

it('should retain effects from iterating spread operands', () => {
  expect(globalThis.__spread_iterator_events?.sort()).toEqual([
    'array:iterator',
    'array:next',
    'call:iterator',
    'call:next',
    'constructor:iterator',
    'constructor:next',
  ])
})

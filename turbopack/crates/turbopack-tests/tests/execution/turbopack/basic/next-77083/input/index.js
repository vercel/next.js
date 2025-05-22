// app/page.js
import { assert } from './assert'

function runGetClassesOrUseCache() {
  use_cache: {
    assert(1, 1)
    if (true) {
      break use_cache
    }
    return 'value a'
  }
  {
    assert(2, 2)
  }

  assert(3, 3)

  return 'value b'
}

it('should handle break label in use_cache', () => {
  expect(runGetClassesOrUseCache()).toBe('value b')
})

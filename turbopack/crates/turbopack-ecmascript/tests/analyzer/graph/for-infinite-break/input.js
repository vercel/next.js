// app/page.js
import { assert } from './assert'

function test(src) {
  for (;;) {
    if (src === '.') {
      break
    }

    return 1
  }

  assert(1, 1)
}

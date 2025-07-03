import { test } from './file1'
import { test as test2 } from './file2'
import { test as test3 } from './file3'
import { test as test4 } from './file4'

var obj = { test, test2, test3, test4 }
var nested = { array: [{ test, test2, test3, test4 }] }

function f(test = test2, { test2: t2 } = { test2 }, { t3 = test3 } = {}) {
  return [test, t2, t3]
}

export default {
  obj,
  nested,
  test,
  test2,
  test3,
  test4,
  f: f(),
}

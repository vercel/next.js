import { double } from './helper'

function unusedInEntry(a, b) {
  const neverRead = a + b
  return a * b
}

console.log(double(21))

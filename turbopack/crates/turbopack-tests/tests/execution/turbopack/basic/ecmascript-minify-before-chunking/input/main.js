import { double } from './helper'

function unusedInEntry(a, b) {
  const neverRead = a + b
  return a * b
}

export const result = double(21)

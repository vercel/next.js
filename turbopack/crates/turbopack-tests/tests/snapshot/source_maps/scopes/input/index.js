import greet, { helper, answer as theAnswer } from './dep.js'
import * as ns from './dep.js'
import { answer as unusedAnswer } from './dep.js'

const prefix = 'result'

function compute(first, { second }) {
  let total = helper(first) + second
  {
    const doubled = total * 2
    try {
      total = doubled + theAnswer
    } catch (err) {
      console.error(err)
    }
  }
  return function inner(extra) {
    return total + extra + ns.answer
  }
}

export class Calculator {
  run(input) {
    return compute(input, { second: 1 })(2)
  }
}

export const arrow = (x) => x + 1

console.log(prefix, greet('world'), new Calculator().run(3), arrow(1), ns)

import { Component } from './component.jsx'
console.log(Component)

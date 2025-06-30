/// <reference types="./top-parser.d.ts" />
import { TopNode } from '../operation-node/top-node.js'
import { isBigInt, isNumber, isUndefined } from '../util/object-utils.js'
export function parseTop(expression, modifiers) {
  if (!isNumber(expression) && !isBigInt(expression)) {
    throw new Error(`Invalid top expression: ${expression}`)
  }
  if (!isUndefined(modifiers) && !isTopModifiers(modifiers)) {
    throw new Error(`Invalid top modifiers: ${modifiers}`)
  }
  return TopNode.create(expression, modifiers)
}
function isTopModifiers(modifiers) {
  return (
    modifiers === 'percent' ||
    modifiers === 'with ties' ||
    modifiers === 'percent with ties'
  )
}

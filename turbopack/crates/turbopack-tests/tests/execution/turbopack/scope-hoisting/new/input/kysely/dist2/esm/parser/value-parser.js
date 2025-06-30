/// <reference types="./value-parser.d.ts" />
// import { PrimitiveValueListNode } from '../operation-node/primitive-value-list-node.js';
// import { ValueListNode } from '../operation-node/value-list-node.js';
// import { ValueNode } from '../operation-node/value-node.js';
import {
  isBoolean,
  isNull,
  isNumber,
  isReadonlyArray,
} from '../util/object-utils.js'
import { parseExpression, isExpressionOrFactory } from './expression-parser.js'
export function parseValueExpressionOrList(arg) {
  if (isReadonlyArray(arg)) {
    return parseValueExpressionList(arg)
  }
  return parseValueExpression(arg)
}
export function parseValueExpression(exp) {
  if (isExpressionOrFactory(exp)) {
    return parseExpression(exp)
  }
  return ValueNode.create(exp)
}
export function isSafeImmediateValue(value) {
  return isNumber(value) || isBoolean(value) || isNull(value)
}
export function parseSafeImmediateValue(value) {
  if (!isSafeImmediateValue(value)) {
    throw new Error(`unsafe immediate value ${JSON.stringify(value)}`)
  }
  return ValueNode.createImmediate(value)
}
function parseValueExpressionList(arg) {
  if (arg.some(isExpressionOrFactory)) {
    return ValueListNode.create(arg.map((it) => parseValueExpression(it)))
  }
  return PrimitiveValueListNode.create(arg)
}

/// <reference types="./expression.d.ts" />
import { isOperationNodeSource } from '../operation-node/operation-node-source.js'
import { isObject, isString } from '../util/object-utils.js'
export function isExpression(obj) {
  return isObject(obj) && 'expressionType' in obj && isOperationNodeSource(obj)
}
export function isAliasedExpression(obj) {
  return (
    isObject(obj) &&
    'expression' in obj &&
    isString(obj.alias) &&
    isOperationNodeSource(obj)
  )
}

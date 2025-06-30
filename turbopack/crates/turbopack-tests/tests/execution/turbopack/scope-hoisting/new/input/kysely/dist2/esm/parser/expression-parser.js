/// <reference types="./expression-parser.d.ts" />
// import { isAliasedExpression, isExpression, } from '../expression/expression.js';
// import { isOperationNodeSource } from '../operation-node/operation-node-source.js';
import { expressionBuilder } from '../expression/expression-builder.js'
// import { isFunction } from '../util/object-utils.js';
export function parseExpression(exp) {
  if (isOperationNodeSource(exp)) {
    return exp.toOperationNode()
  } else if (isFunction(exp)) {
    return exp(expressionBuilder()).toOperationNode()
  }
  throw new Error(`invalid expression: ${JSON.stringify(exp)}`)
}
export function parseAliasedExpression(exp) {
  if (isOperationNodeSource(exp)) {
    return exp.toOperationNode()
  } else if (isFunction(exp)) {
    return exp(expressionBuilder()).toOperationNode()
  }
  throw new Error(`invalid aliased expression: ${JSON.stringify(exp)}`)
}
export function isExpressionOrFactory(obj) {
  return isExpression(obj) || isAliasedExpression(obj) || isFunction(obj)
}

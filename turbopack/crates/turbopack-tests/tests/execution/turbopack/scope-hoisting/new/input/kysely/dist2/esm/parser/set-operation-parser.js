/// <reference types="./set-operation-parser.d.ts" />
import { createExpressionBuilder } from '../expression/expression-builder.js'
import { SetOperationNode } from '../operation-node/set-operation-node.js'
import { isFunction, isReadonlyArray } from '../util/object-utils.js'
import { parseExpression } from './expression-parser.js'
export function parseSetOperations(operator, expression, all) {
  if (isFunction(expression)) {
    expression = expression(createExpressionBuilder())
  }
  if (!isReadonlyArray(expression)) {
    expression = [expression]
  }
  return expression.map((expr) =>
    SetOperationNode.create(operator, parseExpression(expr), all)
  )
}

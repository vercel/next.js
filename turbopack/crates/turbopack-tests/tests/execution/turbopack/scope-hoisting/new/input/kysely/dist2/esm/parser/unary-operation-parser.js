/// <reference types="./unary-operation-parser.d.ts" />
import { OperatorNode } from '../operation-node/operator-node.js'
import { UnaryOperationNode } from '../operation-node/unary-operation-node.js'
import { parseReferenceExpression } from './reference-parser.js'
export function parseExists(operand) {
  return parseUnaryOperation('exists', operand)
}
export function parseNotExists(operand) {
  return parseUnaryOperation('not exists', operand)
}
export function parseUnaryOperation(operator, operand) {
  return UnaryOperationNode.create(
    OperatorNode.create(operator),
    parseReferenceExpression(operand)
  )
}

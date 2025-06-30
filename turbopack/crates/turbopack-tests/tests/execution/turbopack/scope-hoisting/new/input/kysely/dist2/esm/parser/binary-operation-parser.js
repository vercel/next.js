/// <reference types="./binary-operation-parser.d.ts" />
import { BinaryOperationNode } from '../operation-node/binary-operation-node.js'
import {
  isBoolean,
  isNull,
  isString,
  isUndefined,
} from '../util/object-utils.js'
import { isOperationNodeSource } from '../operation-node/operation-node-source.js'
import { OperatorNode, OPERATORS } from '../operation-node/operator-node.js'
import { parseReferenceExpression } from './reference-parser.js'
import {
  parseValueExpression,
  parseValueExpressionOrList,
} from './value-parser.js'
import { ValueNode } from '../operation-node/value-node.js'
import { AndNode } from '../operation-node/and-node.js'
import { ParensNode } from '../operation-node/parens-node.js'
import { OrNode } from '../operation-node/or-node.js'
export function parseValueBinaryOperationOrExpression(args) {
  if (args.length === 3) {
    return parseValueBinaryOperation(args[0], args[1], args[2])
  } else if (args.length === 1) {
    return parseValueExpression(args[0])
  }
  throw new Error(`invalid arguments: ${JSON.stringify(args)}`)
}
export function parseValueBinaryOperation(left, operator, right) {
  if (isIsOperator(operator) && needsIsOperator(right)) {
    return BinaryOperationNode.create(
      parseReferenceExpression(left),
      parseOperator(operator),
      ValueNode.createImmediate(right)
    )
  }
  return BinaryOperationNode.create(
    parseReferenceExpression(left),
    parseOperator(operator),
    parseValueExpressionOrList(right)
  )
}
export function parseReferentialBinaryOperation(left, operator, right) {
  return BinaryOperationNode.create(
    parseReferenceExpression(left),
    parseOperator(operator),
    parseReferenceExpression(right)
  )
}
export function parseFilterObject(obj, combinator) {
  return parseFilterList(
    Object.entries(obj)
      .filter(([, v]) => !isUndefined(v))
      .map(([k, v]) =>
        parseValueBinaryOperation(k, needsIsOperator(v) ? 'is' : '=', v)
      ),
    combinator
  )
}
export function parseFilterList(list, combinator, withParens = true) {
  const combine = combinator === 'and' ? AndNode.create : OrNode.create
  if (list.length === 0) {
    return BinaryOperationNode.create(
      ValueNode.createImmediate(1),
      OperatorNode.create('='),
      ValueNode.createImmediate(combinator === 'and' ? 1 : 0)
    )
  }
  let node = toOperationNode(list[0])
  for (let i = 1; i < list.length; ++i) {
    node = combine(node, toOperationNode(list[i]))
  }
  if (list.length > 1 && withParens) {
    return ParensNode.create(node)
  }
  return node
}
function isIsOperator(operator) {
  return operator === 'is' || operator === 'is not'
}
function needsIsOperator(value) {
  return isNull(value) || isBoolean(value)
}
function parseOperator(operator) {
  if (isString(operator) && OPERATORS.includes(operator)) {
    return OperatorNode.create(operator)
  }
  if (isOperationNodeSource(operator)) {
    return operator.toOperationNode()
  }
  throw new Error(`invalid operator ${JSON.stringify(operator)}`)
}
function toOperationNode(nodeOrSource) {
  return isOperationNodeSource(nodeOrSource)
    ? nodeOrSource.toOperationNode()
    : nodeOrSource
}

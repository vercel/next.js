/// <reference types="./reference-parser.d.ts" />
import { AliasNode } from '../operation-node/alias-node.js'
import { ColumnNode } from '../operation-node/column-node.js'
import { ReferenceNode } from '../operation-node/reference-node.js'
import { TableNode } from '../operation-node/table-node.js'
import { isReadonlyArray, isString } from '../util/object-utils.js'
import { parseExpression, isExpressionOrFactory } from './expression-parser.js'
import { IdentifierNode } from '../operation-node/identifier-node.js'
import { isOrderByDirection, parseOrderBy } from './order-by-parser.js'
import {
  OperatorNode,
  isJSONOperator,
} from '../operation-node/operator-node.js'
import { JSONReferenceNode } from '../operation-node/json-reference-node.js'
import { JSONOperatorChainNode } from '../operation-node/json-operator-chain-node.js'
import { JSONPathNode } from '../operation-node/json-path-node.js'
export function parseSimpleReferenceExpression(exp) {
  if (isString(exp)) {
    return parseStringReference(exp)
  }
  return exp.toOperationNode()
}
export function parseReferenceExpressionOrList(arg) {
  if (isReadonlyArray(arg)) {
    return arg.map((it) => parseReferenceExpression(it))
  } else {
    return [parseReferenceExpression(arg)]
  }
}
export function parseReferenceExpression(exp) {
  if (isExpressionOrFactory(exp)) {
    return parseExpression(exp)
  }
  return parseSimpleReferenceExpression(exp)
}
export function parseJSONReference(ref, op) {
  const referenceNode = parseStringReference(ref)
  if (isJSONOperator(op)) {
    return JSONReferenceNode.create(
      referenceNode,
      JSONOperatorChainNode.create(OperatorNode.create(op))
    )
  }
  const opWithoutLastChar = op.slice(0, -1)
  if (isJSONOperator(opWithoutLastChar)) {
    return JSONReferenceNode.create(
      referenceNode,
      JSONPathNode.create(OperatorNode.create(opWithoutLastChar))
    )
  }
  throw new Error(`Invalid JSON operator: ${op}`)
}
export function parseStringReference(ref) {
  const COLUMN_SEPARATOR = '.'
  if (!ref.includes(COLUMN_SEPARATOR)) {
    return ReferenceNode.create(ColumnNode.create(ref))
  }
  const parts = ref.split(COLUMN_SEPARATOR).map(trim)
  if (parts.length === 3) {
    return parseStringReferenceWithTableAndSchema(parts)
  }
  if (parts.length === 2) {
    return parseStringReferenceWithTable(parts)
  }
  throw new Error(`invalid column reference ${ref}`)
}
export function parseAliasedStringReference(ref) {
  const ALIAS_SEPARATOR = ' as '
  if (ref.includes(ALIAS_SEPARATOR)) {
    const [columnRef, alias] = ref.split(ALIAS_SEPARATOR).map(trim)
    return AliasNode.create(
      parseStringReference(columnRef),
      IdentifierNode.create(alias)
    )
  } else {
    return parseStringReference(ref)
  }
}
export function parseColumnName(column) {
  return ColumnNode.create(column)
}
export function parseOrderedColumnName(column) {
  const ORDER_SEPARATOR = ' '
  if (column.includes(ORDER_SEPARATOR)) {
    const [columnName, order] = column.split(ORDER_SEPARATOR).map(trim)
    if (!isOrderByDirection(order)) {
      throw new Error(
        `invalid order direction "${order}" next to "${columnName}"`
      )
    }
    return parseOrderBy([columnName, order])[0]
  } else {
    return parseColumnName(column)
  }
}
function parseStringReferenceWithTableAndSchema(parts) {
  const [schema, table, column] = parts
  return ReferenceNode.create(
    ColumnNode.create(column),
    TableNode.createWithSchema(schema, table)
  )
}
function parseStringReferenceWithTable(parts) {
  const [table, column] = parts
  return ReferenceNode.create(
    ColumnNode.create(column),
    TableNode.create(table)
  )
}
function trim(str) {
  return str.trim()
}

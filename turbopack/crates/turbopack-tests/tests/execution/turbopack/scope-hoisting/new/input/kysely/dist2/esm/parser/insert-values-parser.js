/// <reference types="./insert-values-parser.d.ts" />
import { ColumnNode } from '../operation-node/column-node.js'
import { PrimitiveValueListNode } from '../operation-node/primitive-value-list-node.js'
import { ValueListNode } from '../operation-node/value-list-node.js'
import {
  freeze,
  isFunction,
  isReadonlyArray,
  isUndefined,
} from '../util/object-utils.js'
import { parseValueExpression } from './value-parser.js'
import { ValuesNode } from '../operation-node/values-node.js'
import { isExpressionOrFactory } from './expression-parser.js'
import { DefaultInsertValueNode } from '../operation-node/default-insert-value-node.js'
import { expressionBuilder } from '../expression/expression-builder.js'
export function parseInsertExpression(arg) {
  const objectOrList = isFunction(arg) ? arg(expressionBuilder()) : arg
  const list = isReadonlyArray(objectOrList)
    ? objectOrList
    : freeze([objectOrList])
  return parseInsertColumnsAndValues(list)
}
function parseInsertColumnsAndValues(rows) {
  const columns = parseColumnNamesAndIndexes(rows)
  return [
    freeze([...columns.keys()].map(ColumnNode.create)),
    ValuesNode.create(rows.map((row) => parseRowValues(row, columns))),
  ]
}
function parseColumnNamesAndIndexes(rows) {
  const columns = new Map()
  for (const row of rows) {
    const cols = Object.keys(row)
    for (const col of cols) {
      if (!columns.has(col) && row[col] !== undefined) {
        columns.set(col, columns.size)
      }
    }
  }
  return columns
}
function parseRowValues(row, columns) {
  const rowColumns = Object.keys(row)
  const rowValues = Array.from({
    length: columns.size,
  })
  let hasUndefinedOrComplexColumns = false
  let indexedRowColumns = rowColumns.length
  for (const col of rowColumns) {
    const columnIdx = columns.get(col)
    if (isUndefined(columnIdx)) {
      indexedRowColumns--
      continue
    }
    const value = row[col]
    if (isUndefined(value) || isExpressionOrFactory(value)) {
      hasUndefinedOrComplexColumns = true
    }
    rowValues[columnIdx] = value
  }
  const hasMissingColumns = indexedRowColumns < columns.size
  if (hasMissingColumns || hasUndefinedOrComplexColumns) {
    const defaultValue = DefaultInsertValueNode.create()
    return ValueListNode.create(
      rowValues.map((it) =>
        isUndefined(it) ? defaultValue : parseValueExpression(it)
      )
    )
  }
  return PrimitiveValueListNode.create(rowValues)
}

/// <reference types="./update-set-parser.d.ts" />
import { ColumnNode } from '../operation-node/column-node.js'
import { ColumnUpdateNode } from '../operation-node/column-update-node.js'
import { expressionBuilder } from '../expression/expression-builder.js'
import { isFunction } from '../util/object-utils.js'
import { parseValueExpression } from './value-parser.js'
import { parseReferenceExpression } from './reference-parser.js'
export function parseUpdate(...args) {
  if (args.length === 2) {
    return [
      ColumnUpdateNode.create(
        parseReferenceExpression(args[0]),
        parseValueExpression(args[1])
      ),
    ]
  }
  return parseUpdateObjectExpression(args[0])
}
export function parseUpdateObjectExpression(update) {
  const updateObj = isFunction(update) ? update(expressionBuilder()) : update
  return Object.entries(updateObj)
    .filter(([_, value]) => value !== undefined)
    .map(([key, value]) => {
      return ColumnUpdateNode.create(
        ColumnNode.create(key),
        parseValueExpression(value)
      )
    })
}

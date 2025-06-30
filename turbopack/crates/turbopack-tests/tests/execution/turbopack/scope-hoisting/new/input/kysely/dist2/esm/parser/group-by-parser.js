/// <reference types="./group-by-parser.d.ts" />
import { GroupByItemNode } from '../operation-node/group-by-item-node.js'
import { expressionBuilder } from '../expression/expression-builder.js'
import { isFunction } from '../util/object-utils.js'
import { parseReferenceExpressionOrList } from './reference-parser.js'
export function parseGroupBy(groupBy) {
  groupBy = isFunction(groupBy) ? groupBy(expressionBuilder()) : groupBy
  return parseReferenceExpressionOrList(groupBy).map(GroupByItemNode.create)
}

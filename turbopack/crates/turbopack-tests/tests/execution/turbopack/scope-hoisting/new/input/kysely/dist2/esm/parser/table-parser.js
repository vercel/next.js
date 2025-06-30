/// <reference types="./table-parser.d.ts" />
import { isReadonlyArray, isString } from '../util/object-utils.js'
import { AliasNode } from '../operation-node/alias-node.js'
import { TableNode } from '../operation-node/table-node.js'
import { parseAliasedExpression } from './expression-parser.js'
import { IdentifierNode } from '../operation-node/identifier-node.js'
import { isAliasedDynamicTableBuilder } from '../dynamic/dynamic-table-builder.js'
export function parseTableExpressionOrList(table) {
  if (isReadonlyArray(table)) {
    return table.map((it) => parseTableExpression(it))
  } else {
    return [parseTableExpression(table)]
  }
}
export function parseTableExpression(table) {
  if (isString(table)) {
    return parseAliasedTable(table)
  } else if (isAliasedDynamicTableBuilder(table)) {
    return table.toOperationNode()
  } else {
    return parseAliasedExpression(table)
  }
}
export function parseAliasedTable(from) {
  const ALIAS_SEPARATOR = ' as '
  if (from.includes(ALIAS_SEPARATOR)) {
    const [table, alias] = from.split(ALIAS_SEPARATOR).map(trim)
    return AliasNode.create(parseTable(table), IdentifierNode.create(alias))
  } else {
    return parseTable(from)
  }
}
export function parseTable(from) {
  const SCHEMA_SEPARATOR = '.'
  if (from.includes(SCHEMA_SEPARATOR)) {
    const [schema, table] = from.split(SCHEMA_SEPARATOR).map(trim)
    return TableNode.createWithSchema(schema, table)
  } else {
    return TableNode.create(from)
  }
}
function trim(str) {
  return str.trim()
}

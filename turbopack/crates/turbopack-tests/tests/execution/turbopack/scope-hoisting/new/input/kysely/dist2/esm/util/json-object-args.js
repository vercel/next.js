/// <reference types="./json-object-args.d.ts" />
import { ExpressionWrapper } from '../expression/expression-wrapper.js'
import { AliasNode } from '../operation-node/alias-node.js'
import { ColumnNode } from '../operation-node/column-node.js'
import { IdentifierNode } from '../operation-node/identifier-node.js'
import { ReferenceNode } from '../operation-node/reference-node.js'
import { TableNode } from '../operation-node/table-node.js'
import { ValueNode } from '../operation-node/value-node.js'
export function getJsonObjectArgs(node, table) {
  const args = []
  for (const { selection: s } of node.selections ?? []) {
    if (ReferenceNode.is(s) && ColumnNode.is(s.column)) {
      args.push(
        colName(s.column.column.name),
        colRef(table, s.column.column.name)
      )
    } else if (ColumnNode.is(s)) {
      args.push(colName(s.column.name), colRef(table, s.column.name))
    } else if (AliasNode.is(s) && IdentifierNode.is(s.alias)) {
      args.push(colName(s.alias.name), colRef(table, s.alias.name))
    } else {
      throw new Error(`can't extract column names from the select query node`)
    }
  }
  return args
}
function colName(col) {
  return new ExpressionWrapper(ValueNode.createImmediate(col))
}
function colRef(table, col) {
  return new ExpressionWrapper(
    ReferenceNode.create(ColumnNode.create(col), TableNode.create(table))
  )
}

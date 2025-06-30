/// <reference types="./select-parser.d.ts" />
// import { isFunction, isReadonlyArray, isString } from '../util/object-utils.js';
// import { SelectionNode } from '../operation-node/selection-node.js';
// import { parseAliasedStringReference } from './reference-parser.js';
// import { isDynamicReferenceBuilder, } from '../dynamic/dynamic-reference-builder.js';
import { parseAliasedExpression } from './expression-parser.js'
// import { parseTable } from './table-parser.js';
import { expressionBuilder } from '../expression/expression-builder.js'
export function parseSelectArg(selection) {
  if (isFunction(selection)) {
    return parseSelectArg(selection(expressionBuilder()))
  } else if (isReadonlyArray(selection)) {
    return selection.map((it) => parseSelectExpression(it))
  } else {
    return [parseSelectExpression(selection)]
  }
}
function parseSelectExpression(selection) {
  if (isString(selection)) {
    return SelectionNode.create(parseAliasedStringReference(selection))
  } else if (isDynamicReferenceBuilder(selection)) {
    return SelectionNode.create(selection.toOperationNode())
  } else {
    return SelectionNode.create(parseAliasedExpression(selection))
  }
}
export function parseSelectAll(table) {
  if (!table) {
    return [SelectionNode.createSelectAll()]
  } else if (Array.isArray(table)) {
    return table.map(parseSelectAllArg)
  } else {
    return [parseSelectAllArg(table)]
  }
}
function parseSelectAllArg(table) {
  if (isString(table)) {
    return SelectionNode.createSelectAllFromTable(parseTable(table))
  }
  throw new Error(
    `invalid value selectAll expression: ${JSON.stringify(table)}`
  )
}

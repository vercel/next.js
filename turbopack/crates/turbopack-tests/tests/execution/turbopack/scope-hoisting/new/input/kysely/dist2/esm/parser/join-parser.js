/// <reference types="./join-parser.d.ts" />
import { JoinNode } from '../operation-node/join-node.js'
import { parseReferentialBinaryOperation } from './binary-operation-parser.js'
import { createJoinBuilder } from './parse-utils.js'
import { parseTableExpression } from './table-parser.js'
export function parseJoin(joinType, args) {
  if (args.length === 3) {
    return parseSingleOnJoin(joinType, args[0], args[1], args[2])
  } else if (args.length === 2) {
    return parseCallbackJoin(joinType, args[0], args[1])
  } else if (args.length === 1) {
    return parseOnlessJoin(joinType, args[0])
  } else {
    throw new Error('not implemented')
  }
}
function parseCallbackJoin(joinType, from, callback) {
  return callback(createJoinBuilder(joinType, from)).toOperationNode()
}
function parseSingleOnJoin(joinType, from, lhsColumn, rhsColumn) {
  return JoinNode.createWithOn(
    joinType,
    parseTableExpression(from),
    parseReferentialBinaryOperation(lhsColumn, '=', rhsColumn)
  )
}
function parseOnlessJoin(joinType, from) {
  return JoinNode.create(joinType, parseTableExpression(from))
}

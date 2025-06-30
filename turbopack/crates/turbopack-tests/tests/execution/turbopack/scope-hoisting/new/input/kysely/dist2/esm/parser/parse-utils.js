/// <reference types="./parse-utils.d.ts" />
import { JoinNode } from '../operation-node/join-node.js'
import { OverNode } from '../operation-node/over-node.js'
import { SelectQueryNode } from '../operation-node/select-query-node.js'
import { JoinBuilder } from '../query-builder/join-builder.js'
import { OverBuilder } from '../query-builder/over-builder.js'
import { createSelectQueryBuilder as newSelectQueryBuilder } from '../query-builder/select-query-builder.js'
import { QueryCreator } from '../query-creator.js'
import { NOOP_QUERY_EXECUTOR } from '../query-executor/noop-query-executor.js'
import { createQueryId } from '../util/query-id.js'
import {
  parseTableExpression,
  parseTableExpressionOrList,
} from './table-parser.js'
export function createSelectQueryBuilder() {
  return newSelectQueryBuilder({
    queryId: createQueryId(),
    executor: NOOP_QUERY_EXECUTOR,
    queryNode: SelectQueryNode.createFrom(parseTableExpressionOrList([])),
  })
}
export function createQueryCreator() {
  return new QueryCreator({
    executor: NOOP_QUERY_EXECUTOR,
  })
}
export function createJoinBuilder(joinType, table) {
  return new JoinBuilder({
    joinNode: JoinNode.create(joinType, parseTableExpression(table)),
  })
}
export function createOverBuilder() {
  return new OverBuilder({
    overNode: OverNode.create(),
  })
}

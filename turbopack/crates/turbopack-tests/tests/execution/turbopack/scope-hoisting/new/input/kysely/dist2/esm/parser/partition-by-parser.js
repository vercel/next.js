/// <reference types="./partition-by-parser.d.ts" />
import { PartitionByItemNode } from '../operation-node/partition-by-item-node.js'
import { parseReferenceExpressionOrList } from './reference-parser.js'
export function parsePartitionBy(partitionBy) {
  return parseReferenceExpressionOrList(partitionBy).map(
    PartitionByItemNode.create
  )
}

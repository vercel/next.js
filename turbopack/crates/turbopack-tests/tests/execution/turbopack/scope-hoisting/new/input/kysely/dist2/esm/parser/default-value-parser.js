/// <reference types="./default-value-parser.d.ts" />
import { isOperationNodeSource } from '../operation-node/operation-node-source.js'
import { ValueNode } from '../operation-node/value-node.js'
export function parseDefaultValueExpression(value) {
  return isOperationNodeSource(value)
    ? value.toOperationNode()
    : ValueNode.createImmediate(value)
}

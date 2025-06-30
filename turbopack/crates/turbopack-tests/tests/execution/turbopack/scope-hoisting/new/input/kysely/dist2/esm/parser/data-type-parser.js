/// <reference types="./data-type-parser.d.ts" />
import {
  DataTypeNode,
  isColumnDataType,
} from '../operation-node/data-type-node.js'
import { isOperationNodeSource } from '../operation-node/operation-node-source.js'
export function parseDataTypeExpression(dataType) {
  if (isOperationNodeSource(dataType)) {
    return dataType.toOperationNode()
  }
  if (isColumnDataType(dataType)) {
    return DataTypeNode.create(dataType)
  }
  throw new Error(`invalid column data type ${JSON.stringify(dataType)}`)
}

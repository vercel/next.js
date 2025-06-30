/// <reference types="./with-parser.d.ts" />
import { CommonTableExpressionNameNode } from '../operation-node/common-table-expression-name-node.js'
import { createQueryCreator } from './parse-utils.js'
import { isFunction } from '../util/object-utils.js'
import { CTEBuilder } from '../query-builder/cte-builder.js'
import { CommonTableExpressionNode } from '../operation-node/common-table-expression-node.js'
export function parseCommonTableExpression(nameOrBuilderCallback, expression) {
  const expressionNode = expression(createQueryCreator()).toOperationNode()
  if (isFunction(nameOrBuilderCallback)) {
    return nameOrBuilderCallback(
      cteBuilderFactory(expressionNode)
    ).toOperationNode()
  }
  return CommonTableExpressionNode.create(
    parseCommonTableExpressionName(nameOrBuilderCallback),
    expressionNode
  )
}
function cteBuilderFactory(expressionNode) {
  return (name) => {
    return new CTEBuilder({
      node: CommonTableExpressionNode.create(
        parseCommonTableExpressionName(name),
        expressionNode
      ),
    })
  }
}
function parseCommonTableExpressionName(name) {
  if (name.includes('(')) {
    const parts = name.split(/[\(\)]/)
    const table = parts[0]
    const columns = parts[1].split(',').map((it) => it.trim())
    return CommonTableExpressionNameNode.create(table, columns)
  } else {
    return CommonTableExpressionNameNode.create(name)
  }
}

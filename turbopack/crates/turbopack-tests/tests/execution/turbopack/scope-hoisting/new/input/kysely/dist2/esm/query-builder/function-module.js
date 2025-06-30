/// <reference types="./function-module.d.ts" />
// import { ExpressionWrapper } from '../expression/expression-wrapper.js';
// import { AggregateFunctionNode } from '../operation-node/aggregate-function-node.js';
// import { FunctionNode } from '../operation-node/function-node.js';
// import { parseReferenceExpressionOrList, } from '../parser/reference-parser.js';
import { parseSelectAll } from '../parser/select-parser.js'
// import { AggregateFunctionBuilder } from './aggregate-function-builder.js';
// import { isString } from '../util/object-utils.js';
// import { parseTable } from '../parser/table-parser.js';
export function createFunctionModule() {
  const fn = (name, args) => {
    return new ExpressionWrapper(
      FunctionNode.create(name, parseReferenceExpressionOrList(args ?? []))
    )
  }
  const agg = (name, args) => {
    return new AggregateFunctionBuilder({
      aggregateFunctionNode: AggregateFunctionNode.create(
        name,
        args ? parseReferenceExpressionOrList(args) : undefined
      ),
    })
  }
  return Object.assign(fn, {
    agg,
    avg(column) {
      return agg('avg', [column])
    },
    coalesce(...values) {
      return fn('coalesce', values)
    },
    count(column) {
      return agg('count', [column])
    },
    countAll(table) {
      return new AggregateFunctionBuilder({
        aggregateFunctionNode: AggregateFunctionNode.create(
          'count',
          parseSelectAll(table)
        ),
      })
    },
    max(column) {
      return agg('max', [column])
    },
    min(column) {
      return agg('min', [column])
    },
    sum(column) {
      return agg('sum', [column])
    },
    any(column) {
      return fn('any', [column])
    },
    jsonAgg(table) {
      return new AggregateFunctionBuilder({
        aggregateFunctionNode: AggregateFunctionNode.create('json_agg', [
          isString(table) ? parseTable(table) : table.toOperationNode(),
        ]),
      })
    },
    toJson(table) {
      return new ExpressionWrapper(
        FunctionNode.create('to_json', [
          isString(table) ? parseTable(table) : table.toOperationNode(),
        ])
      )
    },
  })
}
